import { describe, it, expect } from 'vitest';
import { wei, attackerGained, deltaIsConsistent } from '../src/consensus/money.js';
import type { BalanceDelta } from '../src/domain/referee.js';

const nativeDelta = (net: string): BalanceDelta => ({
  token: 'native',
  attackerBefore: '0',
  attackerAfter: net,
  targetBefore: '0',
  targetAfter: '0',
  attackerNetOfGas: net,
});

describe('money — the fact the council votes on', () => {
  it('parses wei strings and rejects garbage', () => {
    expect(wei('1000')).toBe(1000n);
    expect(() => wei('1.5')).toThrow();
    expect(() => wei('0xabc')).toThrow();
    expect(() => wei('')).toThrow();
  });

  it('counts a gain at or above threshold as moved', () => {
    expect(attackerGained([nativeDelta('1000000000000000')], '1000000000000000')).toBe(true);
    expect(attackerGained([nativeDelta('1000000000000001')], '1000000000000000')).toBe(true);
  });

  it('does not count dust below threshold', () => {
    expect(attackerGained([nativeDelta('999999999999999')], '1000000000000000')).toBe(false);
    expect(attackerGained([nativeDelta('0')], '1000000000000000')).toBe(false);
  });

  it('does not count a loss as a gain', () => {
    expect(attackerGained([nativeDelta('-5000000000000000')], '1000000000000000')).toBe(false);
  });

  it('sums native deltas across entries', () => {
    expect(
      attackerGained([nativeDelta('600000000000000'), nativeDelta('600000000000000')], '1000000000000000'),
    ).toBe(true);
  });

  it('detects ERC-20 token gains independently of native', () => {
    const tokenGain: BalanceDelta = {
      token: '0xToken',
      attackerBefore: '0',
      attackerAfter: '5000000',
      targetBefore: '5000000',
      targetAfter: '0',
      attackerNetOfGas: '5000000',
    };
    expect(attackerGained([tokenGain], '1000000')).toBe(true);
  });

  it('rejects a non-positive threshold', () => {
    expect(() => attackerGained([nativeDelta('1')], '0')).toThrow();
  });

  it('an empty delta set never counts as moved', () => {
    expect(attackerGained([], '1000000000000000')).toBe(false);
  });

  it('a token gain counts even when the attacker lost native (gas)', () => {
    const nativeLoss = nativeDelta('-100000000000000'); // spent gas, no ETH stolen
    const tokenGain: BalanceDelta = {
      token: '0xToken', attackerBefore: '0', attackerAfter: '5000000',
      targetBefore: '5000000', targetAfter: '0', attackerNetOfGas: '5000000',
    };
    expect(attackerGained([nativeLoss, tokenGain], '1000000')).toBe(true);
  });

  it('rejects a negative threshold, not only zero', () => {
    expect(() => attackerGained([nativeDelta('1')], '-1')).toThrow();
  });

  it('honors the tolerance band in deltaIsConsistent (gas bookkeeping)', () => {
    const d: BalanceDelta = {
      token: 'native', attackerBefore: '0', attackerAfter: '100',
      targetBefore: '0', targetAfter: '0', attackerNetOfGas: '95', // off by 5 (gas)
    };
    expect(deltaIsConsistent(d, '5')).toBe(true);   // within tolerance
    expect(deltaIsConsistent(d, '4')).toBe(false);  // just outside
  });

  it('flags inconsistent (fabricated) deltas', () => {
    const d: BalanceDelta = {
      token: 'native',
      attackerBefore: '0',
      attackerAfter: '100',
      targetBefore: '0',
      targetAfter: '0',
      attackerNetOfGas: '999999', // claims more than observed
    };
    expect(deltaIsConsistent(d)).toBe(false);
    expect(deltaIsConsistent({ ...d, attackerNetOfGas: '100' })).toBe(true);
  });
});
