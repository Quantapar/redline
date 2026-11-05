import { describe, it, expect } from 'vitest';
import { timeAgo, shortSha, formatEth, SEVERITY_HUE, CONSENSUS_LABEL } from '../lib/format';
import { redactAttack } from '../lib/redact';
import { netMovedWei } from '../lib/referee-value';

describe('format', () => {
  it('shortens a sha', () => expect(shortSha('abcdef1234567890')).toBe('abcdef1'));
  it('formats recent times', () => {
    expect(timeAgo(new Date())).toMatch(/s ago/);
    expect(timeAgo(null)).toBe('—');
  });
  it('formats wei to ETH', () => {
    expect(formatEth('8500000000000000000')).toBe('8.5 ETH');
    expect(formatEth('1000000000000000000')).toBe('1 ETH');
    expect(formatEth('0')).toBe('0 ETH');
    expect(formatEth('garbage')).toBe('0 ETH');
  });
  it('maps severity and consensus to hues', () => {
    expect(SEVERITY_HUE.critical).toBe('error');
    expect(CONSENSUS_LABEL.reproduced!.hue).toBe('error');
    expect(CONSENSUS_LABEL['not-reproduced']!.hue).toBe('success');
  });
});

describe('redactAttack', () => {
  it('withholds the real exploit body and reports hidden lines', () => {
    const r = redactAttack('function testExploit() public {\n  target.withdraw();\n  target.withdraw();\n}');
    expect(r.preview).toContain('withheld');
    expect(r.preview).not.toContain('target.withdraw()');
    expect(r.hiddenLines).toBeGreaterThan(0);
  });
});

describe('netMovedWei', () => {
  it('sums native deltas', () => {
    expect(netMovedWei([{ token: 'native', attackerNetOfGas: '5' }, { token: 'native', attackerNetOfGas: '3' }])).toBe('8');
  });
  it('ignores non-native tokens and bad input', () => {
    expect(netMovedWei([{ token: 'erc20', attackerNetOfGas: '5' }])).toBe('0');
    expect(netMovedWei(null)).toBe('0');
  });
});
