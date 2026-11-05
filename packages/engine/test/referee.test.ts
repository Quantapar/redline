import { describe, it, expect } from 'vitest';
import { SimulationRefereeEngine, runCouncil, parseSimDirective } from '../src/referee.js';
import type { Candidate } from '@redline/shared';

const THRESH = '1000000000000000'; // 0.001 ETH

function candidate(forgeTest: string, id = 'c1'): Candidate {
  return {
    id, scanId: 's1', hunterModel: 'glm-5.3', weaknessClass: 'reentrancy',
    targetContract: 'Vault', targetFunction: 'withdraw', summary: 'drains the vault',
    forgeTest, steps: [], claimedValueWei: '5000000000000000000', usedShortcuts: false,
    createdAt: new Date().toISOString(),
  };
}

const dispatch = {
  providers: ['alchemy', 'infura', 'ankr'],
  blocks: [100, 101, 102],
  thresholdWei: THRESH,
};

describe('SimulationRefereeEngine + council', () => {
  it('reproduces a genuine, non-cheat exploit across all referees', async () => {
    const c = candidate('// @redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=false\n target.withdraw();');
    const { result, runs } = await runCouncil(new SimulationRefereeEngine(), c, dispatch);
    expect(runs.every((r) => r.outcome === 'moved')).toBe(true);
    expect(result.consensus).toBe('reproduced');
    expect(result.isRed).toBe(true);
  });

  it('refuses to reproduce a cheat-dependent exploit (two-room defense)', async () => {
    const c = candidate(
      '// @redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=true flaky=false\n vm.deal(attacker, 100 ether); target.withdraw();',
    );
    const { result } = await runCouncil(new SimulationRefereeEngine(), c, dispatch);
    expect(result.isRed).toBe(false);
    expect(result.consensus).toBe('not-reproduced');
  });

  it('marks a flaky exploit fragile, not red', async () => {
    const c = candidate('// @redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=true\n target.withdraw();', 'flaky-xyz');
    const { result } = await runCouncil(new SimulationRefereeEngine(), c, dispatch);
    expect(result.isRed).toBe(false);
    expect(['fragile', 'not-reproduced']).toContain(result.consensus);
  });

  it('raises no alarm when there is no ground truth (honest default)', async () => {
    const c = candidate('target.withdraw(); // no directive');
    const { result } = await runCouncil(new SimulationRefereeEngine(), c, dispatch);
    expect(result.consensus).toBe('not-reproduced');
    expect(result.isRed).toBe(false);
  });

  it('parses sim directives', () => {
    const d = parseSimDirective('// @redline-sim exploitable=true netWei=42 cheatDependent=false flaky=false');
    expect(d?.exploitable).toBe(true);
    expect(d?.netWei).toBe('42');
  });
});
