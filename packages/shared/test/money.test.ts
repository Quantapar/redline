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

import { theftFromTarget, auditRun } from '../src/consensus/money.js';
import type { RefereeRun } from '../src/domain/referee.js';

describe('theftFromTarget — value must leave the target AND land with the attacker', () => {
  const d = (gain: string, before: string, after: string, token = 'native') => ({
    token, attackerBefore: '0', attackerAfter: gain, targetBefore: before, targetAfter: after, attackerNetOfGas: gain,
  });
  it('is a theft when both sides of the measurement meet the threshold', () => {
    expect(theftFromTarget([d('100', '100', '0')], '100')).toBe(true);
  });
  it('is NOT a theft when the attacker gained but the target lost nothing (funded from elsewhere)', () => {
    expect(theftFromTarget([d('100', '100', '100')], '100')).toBe(false);
  });
  it('is NOT a theft when the target lost but the attacker did not gain', () => {
    expect(theftFromTarget([d('0', '100', '0')], '100')).toBe(false);
  });
  it('enforces the threshold on both sides and refuses a non-positive threshold', () => {
    expect(theftFromTarget([d('99', '100', '0')], '100')).toBe(false);
    expect(theftFromTarget([d('100', '99', '0')], '100')).toBe(false);
    expect(() => theftFromTarget([d('1', '1', '0')], '0')).toThrow();
  });
});

describe('auditRun — a moved vote must be backed by measured deltas that add up', () => {
  const run = (outcome: RefereeRun['outcome'], deltas: RefereeRun['deltas']): RefereeRun => ({
    id: 'r', candidateId: 'c', refereeName: 'a', provider: 'p', forkBlock: 0, outcome, thresholdWei: '1',
    deltas, traceRef: null, logsRef: null, startedAt: '', finishedAt: null, error: null,
  });
  it('demotes moved-with-no-deltas to an error (never a valid vote)', () => {
    expect(auditRun(run('moved', [])).outcome).toBe('error');
  });
  it('demotes moved whose reported net the balances do not support (a fabricated delta)', () => {
    const fake = { token: 'native', attackerBefore: '0', attackerAfter: '0', targetBefore: '0', targetAfter: '0', attackerNetOfGas: '1000000' };
    const out = auditRun(run('moved', [fake]));
    expect(out.outcome).toBe('error');
    expect(out.error).toMatch(/inconsistent/);
  });
  it('demotes moved whose delta holds malformed numbers', () => {
    const bad = { token: 'native', attackerBefore: 'x', attackerAfter: '5', targetBefore: '5', targetAfter: '0', attackerNetOfGas: '5' };
    expect(auditRun(run('moved', [bad])).outcome).toBe('error');
  });
  it('leaves a consistent moved vote, and every non-moved vote, untouched', () => {
    const ok = { token: 'native', attackerBefore: '1', attackerAfter: '6', targetBefore: '5', targetAfter: '0', attackerNetOfGas: '5' };
    expect(auditRun(run('moved', [ok])).outcome).toBe('moved');
    expect(auditRun(run('did-not-move', [])).outcome).toBe('did-not-move');
  });
});
