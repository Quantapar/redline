import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createScan, setScanStatus, decrypt, encrypt, insertRegressionTest, schema, eq } from '@redline/db';
import { SimulationRefereeEngine } from '@redline/engine';
import { FakeRouterClient, type HuntTarget } from '@redline/hunters';
import { DEFAULT_POLICY } from '@redline/shared';
import { runScan } from '../src/pipeline.js';
import { testDb, resetDb, seedRepo } from './helpers.js';

const target: HuntTarget = {
  contractName: 'EtherVault', filePath: 'src/EtherVault.sol',
  source: 'contract EtherVault { function withdraw() external {} }',
  changedFunctions: ['withdraw'], analyzerNotes: ['reentrancy-eth in withdraw'],
};

// Fake model returns a candidate whose forgeTest carries a sim directive the
// SimulationRefereeEngine reads to decide the outcome deterministically.
function fakeClientFor(directive: string) {
  return new FakeRouterClient(() =>
    JSON.stringify({
      candidates: [{
        weaknessClass: 'reentrancy', targetFunction: 'withdraw',
        summary: 'reentrancy drains the vault',
        forgeTest: `// ${directive}\nfunction testExploit() public {${directive.includes('cheatDependent=true') ? ' vm.deal(attacker, 100 ether);' : ''} target.withdraw(); }`,
        claimedValueWei: '5000000000000000000', usedShortcuts: directive.includes('cheatDependent=true'),
      }],
    }),
  );
}

let handle: ReturnType<typeof testDb>;
beforeAll(() => { handle = testDb(); });
afterAll(async () => { await handle.close(); });
beforeEach(async () => { await resetDb(handle.db); });

const deps = (client: FakeRouterClient) => ({
  db: handle.db,
  client,
  engine: new SimulationRefereeEngine(),
  prepare: async () => ({ targets: [target], policy: DEFAULT_POLICY }),
});

