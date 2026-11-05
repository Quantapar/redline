import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createScan, schema } from '@redline/db';
import { SimulationRefereeEngine } from '@redline/engine';
import { FakeRouterClient, type HuntTarget } from '@redline/hunters';
import { DEFAULT_POLICY } from '@redline/shared';
import { createScanQueue, enqueueScan } from '../src/queue.js';
import { startWorker } from '../src/processor.js';
import { testDb, resetDb, seedRepo } from './helpers.js';

// Exercises the real runtime path: BullMQ queue -> Worker -> pipeline -> Postgres.
// Requires Redis and the test database.
const target: HuntTarget = {
  contractName: 'EtherVault', filePath: 'src/EtherVault.sol',
  source: 'contract EtherVault { function withdraw() external {} }',
  changedFunctions: ['withdraw'], analyzerNotes: [],
};
const client = new FakeRouterClient(() =>
  JSON.stringify({ candidates: [{
    weaknessClass: 'reentrancy', targetFunction: 'withdraw', summary: 'drains the vault',
    forgeTest: '// @redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=false\nfunction t() public {}',
    claimedValueWei: '5000000000000000000', usedShortcuts: false,
  }] }),
);

const handle = testDb();
const queue = createScanQueue();
let worker: ReturnType<typeof startWorker>;

beforeAll(async () => {
  await resetDb(handle.db);
  worker = startWorker({
    db: handle.db,
    client,
    engine: new SimulationRefereeEngine(),
    prepare: async () => ({ targets: [target], policy: DEFAULT_POLICY }),
  });
  await worker.waitUntilReady();
});

afterAll(async () => {
  await worker.close();
  await queue.close();
  await handle.close();
});

describe('queue -> worker -> pipeline (real BullMQ + Redis)', () => {
  it('processes an enqueued scan to a persisted red finding', async () => {
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'q1' });
    await enqueueScan(queue, scan.id);

    // wait for the worker to finish (poll the DB)
    const deadline = Date.now() + 20_000;
    let status = 'queued';
    while (Date.now() < deadline) {
      const [row] = await handle.db.select().from(schema.scans).where((await import('@redline/db')).eq(schema.scans.id, scan.id));
      status = row?.status ?? 'queued';
      if (status === 'complete' || status === 'failed') break;
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(status).toBe('complete');
    const findings = await handle.db.select().from(schema.findings).where((await import('@redline/db')).eq(schema.findings.scanId, scan.id));
    expect(findings.length).toBe(1);
    expect(findings[0]!.isRed).toBe(true);
  }, 30_000);
});
