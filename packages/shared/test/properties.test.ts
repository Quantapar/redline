import { describe, it, expect } from 'vitest';
import { tallyCouncil, DEFAULT_COUNCIL, type RefereeRun } from '../src/index.js';
import { attackerGained } from '../src/consensus/money.js';
import { BudgetGuard } from '../src/consensus/budget.js';

const OUTCOMES = ['moved', 'did-not-move', 'error', 'build-failed'] as const;
let seq = 0;
function run(outcome: (typeof OUTCOMES)[number], provider: string): RefereeRun {
  seq += 1;
  return {
    id: `r${seq}`, candidateId: 'c', refereeName: `ref${seq}`, provider, forkBlock: seq,
    outcome, thresholdWei: '1000', deltas: [], traceRef: null, logsRef: null,
    startedAt: '', finishedAt: null, error: null,
  };
}

describe('property: tallyCouncil invariants over 5000 random councils', () => {
  it('red implies reproduced consensus, quorum met, and (strict) zero dissent', () => {
    for (let i = 0; i < 5000; i++) {
      const n = 1 + Math.floor(Math.random() * 7);
      const runs = Array.from({ length: n }, (_, k) => run(OUTCOMES[Math.floor(Math.random() * 4)]!, `p${k}`));
      const res = tallyCouncil(runs, DEFAULT_COUNCIL);
      // core safety invariant: an alarm is never raised except on reproduced consensus
      if (res.isRed) {
        expect(res.consensus).toBe('reproduced');
        expect(res.agreementCount).toBeGreaterThanOrEqual(DEFAULT_COUNCIL.quorum);
        expect(res.dissentCount).toBe(0);
        expect(res.validCount).toBeGreaterThanOrEqual(DEFAULT_COUNCIL.minValidRuns);
      }
      // consensus is always one of the four known states
      expect(['reproduced', 'fragile', 'not-reproduced', 'inconclusive']).toContain(res.consensus);
    }
  });

  it('identical providers (sybil) can never produce a red verdict', () => {
    for (let i = 0; i < 2000; i++) {
      const n = 3 + Math.floor(Math.random() * 5);
      const runs = Array.from({ length: n }, () => run('moved', 'same-provider'));
      expect(tallyCouncil(runs, DEFAULT_COUNCIL).isRed).toBe(false);
    }
  });
});

describe('property: BudgetGuard never overruns over 5000 random charge sequences', () => {
  it('spent never exceeds the cap regardless of charge order/size', () => {
    for (let i = 0; i < 5000; i++) {
      const cap = 1 + Math.floor(Math.random() * 10000);
      const g = new BudgetGuard(cap);
      for (let k = 0; k < 30; k++) g.charge(Math.floor(Math.random() * cap * 2));
      expect(g.spentCents).toBeLessThanOrEqual(cap);
      expect(g.spentCents).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('property: attackerGained is monotonic in the threshold', () => {
  it('a gain that clears a high threshold also clears any lower one', () => {
    for (let i = 0; i < 2000; i++) {
      const gain = Math.floor(Math.random() * 1e9);
      const hi = 1 + Math.floor(Math.random() * 1e9);
      const lo = 1 + Math.floor(Math.random() * hi);
      const d = [{ token: 'native', attackerBefore: '0', attackerAfter: String(gain), targetBefore: '0', targetAfter: '0', attackerNetOfGas: String(gain) }];
      if (attackerGained(d, String(hi))) expect(attackerGained(d, String(lo))).toBe(true);
    }
  });
});
