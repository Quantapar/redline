import { describe, it, expect } from 'vitest';
import { parsePolicy, serializePolicy, addRule, removeRule, slugify, STARTER_POLICY } from '../src/policy.js';

describe('policy CLI logic', () => {
  it('slugifies rule text into a stable id', () => {
    expect(slugify('No unguarded money move!')).toBe('no-unguarded-money-move');
  });
  it('round-trips through YAML', () => {
    const yaml = serializePolicy(STARTER_POLICY);
    const parsed = parsePolicy(yaml);
    expect(parsed.rules).toHaveLength(2);
    expect(parsed.version).toBe(1);
  });
  it('parses an empty file as an empty policy', () => {
    expect(parsePolicy('').rules).toEqual([]);
  });
  it('adds a rule with defaults', () => {
    const p = addRule({ version: 1, rules: [] }, { text: 'No delegatecall to a non-constant address' });
    expect(p.rules).toHaveLength(1);
    expect(p.rules[0]!.severity).toBe('high');
    expect(p.rules[0]!.id).toBe('no-delegatecall-to-a-non-constant-address');
  });
  it('rejects duplicate rule ids', () => {
    const p = addRule({ version: 1, rules: [] }, { text: 'rule one', id: 'r1' });
    expect(() => addRule(p, { text: 'rule two', id: 'r1' })).toThrow(/already exists/);
  });
  it('removes a rule by id and errors on missing', () => {
    const p = addRule({ version: 1, rules: [] }, { text: 'x', id: 'r1' });
    expect(removeRule(p, 'r1').rules).toHaveLength(0);
    expect(() => removeRule(p, 'nope')).toThrow(/no rule/);
  });
  it('rejects an invalid policy file', () => {
    expect(() => parsePolicy('rules: "not a list"')).toThrow(/invalid policy/);
  });
});
