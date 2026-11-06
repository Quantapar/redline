import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb } from '../src/client.js';
import * as schema from '../src/schema.js';
import {
  createScan, setScanStatus, getScan, insertCandidate, insertFinding, insertRefereeRuns,
  insertRegressionTest, listActiveRegressionTests, insertRecipe, recipesByClass, getRepository,
  listFindingsForScan, setFindingStatus,
} from '../src/queries.js';

const url = process.env.TEST_DATABASE_URL ?? 'postgresql://manu@localhost:5432/redline_test';
const h = createDb(url);
let repoId = '';

beforeAll(async () => {
  for (const t of [schema.refereeRuns, schema.regressionTests, schema.fixes, schema.findings, schema.candidates, schema.scans, schema.repositories, schema.installations, schema.accounts, schema.recipes]) {
    await h.db.delete(t);
  }
  const [a] = await h.db.insert(schema.accounts).values({ githubLogin: 'q', githubId: 1 }).returning();
  const [i] = await h.db.insert(schema.installations).values({ accountId: a!.id, githubInstallationId: 1 }).returning();
  const [r] = await h.db.insert(schema.repositories).values({ installationId: i!.id, githubRepoId: 1, fullName: 'q/vault' }).returning();
  repoId = r!.id;
});
afterAll(async () => { await h.close(); });

describe('db queries', () => {
  it('creates, reads, and updates a scan', async () => {
    const scan = await createScan(h.db, { repositoryId: repoId, trigger: 'push', commitSha: 'c1' });
    expect((await getScan(h.db, scan.id))?.status).toBe('queued');
    await setScanStatus(h.db, scan.id, 'complete', { redFindingCount: 1 });
    expect((await getScan(h.db, scan.id))?.status).toBe('complete');
  });

  it('inserts a candidate, referee runs, a finding, and lists the findings', async () => {
    const scan = await createScan(h.db, { repositoryId: repoId, trigger: 'push', commitSha: 'c2' });
    const cand = await insertCandidate(h.db, { scanId: scan.id, hunterModel: 'm', weaknessClass: 'reentrancy', targetContract: 'V', summary: 's', forgeTest: 'f' });
    const runs = await insertRefereeRuns(h.db, [
      { candidateId: cand.id, refereeName: 'referee-a', provider: 'p1', forkBlock: 1, outcome: 'moved', thresholdWei: '1', deltas: [] },
    ]);
    expect(runs).toHaveLength(1);
    const finding = await insertFinding(h.db, { scanId: scan.id, candidateId: cand.id, weaknessClass: 'reentrancy', title: 't', plainSentence: 'p', consensus: 'reproduced', isRed: true, agreementCount: 1, refereeCount: 1 });
    expect((await listFindingsForScan(h.db, scan.id))).toHaveLength(1);
    expect((await setFindingStatus(h.db, finding.id, 'resolved'))?.status).toBe('resolved');
  });

  it('stores and lists active regression tests for a repo', async () => {
    await insertRegressionTest(h.db, { repositoryId: repoId, weaknessClass: 'reentrancy', forgeTest: 'enc', active: true });
    expect((await listActiveRegressionTests(h.db, repoId)).length).toBeGreaterThan(0);
  });

  it('filters recipes by weakness class', async () => {
    await insertRecipe(h.db, { weaknessClass: 'reentrancy', chain: 'ethereum', severity: 'critical', labels: [], title: 'R', template: 't', source: 'seed' });
    await insertRecipe(h.db, { weaknessClass: 'access-control', chain: 'ethereum', severity: 'high', labels: [], title: 'A', template: 't', source: 'seed' });
    const reentrancy = await recipesByClass(h.db, 'reentrancy');
    expect(reentrancy.every((r) => r.weaknessClass === 'reentrancy')).toBe(true);
    expect(reentrancy.length).toBe(1);
  });

  it('reads a repository by id', async () => {
    expect((await getRepository(h.db, repoId))?.fullName).toBe('q/vault');
    expect(await getRepository(h.db, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
