import { describe, it, expect } from 'vitest';
import { Policy, PolicyRule, WeaknessClass, Severity, Consensus, FindingStatus, RefereeOutcome } from '../src/index.js';

describe('domain schema validation', () => {
  it('parses a valid policy and applies rule defaults', () => {
    const p = Policy.parse({ rules: [{ id: 'r1', text: 'no unguarded money move' }] });
    expect(p.version).toBe(1);
    expect(p.rules[0]!.severity).toBe('high'); // default
    expect(p.rules[0]!.appliesTo).toEqual([]); // default
  });
  it('rejects a policy whose rules are not a list', () => {
    expect(Policy.safeParse({ rules: 'nope' }).success).toBe(false);
  });
  it('rejects a rule missing its text', () => {
    expect(PolicyRule.safeParse({ id: 'r1' }).success).toBe(false);
  });
  it('enumerates weakness classes, severities, consensus, status, and outcomes', () => {
    expect(WeaknessClass.safeParse('reentrancy').success).toBe(true);
    expect(WeaknessClass.safeParse('not-real').success).toBe(false);
    expect(Severity.options).toContain('critical');
    expect(Consensus.options).toContain('reproduced');
    expect(FindingStatus.options).toEqual(['open', 'acknowledged', 'resolved', 'reopened']);
    expect(RefereeOutcome.options).toContain('moved');
  });
  it('defaults an empty policy', () => {
    expect(Policy.parse({}).rules).toEqual([]);
  });
});
