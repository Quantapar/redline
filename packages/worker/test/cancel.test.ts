import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createScan, setScanStatus, cancelScanIfActive, eq, schema } from '@redline/db';
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

  // The compare-and-set that protects the complete-just-as-cancel-lands race.
  it('cancelScanIfActive does not clobber a scan that already reached a terminal state', async () => {
    const repo = await seedRepo(handle.db);
    for (const terminal of ['complete', 'failed', 'cancelled'] as const) {
      const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: terminal });
      await setScanStatus(handle.db, scan.id, terminal);
      const didCancel = await cancelScanIfActive(handle.db, scan.id);
      expect(didCancel).toBe(false); // nothing to cancel
      const [row] = await handle.db.select().from(schema.scans).where(eq(schema.scans.id, scan.id));
      expect(row!.status).toBe(terminal); // the terminal state is preserved, not overwritten
    }
  });

  it('cancelScanIfActive cancels a still-active scan', async () => {
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'active' });
    await setScanStatus(handle.db, scan.id, 'hunting');
    expect(await cancelScanIfActive(handle.db, scan.id)).toBe(true);
    const [row] = await handle.db.select().from(schema.scans).where(eq(schema.scans.id, scan.id));
    expect(row!.status).toBe('cancelled');
    expect(row!.finishedAt).not.toBeNull();
  });
});
