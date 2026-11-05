import type { WeaknessClass, Policy } from '@redline/shared';
import type { ChatMessage } from './router-client.js';

export interface RecipeHint {
  weaknessClass: string;
  title: string;
  template: string;
}

export interface HuntTarget {
  contractName: string;
  filePath: string;
  source: string;                 // the contract's own source (customer code)
  changedFunctions: string[];
  analyzerNotes: string[];        // focus hints from Slither/Aderyn
}

const SYSTEM = `You are a smart-contract security engineer writing proof-of-concept tests
for the contract's OWN authors, to be run only on a local throwaway fork with fake funds.
Your job is defensive: show whether a suspected weakness is actually reachable through the
contract's public interface, so the team can fix it before anyone else finds it.

Rules:
- Target ONLY the contract provided. Never reference external or third-party systems.
- Write a self-contained Foundry test (Solidity, forge-std) that reaches the weakness
  through the contract's own public/external functions.
- Prefer plain transactions from one ordinary wallet. If you use any forge cheatcode that
  grants unearned advantage (vm.deal, vm.prank, vm.store, deal, hoax), mark usedShortcuts=true;
  the verification stage will re-run without them.
- A real finding means value provably leaves the contract to an account that should not get it.
- If you cannot construct a plausible reachable attack, return an empty array. Do not invent.

Return ONLY JSON: {"candidates":[{"weaknessClass","targetFunction","summary","forgeTest",
"claimedValueWei","usedShortcuts"}]}. weaknessClass is one of the provided enum values.`;

export function buildHuntMessages(
  target: HuntTarget,
  weaknessClasses: readonly WeaknessClass[],
  policy: Policy,
  recipes: RecipeHint[] = [],
): ChatMessage[] {
  const policyText = policy.rules.length
    ? `\nTeam security policy (pay special attention; flag violations):\n` +
      policy.rules.map((r) => `- [${r.id}] ${r.text}`).join('\n')
    : '';
  const focus = target.analyzerNotes.length
    ? `\nStatic-analysis focus hints:\n` + target.analyzerNotes.map((n) => `- ${n}`).join('\n')
    : '';
  const recipeText = recipes.length
    ? `\nKnown attack patterns worth trying (from the shared recipe library):\n` +
      recipes.slice(0, 12).map((r) => `- [${r.weaknessClass}] ${r.title}: ${r.template}`).join('\n')
    : '';
  const changed = target.changedFunctions.length
    ? `\nChanged functions to prioritise: ${target.changedFunctions.join(', ')}`
    : '';
  const user = `Contract: ${target.contractName} (${target.filePath})
Allowed weaknessClass values: ${weaknessClasses.join(', ')}${changed}${focus}${recipeText}${policyText}

Source:
\`\`\`solidity
${target.source}
\`\`\`

Produce candidate proof-of-concept tests as specified. JSON only.`;
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: user },
  ];
}
