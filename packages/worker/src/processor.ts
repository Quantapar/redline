import { Worker } from 'bullmq';
import { createDb } from '@redline/db';
import { createRefereeEngine } from '@redline/engine';
import { OGRouterClient } from '@redline/hunters';
import { createRedis } from './connection.js';
import { SCAN_QUEUE, type ScanJobData } from './queue.js';
import { runScan, type PipelineDeps } from './pipeline.js';
import { gitPrepare } from './prepare.js';

/**
 * The scan worker. Pulls scan jobs off the queue and runs the pipeline. In a
 * real deployment each job runs inside its own sealed sandbox.
 */
export function startWorker(overrides: Partial<PipelineDeps> = {}): Worker<ScanJobData> {
  const { db } = createDb();

  const worker = new Worker<ScanJobData>(
    SCAN_QUEUE,
    async (job) => {
      const engine = overrides.engine ?? (await createRefereeEngine());
      const client = overrides.client ?? new OGRouterClient();
      const deps: PipelineDeps = {
        db: overrides.db ?? db,
        client,
        engine,
        prepare: overrides.prepare ?? gitPrepare,
        council: overrides.council,
        emit: overrides.emit,
      };
      return runScan(deps, job.data.scanId);
    },
    { connection: createRedis(), concurrency: Number(process.env.SCAN_CONCURRENCY ?? 2) },
  );

  worker.on('failed', (job, err) => {
    console.error(`[worker] scan ${job?.data.scanId} failed:`, err.message);
  });
  return worker;
}

// Run standalone: `tsx src/processor.ts`
if (import.meta.url === `file://${process.argv[1]}`) {
  startWorker();
  console.log('[worker] listening on', SCAN_QUEUE);
}
