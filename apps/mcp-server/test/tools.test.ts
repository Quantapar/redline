import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createDb, createScan, schema } from '@redline/db';
import { listFindings, getFixContext } from '../src/tools.js';

const url = process.env.TEST_DATABASE_URL ?? 'postgresql://manu@localhost:5432/redline_test';
const handle = createDb(url);
let findingId = '';

beforeAll(async () => {
  for (const t of [schema.refereeRuns, schema.regressionTests, schema.fixes, schema.findings, schema.candidates, schema.scans, schema.repositories, schema.installations, schema.accounts]) {
    await handle.db.delete(t);
  }
  const [acc] = await handle.db.insert(schema.accounts).values({ githubLogin: 'acme', githubId: 1 }).returning();
  const [inst] = await handle.db.insert(schema.installations).values({ accountId: acc!.id, githubInstallationId: 1 }).returning();
  const [repo] = await handle.db.insert(schema.repositories).values({ installationId: inst!.id, githubRepoId: 1, fullName: 'acme/vault' }).returning();
  const scan = await createScan(handle.db, { repositoryId: repo!.id, trigger: 'push', commitSha: 'x' });
  const [cand] = await handle.db.insert(schema.candidates).values({ scanId: scan.id, hunterModel: 'm', weaknessClass: 'reentrancy', targetContract: 'Vault', contractSource: 'contract Vault { function withdraw() external {} }', summary: 's', forgeTest: 'f' }).returning();
  const [f] = await handle.db.insert(schema.findings).values({ scanId: scan.id, candidateId: cand!.id, weaknessClass: 'reentrancy', title: 'Reentrancy in Vault', plainSentence: 'drains', consensus: 'reproduced', isRed: true, agreementCount: 3, refereeCount: 3, severity: 'critical' }).returning();
  findingId = f!.id;
});
afterAll(async () => { await handle.close(); });

describe('MCP tools', () => {
  it('lists red findings for a repo', async () => {
    const findings = await listFindings(handle.db, 'acme/vault');
    expect(findings).toHaveLength(1);
    expect(findings[0]!.weaknessClass).toBe('reentrancy');
  });
  it('returns the vulnerable source for the fix context (no weaponised exploit)', async () => {
    const ctx = await getFixContext(handle.db, findingId);
    expect(ctx?.contractSource).toContain('withdraw');
    expect(ctx?.finding.isRed).toBe(true);
    expect(ctx).not.toHaveProperty('forgeTest'); // the attack is not handed out here
  });
  it('returns null for an unknown finding', async () => {
    expect(await getFixContext(handle.db, '00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
