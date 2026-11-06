import { Worker } from 'bullmq';
import { createDb, setScanStatus } from '@redline/db';
import { createRefereeEngine } from '@redline/engine';
import { OGRouterClient } from '@redline/hunters';
import { createRedis } from './connection.js';
import { scanEventPublisher, redisEmit } from './scan-events-pub.js';
import { scanQueueName, type ScanJobData } from './queue.js';
import { runScan, type PipelineDeps } from './pipeline.js';
import { gitPrepare } from './prepare.js';

/**
 * Mark a scan failed after its job errored, so the dashboard and the live scan view
 * (whose poll treats 'failed' as terminal) stop waiting on it. A no-op if the scan
 * row is gone. Separated out so the error path is unit-testable without BullMQ.
 */
export async function markScanFailed(
  db: ReturnType<typeof createDb>['db'],
  scanId: string,
): Promise<void> {
  await setScanStatus(db, scanId, 'failed', { finishedAt: new Date() });
}

/**
 * The scan worker. Pulls scan jobs off the queue and runs the pipeline. In a
 * real deployment each job runs inside its own sealed sandbox.
 */
export function startWorker(overrides: Partial<PipelineDeps> = {}): Worker<ScanJobData> {
  // Only open a connection from DATABASE_URL when the caller did not supply one
  // (e.g. tests and embedders pass their own db); avoids requiring DATABASE_URL then.
  const db = overrides.db ?? createDb().db;

  const worker = new Worker<ScanJobData>(
    scanQueueName(),
    async (job) => {
      const engine = overrides.engine ?? (await createRefereeEngine());
      const client = overrides.client ?? new OGRouterClient();
      // Publish live events to the same Redis channel the web app subscribes to,
      // so real worker scans stream into the live scan room — not only the demo.
      // A caller-supplied emit (tests) wins; otherwise open a short-lived publisher
      // for this job and close it when the scan finishes.
      const pub = overrides.emit ? null : scanEventPublisher();
      const deps: PipelineDeps = {
        db,
        client,
        engine,
        prepare: overrides.prepare ?? gitPrepare,
        council: overrides.council,
        emit: overrides.emit ?? (pub ? redisEmit(pub) : undefined),
      };
      try {
        return await runScan(deps, job.data.scanId);
      } finally {
        if (pub) await pub.quit().catch(() => undefined);
      }
    },
    { connection: createRedis(), concurrency: Number(process.env.SCAN_CONCURRENCY ?? 2) },
  );

  worker.on('failed', async (job, err) => {
    console.error(`[worker] scan ${job?.data.scanId} failed:`, err.message);
    // Mark the scan failed so the dashboard and the live scan view stop waiting on
    // it (the live feed's poll treats 'failed' as terminal). This runs only when the
    // job actually threw; a cancelled scan returns normally and completes the job, so
    // it reaches the 'completed' path and never clobbers its 'cancelled' state here.
    const scanId = job?.data.scanId;
    if (scanId) {
      try {
        await markScanFailed(db, scanId);
      } catch (e) {
        console.error(`[worker] could not mark scan ${scanId} failed:`, (e as Error).message);
      }
    }
  });
  return worker;
}

// Run standalone: `tsx src/processor.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
  console.log('[worker] listening on', scanQueueName());
}