describe('scan pipeline (live Postgres, simulated engine)', () => {
  it('turns a genuine reproduced exploit into a RED finding + a saved regression test', async () => {
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'abc123' });
    const result = await runScan(deps(fakeClientFor('@redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=false')), scan.id);

    expect(result.candidateCount).toBe(1);
    expect(result.redCount).toBe(1);
    expect(result.findings[0]!.isRed).toBe(true);
    expect(result.findings[0]!.consensus).toBe('reproduced');
    expect(result.findings[0]!.judgment?.severity).toBe('critical');

    // persisted?
    const finalScan = (await handle.db.select().from(schema.scans))[0]!;
    expect(finalScan.status).toBe('complete');
    expect(finalScan.redFindingCount).toBe(1);
    const regs = await handle.db.select().from(schema.regressionTests);
    expect(regs).toHaveLength(1); // the forever-test was saved
    const runs = await handle.db.select().from(schema.refereeRuns);
    expect(runs.length).toBe(3); // a full council
  });

  it("applies the repository's own .redline/policy.yml during the scan", async () => {
    const repo = await seedRepo(handle.db);
    // The repo stores a custom plain-English rule targeting withdraw*.
    await handle.db.update(schema.repositories)
      .set({ policyJson: { version: 1, rules: [{ id: 'no-unguarded-withdraw', text: 'withdraw must be guarded', severity: 'high', appliesTo: ['withdraw*'] }] } })
      .where(eq(schema.repositories.id, repo.id));
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'policy1' });
    const result = await runScan(deps(fakeClientFor('@redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=false')), scan.id);

    expect(result.redCount).toBe(1);
    // the judge flagged the repo rule — proving the per-repo policy was loaded, not the default
    expect(result.findings[0]!.judgment?.breaksPolicy).toContain('no-unguarded-withdraw');
  });

  it('falls back to the default policy when the stored policy is invalid', async () => {
    const repo = await seedRepo(handle.db);
    await handle.db.update(schema.repositories)
      .set({ policyJson: { version: 99, rules: 'not-an-array' } })
      .where(eq(schema.repositories.id, repo.id));
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'policy2' });
    const result = await runScan(deps(fakeClientFor('@redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=false')), scan.id);
    // an invalid stored policy must not crash the scan or flag anything
    expect(result.redCount).toBe(1);
    expect(result.findings[0]!.judgment?.breaksPolicy).toEqual([]);
  });

  it('stores the candidate attack encrypted at rest but recoverable', async () => {
    process.env.ENCRYPTION_KEY = require('node:crypto').randomBytes(32).toString('base64');
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'enc1' });
    await runScan(deps(fakeClientFor('@redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=false')), scan.id);
    const [cand] = await handle.db.select().from(schema.candidates);
    expect(cand!.forgeTest.startsWith('enc:v1:')).toBe(true); // not plaintext on disk
    expect(cand!.forgeTest).not.toContain('testExploit');
    expect(decrypt(cand!.forgeTest)).toContain('testExploit'); // recoverable with the key
    delete process.env.ENCRYPTION_KEY;
  });

  it('does NOT raise an alarm for a cheat-dependent exploit (two-room defense)', async () => {
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'def456' });
    const result = await runScan(deps(fakeClientFor('@redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=true flaky=false')), scan.id);

    expect(result.candidateCount).toBe(1);
    expect(result.redCount).toBe(0);
    expect(result.findings[0]!.isRed).toBe(false);
    const regs = await handle.db.select().from(schema.regressionTests);
    expect(regs).toHaveLength(0); // nothing saved, no alarm
  });

  it('survives a candidate whose verification throws and still completes', async () => {
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'boom' });
    const throwingEngine = { run: async () => { throw new Error('referee exploded'); } };
    const result = await runScan({
      db: handle.db,
      client: fakeClientFor('@redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=false'),
      engine: throwingEngine,
      prepare: async () => ({ targets: [target], policy: DEFAULT_POLICY }),
    }, scan.id);
    expect(result.candidateCount).toBe(1);
    expect(result.redCount).toBe(0); // the throwing candidate was skipped, not fatal
    const finalScan = (await handle.db.select().from(schema.scans))[0]!;
    expect(finalScan.status).toBe('complete');
  });

  it('stops and stays cancelled when cancelled mid-run', async () => {
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'cancelme' });
    // a client that cancels the scan (awaited) while it is being hunted, so the
    // post-hunt cancellation check deterministically sees it.
    const cancelling = {
      async chat(req: { model: string }) {
        await setScanStatus(handle.db, scan.id, 'cancelled');
        return { content: JSON.stringify({ candidates: [] }), model: req.model, usage: null, receipt: null };
      },
    };
    const result = await runScan({
      db: handle.db, client: cancelling, engine: new SimulationRefereeEngine(),
      prepare: async () => ({ targets: [target], policy: DEFAULT_POLICY }),
    }, scan.id);
    expect(result.redCount).toBe(0);
    const finalScan = (await handle.db.select().from(schema.scans))[0]!;
    expect(finalScan.status).toBe('cancelled'); // NOT overwritten to complete
  });

  it('re-runs a saved forever-test and flags a regression when it reproduces', async () => {
    const repo = await seedRepo(handle.db);
    // a previously-saved attack (encrypted at rest) that still reproduces
    const attack = '// @redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=false\ncontract EtherVault {} function testExploit() public {}';
    await insertRegressionTest(handle.db, { repositoryId: repo.id, weaknessClass: 'reentrancy', forgeTest: encrypt(attack), active: true });

    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'reg1' });
    const emptyClient = new FakeRouterClient(() => JSON.stringify({ candidates: [] })); // no new hunt findings
    const result = await runScan({
      db: handle.db, client: emptyClient, engine: new SimulationRefereeEngine(),
      prepare: async () => ({ targets: [target], policy: DEFAULT_POLICY }),
    }, scan.id);

    expect(result.redCount).toBe(1); // the forever-test reproduced
    const finding = result.findings[0]!;
    expect(finding.isRed).toBe(true);
    expect(finding.title).toMatch(/^Regression:/);
    // it must NOT create a second regression test (already saved)
    const regs = await handle.db.select().from(schema.regressionTests);
    expect(regs).toHaveLength(1);
  });

  it('completes with zero findings when the swarm proposes nothing', async () => {
    const repo = await seedRepo(handle.db);
    const scan = await createScan(handle.db, { repositoryId: repo.id, trigger: 'push', commitSha: 'ghi789' });
    const emptyClient = new FakeRouterClient(() => JSON.stringify({ candidates: [] }));
    const result = await runScan(deps(emptyClient), scan.id);
    expect(result.candidateCount).toBe(0);
    expect(result.redCount).toBe(0);
    const finalScan = (await handle.db.select().from(schema.scans))[0]!;
    expect(finalScan.status).toBe('complete');
  });
});
