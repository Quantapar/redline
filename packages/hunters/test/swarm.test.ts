import { describe, it, expect } from 'vitest';
import { huntSwarm } from '../src/swarm.js';
import { FakeRouterClient } from '../src/router-client.js';
import { BudgetGuard, DEFAULT_POLICY } from '@redline/shared';
import type { HuntTarget } from '../src/prompts.js';

const target: HuntTarget = {
  contractName: 'Vault', filePath: 'src/Vault.sol', source: 'contract Vault {}',
  changedFunctions: ['withdraw'], analyzerNotes: ['reentrancy-eth in withdraw'],
};

const candidateJson = JSON.stringify({
  candidates: [{ weaknessClass: 'reentrancy', targetFunction: 'withdraw', summary: 'reentrancy drains vault', forgeTest: 'function testExploit() public {}', claimedValueWei: '1000000000000000000', usedShortcuts: false }],
});

describe('huntSwarm orchestration', () => {
  it('finds a candidate with a cheap model and stops escalating', async () => {
    const calls: string[] = [];
    const client = new FakeRouterClient((req) => { calls.push(req.model); return candidateJson; });
    const budget = new BudgetGuard(500);
    const cands = await huntSwarm({ client, scanId: 's1', targets: [target], policy: DEFAULT_POLICY, budget });
    expect(cands).toHaveLength(1);
    // only one (cheap) model should have been needed before stopAfter=1 hit
    expect(calls.length).toBe(1);
    expect(budget.spentCents).toBeGreaterThan(0);
  });

  it('escalates to stronger tiers when cheap models find nothing', async () => {
    const calls: string[] = [];
    const client = new FakeRouterClient((req) => {
      calls.push(req.model);
      // strong/reasoning models succeed; cheap ones return empty
      return /pro|kimi|glm-5.3$|397b/.test(req.model) ? candidateJson : JSON.stringify({ candidates: [] });
    });
    const budget = new BudgetGuard(500);
    const cands = await huntSwarm({ client, scanId: 's1', targets: [target], policy: DEFAULT_POLICY, budget });
    expect(cands.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeGreaterThan(3); // went past the cheap tier
  });

  it('never exceeds the budget cap', async () => {
    const client = new FakeRouterClient(() => JSON.stringify({ candidates: [] })); // nothing found -> tries everything
    const budget = new BudgetGuard(7); // tiny
    await huntSwarm({ client, scanId: 's1', targets: [target], policy: DEFAULT_POLICY, budget });
    expect(budget.spentCents).toBeLessThanOrEqual(7);
  });
});
