import { describe, it, expect } from 'vitest';
import { sumNativeAtRisk } from '../lib/queries';

const native = (net: string) => ({ token: 'native', attackerNetOfGas: net });

describe('sumNativeAtRisk — the headline value-at-risk figure', () => {
  it('counts each finding ONCE even with several agreeing moved runs', () => {
    // A reproduced finding has one moved run per referee, all reporting the same theft.
    const rows = [
      { findingId: 'f1', deltas: [native('5000000000000000000')] },
      { findingId: 'f1', deltas: [native('5000000000000000000')] },
      { findingId: 'f1', deltas: [native('5000000000000000000')] },
      { findingId: 'f2', deltas: [native('3000000000000000000')] },
    ];
    // f1 counted once (5) + f2 (3) = 8 ETH, NOT 5*3 + 3 = 18.
    expect(sumNativeAtRisk(rows)).toBe(8_000000000000000000n);
  });

  it('takes the native delta and ignores token deltas', () => {
    const rows = [{ findingId: 'f1', deltas: [{ token: '0xToken', attackerNetOfGas: '999' }, native('2000000000000000000')] }];
    expect(sumNativeAtRisk(rows)).toBe(2_000000000000000000n);
  });

  it('contributes zero for a finding with no native delta or a malformed one', () => {
    expect(sumNativeAtRisk([{ findingId: 'f1', deltas: [{ token: '0xT', attackerNetOfGas: '5' }] }])).toBe(0n);
    expect(sumNativeAtRisk([{ findingId: 'f1', deltas: [native('not-a-number')] }])).toBe(0n);
    expect(sumNativeAtRisk([{ findingId: 'f1', deltas: null }])).toBe(0n);
  });

  it('is empty for no rows', () => {
    expect(sumNativeAtRisk([])).toBe(0n);
  });
});
