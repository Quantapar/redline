import type { ChatMessage, ChatResponse } from './router-client.js';
import { extractJson } from './hunter.js';

/** Mainstream models explain and fix well and rarely refuse here. */
export const DEFAULT_FIXER_MODEL = 'claude-sonnet-5.5';

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

export function parseFix(resp: ChatResponse): FixResult | null {
  const j = extractJson(resp.content) as Partial<FixResult> | null;
  if (!j || !j.fixedSource || !j.explanation) return null;
  return {
    explanation: String(j.explanation),
    fixedSource: String(j.fixedSource),
    diff: String(j.diff ?? ''),
  };
}
