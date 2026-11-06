import type { ChatMessage, ChatResponse } from './router-client.js';
import { extractJson } from './hunter.js';

/** Mainstream models explain and fix well and rarely refuse here. */
export const DEFAULT_FIXER_MODEL = 'gpt-5.5';

export interface FixResult {
  explanation: string;
  diff: string;
  fixedSource: string;
}

const SYSTEM = `You are a Solidity security engineer fixing a vulnerability in the authors' OWN contract.
Produce the SMALLEST change that closes the hole without altering unrelated behaviour. Prefer the
checks-effects-interactions pattern, a reentrancy guard, or the missing access-control modifier as
appropriate. Explain the fix in two or three plain sentences a non-expert can follow.

Return ONLY JSON: {"explanation": "...", "fixedSource": "<full corrected contract>", "diff": "<unified diff>"}.`;

export function buildFixMessages(input: {
  contractName: string;
  source: string;
  weaknessClass: string;
  summary: string;
}): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content: `Contract ${input.contractName} has a reproduced ${input.weaknessClass} vulnerability.
Finding: ${input.summary}

Current source:
\`\`\`solidity
${input.source}
\`\`\`

Return the corrected contract, a unified diff, and a plain explanation. JSON only.`,
    },
  ];
}

// Bounds on untrusted model output. The diff and explanation are persisted and
// the fixed source will be applied once PR-opening is wired, so an oversized
// payload from a compromised or errant model must be cut off. Generous for a
// real single-contract fix.
const MAX_EXPLANATION_CHARS = 2_000;
const MAX_DIFF_CHARS = 50_000;
const MAX_SOURCE_CHARS = 100_000;

export function parseFix(resp: ChatResponse): FixResult | null {
  const j = extractJson(resp.content) as Partial<FixResult> | null;
  if (!j || !j.fixedSource || !j.explanation) return null;
  return {
    explanation: String(j.explanation).slice(0, MAX_EXPLANATION_CHARS),
    fixedSource: String(j.fixedSource).slice(0, MAX_SOURCE_CHARS),
    diff: String(j.diff ?? '').slice(0, MAX_DIFF_CHARS),
  };
}
