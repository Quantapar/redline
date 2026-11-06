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

How verification works (write for it): a referee deploys the contract under review on a
fresh throwaway chain, replays any honest-user setup you describe, then deploys YOUR
contract from a separate wallet and calls attack() as an ordinary transaction. It measures
real balances before and after. Cheatcodes do nothing there, so anything that leans on one
simply fails to reproduce. Only a measured loss from the contract that lands with the
attacker counts.

Rules:
- Target ONLY the contract provided. Never reference external or third-party systems.
- Put the attack in "forgeTest" as ONE self-contained Solidity source (pragma ^0.8.20).
  It must declare a contract with exactly: constructor(address target) and
  attack() external payable. Reach the weakness only through the target's own
  public/external functions. Use no forge-std import and no cheatcode.
- Describe how to run it in "plan": attackerContract (its name), any honest-user setup as
  "seed" transactions to the target (sig/args/valueWei, as a normal depositor would send),
  and "stakeWei" the attacker itself contributes as msg.value to attack().
- A real finding means value provably leaves the contract to an account that should not get
  it, funded by the contract and not by your own setup.
- If you cannot construct a plausible reachable attack, return an empty array. Do not invent.

Return ONLY JSON: {"candidates":[{"weaknessClass","targetFunction","summary","forgeTest",
"claimedValueWei","plan":{"attackerContract","targetConstructorSig","targetConstructorArgs",
"targetDeployValueWei","seed":[{"sig","args","valueWei"}],"stakeWei"}}]}.
weaknessClass is one of the provided enum values.`;

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
