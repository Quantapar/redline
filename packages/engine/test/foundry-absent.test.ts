import { describe, it, expect } from 'vitest';
import { FoundryRefereeEngine } from '../src/foundry-referee.js';
import { runCouncil } from '../src/referee.js';
import { detectFoundry } from '../src/foundry.js';
import type { Candidate } from '@redline/shared';

const candidate: Candidate = {
  id: 'c1', scanId: 's1', hunterModel: 'glm-5.3', weaknessClass: 'reentrancy',
  targetContract: 'Vault', targetFunction: 'withdraw', summary: 'drains',
  forgeTest: 'contract A { constructor(address) {} function attack() external payable {} }', steps: [],
  claimedValueWei: '5000000000000000000', usedShortcuts: false, createdAt: '',
  plan: { attackerContract: 'A', targetConstructorSig: null, targetConstructorArgs: [], targetDeployValueWei: '0', seed: [], stakeWei: '0', targetAddress: null },
};

describe('honest no-proof-no-alarm when Foundry is unavailable', () => {
  it('a Foundry referee without the toolchain returns build-failed, not moved', async () => {
    const foundry = await detectFoundry();
    const run = await new FoundryRefereeEngine().run({
      candidate, refereeName: 'referee-a', provider: 'p1', thresholdWei: '1000000000000000',
    });
    if (!foundry.available) {
      expect(run.outcome).toBe('build-failed');
      expect(run.error).toMatch(/foundry/i);
    } else {
      // if Foundry IS installed, there is no prepared project: an error, never moved
      expect(run.outcome).toBe('error');
      expect(run.error).toMatch(/project dir/);
    }
  });

  it('a council of Foundry referees with no toolchain is inconclusive, never red', async () => {
    const foundry = await detectFoundry();
    if (foundry.available) return; // only meaningful when Foundry is absent
    const { result } = await runCouncil(new FoundryRefereeEngine(), candidate, {
      providers: ['p1', 'p2', 'p3'], blocks: [0, 0, 0], thresholdWei: '1000000000000000',
    });
    expect(result.isRed).toBe(false);
    expect(result.consensus).toBe('inconclusive');
  });

  it('refuses to run an attack whose cheat survives stripping — regardless of Foundry', async () => {
    // A cross-line cheat cannot be stripped by line; the referee must refuse to
    // run it rather than execute the cheat on the fork. This check runs before
    // Foundry detection, so it is deterministic whether or not Foundry exists.
    const cheater: Candidate = {
      ...candidate,
      forgeTest: 'contract E is Test {\n function t() public {\n  vm\n  .deal(attacker, 1000 ether);\n  target.withdraw(1000 ether);\n }\n}',
    };
    const run = await new FoundryRefereeEngine().run({
      candidate: cheater, refereeName: 'referee-a', provider: 'p1',
      projectDir: '/tmp/does-not-matter', thresholdWei: '1000000000000000',
    });
    expect(run.outcome).toBe('error');
    expect(run.outcome).not.toBe('moved');
    expect(run.error).toMatch(/cheat/i);
  });

  it('a council cannot red a cheat-bearing attack even if Foundry were present', async () => {
    const cheater: Candidate = {
      ...candidate,
      forgeTest: 'contract E is Test {\n function t() public {\n  vm\n  .deal(attacker, 1000 ether);\n  target.withdraw(1000 ether);\n }\n}',
    };
    const { result } = await runCouncil(new FoundryRefereeEngine(), cheater, {
      providers: ['p1', 'p2', 'p3'], blocks: [0, 0, 0], thresholdWei: '1000000000000000',
    });
    expect(result.isRed).toBe(false);
  });
});

describe('a candidate without a runnable plan can never be red', () => {
  it('is an error vote (not a valid vote) before any toolchain is touched', async () => {
    const planless: Candidate = { ...candidate, plan: null };
    const run = await new FoundryRefereeEngine().run({
      candidate: planless, refereeName: 'referee-a', provider: 'p1', projectDir: '/tmp/x', thresholdWei: '1000000000000000',
    });
    expect(run.outcome).toBe('error');
    expect(run.error).toMatch(/plan/);
  });
  it('refuses a plan whose setup hands the attacker wallet anything', async () => {
    const rigged: Candidate = {
      ...candidate,
      plan: { ...candidate.plan!, seed: [{ sig: 'setOwner(address)', args: ['0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'], valueWei: '0' }] },
    };
    const run = await new FoundryRefereeEngine().run({
      candidate: rigged, refereeName: 'referee-a', provider: 'p1', projectDir: '/tmp/x', thresholdWei: '1000000000000000',
    });
    expect(run.outcome).toBe('error');
    expect(run.error).toMatch(/attacker wallet/);
  });
});
