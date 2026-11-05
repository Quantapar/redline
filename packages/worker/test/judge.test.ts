import { describe, it, expect } from 'vitest';
import { judge } from '../src/judge.js';
import type { Candidate, Policy } from '@redline/shared';

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 'c1', scanId: 's1', hunterModel: 'glm-5.3', weaknessClass: 'reentrancy',
    targetContract: 'Vault', targetFunction: 'withdraw', summary: 'drains',
    forgeTest: 'f', steps: [], claimedValueWei: '0', usedShortcuts: false, createdAt: '', ...over,
  };
}
const noPolicy: Policy = { version: 1, rules: [] };

describe('judge — the panel ranks reproduced findings but never creates/cancels red', () => {
  it('assigns severity by weakness class', () => {
    expect(judge({ candidate: candidate({ weaknessClass: 'reentrancy' }), policy: noPolicy, priorFindingKeys: new Set() }).severity).toBe('critical');
    expect(judge({ candidate: candidate({ weaknessClass: 'logic-error' }), policy: noPolicy, priorFindingKeys: new Set() }).severity).toBe('medium');
    expect(judge({ candidate: candidate({ weaknessClass: 'other' }), policy: noPolicy, priorFindingKeys: new Set() }).severity).toBe('low');
  });
  it('marks setup unrealistic when the candidate used shortcuts', () => {
    expect(judge({ candidate: candidate({ usedShortcuts: true }), policy: noPolicy, priorFindingKeys: new Set() }).realisticSetup).toBe(false);
    expect(judge({ candidate: candidate({ usedShortcuts: false }), policy: noPolicy, priorFindingKeys: new Set() }).realisticSetup).toBe(true);
  });
  it('detects a duplicate by class:contract:function', () => {
    const keys = new Set(['reentrancy:Vault:withdraw']);
    expect(judge({ candidate: candidate(), policy: noPolicy, priorFindingKeys: keys }).isDuplicate).toBe(true);
    expect(judge({ candidate: candidate({ targetFunction: 'deposit' }), policy: noPolicy, priorFindingKeys: keys }).isDuplicate).toBe(false);
  });
  it('flags a policy rule broken by a function glob', () => {
    const policy: Policy = { version: 1, rules: [{ id: 'no-unguarded-withdraw', text: 'x', severity: 'high', appliesTo: ['withdraw*'] }] };
    const j = judge({ candidate: candidate({ targetFunction: 'withdrawAll' }), policy, priorFindingKeys: new Set() });
    expect(j.breaksPolicy).toContain('no-unguarded-withdraw');
  });
  it('a rule with empty appliesTo matches every finding', () => {
    const policy: Policy = { version: 1, rules: [{ id: 'global', text: 'x', severity: 'high', appliesTo: [] }] };
    expect(judge({ candidate: candidate(), policy, priorFindingKeys: new Set() }).breaksPolicy).toContain('global');
  });
  it('does not flag a rule whose glob does not match', () => {
    const policy: Policy = { version: 1, rules: [{ id: 'mint-only', text: 'x', severity: 'high', appliesTo: ['mint*'] }] };
    expect(judge({ candidate: candidate({ targetFunction: 'withdraw', targetContract: 'Vault' }), policy, priorFindingKeys: new Set() }).breaksPolicy).toEqual([]);
  });
});
