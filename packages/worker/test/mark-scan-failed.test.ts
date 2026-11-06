import { describe, it, expect } from 'vitest';

import { markScanFailed } from '../src/processor.js';
import { createScan, schema, eq } from '@redline/db';
import { testDb, seedRepo } from './helpers.js';

describe('markScanFailed (worker error path)', () => {
  it('moves a scan to the failed terminal state with a finish time', async () => {
    const h = testDb();
    try {
      const repo = await seedRepo(h.db);
      const scan = await createScan(h.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'failpath' });
      await markScanFailed(h.db, scan.id);
      const [row] = await h.db.select().from(schema.scans).where(eq(schema.scans.id, scan.id));
      expect(row!.status).toBe('failed');       // the live feed's poll treats this as terminal
      expect(row!.finishedAt).not.toBeNull();
    } finally {
      await h.close();
    }
  });
  it('is a safe no-op when the scan row is gone', async () => {
    const h = testDb();
    try {
      await expect(markScanFailed(h.db, '00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined();
    } finally {
      await h.close();
    }
  });
});
