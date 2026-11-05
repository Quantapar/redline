import { describe, it, expect } from 'vitest';
import { extractJson, parseCandidates, estimateCostCents } from '../src/hunter.js';
import type { ChatResponse } from '../src/router-client.js';

function resp(content: string): ChatResponse {
  return { content, model: 'glm-5.3-flash', usage: { promptTokens: 500, completionTokens: 800, totalTokens: 1300 }, receipt: 'r1' };
}

describe('candidate parsing', () => {
  it('extracts JSON from a fenced block', () => {
    const j = extractJson('here you go\n```json\n{"candidates":[]}\n```\nthanks') as { candidates: unknown[] };
    expect(j.candidates).toEqual([]);
  });
  it('extracts bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('returns null on garbage', () => {
    expect(extractJson('no json here')).toBeNull();
  });
  it('parses valid candidates and normalises the weakness class', () => {
    const r = resp(JSON.stringify({ candidates: [
      { weaknessClass: 'reentrancy', targetFunction: 'withdraw', summary: 'drains vault', forgeTest: 'function test(){}', claimedValueWei: '500', usedShortcuts: false },
      { weaknessClass: 'not-a-real-class', summary: 'x', forgeTest: 'function t(){}' },
    ] }));
    const cands = parseCandidates(r, 's1', 'Vault');
    expect(cands).toHaveLength(2);
    expect(cands[0]!.weaknessClass).toBe('reentrancy');
    expect(cands[1]!.weaknessClass).toBe('other'); // normalised
    expect(cands[0]!.hunterModel).toBe('glm-5.3-flash');
  });
  it('drops entries missing a forgeTest or summary', () => {
    const r = resp(JSON.stringify({ candidates: [{ weaknessClass: 'reentrancy' }] }));
    expect(parseCandidates(r, 's1', 'Vault')).toHaveLength(0);
  });
  it('sanitises a non-numeric claimedValueWei to 0', () => {
    const r = resp(JSON.stringify({ candidates: [{ summary: 'x', forgeTest: 'f', claimedValueWei: 'lots' }] }));
    expect(parseCandidates(r, 's1', 'V')[0]!.claimedValueWei).toBe('0');
  });
  it('estimates cost from usage with a floor', () => {
    expect(estimateCostCents(resp('{}'), 5)).toBeGreaterThanOrEqual(1);
  });
});

import { buildHuntMessages } from '../src/prompts.js';
import { WeaknessClass, DEFAULT_POLICY } from '@redline/shared';

describe('recipe hints in the hunt prompt', () => {
  const target = { contractName: 'Vault', filePath: 'src/Vault.sol', source: 'contract Vault {}', changedFunctions: [], analyzerNotes: [] };
  it('includes recipe titles when provided', () => {
    const msgs = buildHuntMessages(target, WeaknessClass.options, DEFAULT_POLICY, [
      { weaknessClass: 'reentrancy', title: 'Single-function reentrancy', template: 'Re-enter before the balance is zeroed.' },
    ]);
    const user = msgs.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Single-function reentrancy');
    expect(user).toContain('recipe library');
  });
  it('omits the recipe section when none are provided', () => {
    const msgs = buildHuntMessages(target, WeaknessClass.options, DEFAULT_POLICY, []);
    expect(msgs.find((m) => m.role === 'user')!.content).not.toContain('recipe library');
  });
});
