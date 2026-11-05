import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createScan, setScanStatus, schema } from '@redline/db';
import { cancelScan } from '../src/cancel.js';
import { createScanQueue } from '../src/queue.js';
import { testDb, resetDb, seedRepo } from './helpers.js';

const handle = testDb();
const queue = createScanQueue();
beforeEach(async () => { await resetDb(handle.db); });
afterAll(async () => { await queue.close(); await handle.close(); });

describe('cancelScan', () => {
  it('cancels a queued scan and marks it cancelled', async () => {
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'c' });
    const res = await cancelScan(handle.db, queue, scan.id);
    expect(res.cancelled).toBe(true);
    const [row] = await handle.db.select().from(schema.scans).where((await import('@redline/db')).eq(schema.scans.id, scan.id));
    expect(row!.status).toBe('cancelled');
  });

  it('refuses to cancel a completed scan', async () => {
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'c' });
    await setScanStatus(handle.db, scan.id, 'complete');
    const res = await cancelScan(handle.db, queue, scan.id);
    expect(res.cancelled).toBe(false);
    expect(res.reason).toContain('complete');
  });

  it('returns not found for an unknown scan', async () => {
    const res = await cancelScan(handle.db, queue, '00000000-0000-0000-0000-000000000000');
    expect(res.cancelled).toBe(false);
  });
});
