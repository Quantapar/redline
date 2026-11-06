import { describe, it, expect } from 'vitest';
import { agentPrompt, findingVerdict, fixOrder, reportAreas, reportScore, scoreLabel, type ReportFinding } from '../lib/report';

const f = (over: Partial<ReportFinding>): ReportFinding => ({
  id: 'f1',
  weaknessClass: 'reentrancy',
  title: 'Reentrancy drains the vault',
  plainSentence: 'withdraw() pays out before it zeroes the balance.',
  severity: 'critical',
  isRed: true,
  consensus: 'reproduced',
  agreementCount: 5,
  refereeCount: 5,
  targetContract: 'Vault',
  targetFunction: 'withdraw',
  movedWei: '0',
  exploitTest: null,
  fix: null,
  ...over,
});

describe('findingVerdict', () => {
  it('is red when reproduced, warn when shaky, ok otherwise', () => {
    expect(findingVerdict({ isRed: true, consensus: 'reproduced' })).toBe('red');
    expect(findingVerdict({ isRed: false, consensus: 'fragile' })).toBe('warn');
    expect(findingVerdict({ isRed: false, consensus: 'inconclusive' })).toBe('warn');
    expect(findingVerdict({ isRed: false, consensus: 'not-reproduced' })).toBe('ok');
  });
});

describe('reportScore', () => {
  it('is 100 with nothing proven', () => {
    expect(reportScore([])).toBe(100);
    expect(reportScore([f({ isRed: false, consensus: 'not-reproduced' })])).toBe(100);
  });
  it('takes off by severity and never goes below 0', () => {
    expect(reportScore([f({ severity: 'critical' })])).toBe(55);
    expect(reportScore([f({ severity: null })])).toBe(70); // unrated counts as high
    expect(reportScore([f({ isRed: false, consensus: 'fragile' })])).toBe(95);
    expect(reportScore([f({}), f({}), f({}), f({})])).toBe(0);
  });
  it('labels the score', () => {
    expect(scoreLabel(100)).toBe('Holding up');
    expect(scoreLabel(55)).toBe('Needs work');
    expect(scoreLabel(10)).toBe('At risk');
  });
});

describe('reportAreas', () => {
  it('lists every attacked class, worst first', () => {
    const areas = reportAreas(
      [{ weaknessClass: 'oracle-manipulation' }, { weaknessClass: 'reentrancy' }, { weaknessClass: 'access-control' }, { weaknessClass: 'reentrancy' }],
      [f({}), f({ weaknessClass: 'oracle-manipulation', isRed: false, consensus: 'fragile' })],
    );
    expect(areas.map((a) => [a.weaknessClass, a.verdict])).toEqual([
      ['reentrancy', 'red'],
      ['oracle-manipulation', 'warn'],
      ['access-control', 'ok'],
    ]);
  });
});

describe('fixOrder', () => {
  it('keeps only what needs fixing, reproduced and severe first', () => {
    const out = fixOrder([
      f({ id: 'shaky', isRed: false, consensus: 'fragile' }),
      f({ id: 'low', severity: 'low' }),
      f({ id: 'fine', isRed: false, consensus: 'not-reproduced' }),
      f({ id: 'crit', severity: 'critical' }),
    ]);
    expect(out.map((x) => x.id)).toEqual(['crit', 'low', 'shaky']);
  });
});

describe('agentPrompt', () => {
  it('carries where, why, the proof, the exploit and the patch', () => {
    const p = agentPrompt('acme/vault', f({ exploitTest: 'function testExploit() public {}', fix: { explanation: 'Zero first.', diff: '- a\n+ b' } }));
    expect(p).toContain('Fix this security issue in acme/vault, in Vault.withdraw().');
    expect(p).toContain('5 of 5 independent referees moved funds');
    expect(p).toContain('function testExploit() public {}');
    expect(p).toContain('```diff\n- a\n+ b\n```');
  });
  it('calls a finding no referee replayed unconfirmed, not partly reproduced', () => {
    const p = agentPrompt('acme/vault', f({ isRed: false, consensus: 'inconclusive', agreementCount: 0, refereeCount: 0 }));
    expect(p).toContain('no referee could replay it on a fork');
    expect(p).not.toContain('0 of 0');
  });

  it('says when a finding is not proven', () => {
    expect(agentPrompt('acme/vault', f({ isRed: false, consensus: 'fragile', agreementCount: 2 }))).toContain('likely rather than proven');
  });
});
