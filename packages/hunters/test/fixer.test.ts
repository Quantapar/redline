import { describe, it, expect } from 'vitest';
import { buildFixMessages, parseFix, DEFAULT_FIXER_MODEL } from '../src/fixer.js';
import type { ChatResponse } from '../src/router-client.js';

function resp(content: string): ChatResponse {
  return { content, model: DEFAULT_FIXER_MODEL, usage: null, receipt: 'r1' };
}

describe('fixer', () => {
  it('builds a fix prompt that includes the contract and the finding', () => {
    const msgs = buildFixMessages({ contractName: 'Vault', source: 'contract Vault {}', weaknessClass: 'reentrancy', summary: 'drains the vault' });
    expect(msgs[0]!.role).toBe('system');
    const user = msgs.find((m) => m.role === 'user')!.content;
    expect(user).toContain('Vault');
    expect(user).toContain('reentrancy');
    expect(user).toContain('drains the vault');
  });

  it('is a mainstream, non-refusing model', () => {
    expect(DEFAULT_FIXER_MODEL).not.toMatch(/deepseek|qwen|glm|kimi|whiterabbit|hermes/i);
  });

  it('parses a fix out of a fenced JSON response', () => {
    const fix = parseFix(resp('```json\n' + JSON.stringify({ explanation: 'Zero the balance first.', fixedSource: 'contract Vault { }', diff: '--- a\n+++ b' }) + '\n```'));
    expect(fix?.explanation).toBe('Zero the balance first.');
    expect(fix?.fixedSource).toContain('Vault');
    expect(fix?.diff).toContain('+++');
  });

  it('returns null when the response lacks a usable fix', () => {
    expect(parseFix(resp('no json here'))).toBeNull();
    expect(parseFix(resp(JSON.stringify({ explanation: 'x' })))).toBeNull(); // no fixedSource
  });

  it('defaults the diff to empty when absent', () => {
    const fix = parseFix(resp(JSON.stringify({ explanation: 'e', fixedSource: 's' })));
    expect(fix?.diff).toBe('');
  });

  it('bounds oversized model output (explanation, diff, fixedSource)', () => {
    const huge = 'A'.repeat(200_000);
    const fix = parseFix(resp(JSON.stringify({ explanation: huge, fixedSource: huge, diff: huge })));
    expect(fix!.explanation.length).toBeLessThanOrEqual(2_000);
    expect(fix!.diff.length).toBeLessThanOrEqual(50_000);
    expect(fix!.fixedSource.length).toBeLessThanOrEqual(100_000);
  });
});
