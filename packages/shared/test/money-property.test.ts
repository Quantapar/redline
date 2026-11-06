import { describe, it, expect } from 'vitest';
import { attackerGained, wei } from '../src/consensus/money.js';
import type { BalanceDelta } from '../src/domain/referee.js';

const nativeDelta = (net: bigint): BalanceDelta => ({
  token: 'native', attackerBefore: '0', attackerAfter: net.toString(),
  targetBefore: '0', targetAfter: '0', attackerNetOfGas: net.toString(),
});
// deterministic pseudo-random so failures reproduce
function rng(seed: number) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

describe('attackerGained — property tests over the fact the council votes on', () => {
  it('moved iff the summed native net meets or exceeds a positive threshold', () => {
    const r = rng(42);
    for (let i = 0; i < 5000; i++) {
      const net = BigInt(Math.floor((r() - 0.5) * 2e18)); // can be negative (a loss)
      const threshold = BigInt(1 + Math.floor(r() * 2e18)); // always > 0
      const expected = net >= threshold;
      expect(attackerGained([nativeDelta(net)], threshold.toString())).toBe(expected);
    }
  });

  it('is additive: splitting one native delta into parts yields the same verdict', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const total = BigInt(Math.floor(r() * 2e18));
      const part = BigInt(Math.floor(r() * Number(total > 0n ? total : 1n)));
      const threshold = BigInt(1 + Math.floor(r() * 2e18));
      const whole = attackerGained([nativeDelta(total)], threshold.toString());
      const split = attackerGained([nativeDelta(part), nativeDelta(total - part)], threshold.toString());
      expect(split).toBe(whole);
    }
  });

  it('never counts a strictly-below-threshold gain, and always counts exactly-threshold', () => {
    const r = rng(99);
    for (let i = 0; i < 2000; i++) {
      const t = BigInt(1 + Math.floor(r() * 2e18));
      expect(attackerGained([nativeDelta(t - 1n)], t.toString())).toBe(false); // dust just below
      expect(attackerGained([nativeDelta(t)], t.toString())).toBe(true);       // exactly at
    }
  });

  it('always throws on a non-positive threshold (no dust ever counts)', () => {
    expect(() => attackerGained([nativeDelta(1n)], '0')).toThrow();
    expect(() => attackerGained([nativeDelta(1n)], '-1000000000000000000')).toThrow();
  });

  it('wei round-trips any integer string and rejects anything else', () => {
    const r = rng(5);
    for (let i = 0; i < 1000; i++) {
      const n = BigInt(Math.floor((r() - 0.5) * 2e18));
      expect(wei(n.toString())).toBe(n);
    }
    for (const bad of ['1.5', '0x10', '', ' 1', '1 ', 'abc', '--1']) expect(() => wei(bad)).toThrow();
  });
});
