import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createScan, setFindingStatus, schema } from '@redline/db';
import { testDb, resetDb, seedRepo } from './helpers.js';

const handle = testDb();
beforeEach(async () => { await resetDb(handle.db); });
afterAll(async () => { await handle.close(); });

async function makeFinding() {
  const repo = await seedRepo(handle.db);
  const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'x' });
  const [cand] = await handle.db.insert(schema.candidates).values({ scanId: scan.id, hunterModel: 'm', weaknessClass: 'reentrancy', targetContract: 'V', summary: 's', forgeTest: 'f' }).returning();
  const [f] = await handle.db.insert(schema.findings).values({ scanId: scan.id, candidateId: cand!.id, weaknessClass: 'reentrancy', title: 't', plainSentence: 'p', consensus: 'reproduced', isRed: true, agreementCount: 3, refereeCount: 3 }).returning();
  return f!.id;
}

describe('finding triage status', () => {
  it('defaults to open and transitions through the workflow', async () => {
    const id = await makeFinding();
    const [initial] = await handle.db.select().from(schema.findings).where((await import('@redline/db')).eq(schema.findings.id, id));
    expect(initial!.status).toBe('open');

    expect((await setFindingStatus(handle.db, id, 'acknowledged'))!.status).toBe('acknowledged');
    expect((await setFindingStatus(handle.db, id, 'resolved'))!.status).toBe('resolved');
    expect((await setFindingStatus(handle.db, id, 'reopened'))!.status).toBe('reopened');
  });

  it('returns null for an unknown finding', async () => {
    expect(await setFindingStatus(handle.db, '00000000-0000-0000-0000-000000000000', 'resolved')).toBeNull();
  });
});
