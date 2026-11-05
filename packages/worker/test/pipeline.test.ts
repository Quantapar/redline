import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createScan, schema } from '@redline/db';
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
