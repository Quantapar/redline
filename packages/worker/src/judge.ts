import type { Candidate, Policy, Severity, WeaknessClass, PanelJudgment } from '@redline/shared';

const SEVERITY_BY_CLASS: Record<WeaknessClass, Severity> = {
  reentrancy: 'critical',
  'access-control': 'critical',
  'unchecked-external-call': 'high',
  'integer-overflow': 'high',
  'price-oracle-manipulation': 'critical',
  'flash-loan': 'high',
  'logic-error': 'medium',
  'uninitialized-storage': 'high',
  delegatecall: 'critical',
  'signature-replay': 'high',
  dos: 'medium',
  'front-running': 'medium',
  other: 'low',
};

/**
 * The judgment panel: ranks and explains a REPRODUCED finding. It never creates
 * or cancels a red result — it only runs on findings the council already proved,
 * and assigns severity, realism, duplicate status, and policy breaches.
 */
export function judge(input: {
  candidate: Candidate;
  policy: Policy;
  priorFindingKeys: Set<string>; // weaknessClass:contract:function seen earlier
}): PanelJudgment {
  const { candidate, policy } = input;
  const key = `${candidate.weaknessClass}:${candidate.targetContract}:${candidate.targetFunction ?? ''}`;
  const isDuplicate = input.priorFindingKeys.has(key);

  const breaks: string[] = [];
  for (const rule of policy.rules) {
    const applies =
      rule.appliesTo.length === 0 ||
      rule.appliesTo.some((g) => matchGlob(g, candidate.targetFunction ?? '') || matchGlob(g, candidate.targetContract));
    if (applies) breaks.push(rule.id);
  }

  return {
    severity: SEVERITY_BY_CLASS[candidate.weaknessClass],
    realisticSetup: !candidate.usedShortcuts,
    isDuplicate,
    duplicateOf: null,
    breaksPolicy: breaks,
    rationale:
      `Reproduced by the council. Class ${candidate.weaknessClass} on ${candidate.targetContract}` +
      `${candidate.targetFunction ? '.' + candidate.targetFunction : ''}.` +
      (breaks.length ? ` Breaks policy: ${breaks.join(', ')}.` : ''),
  };
}

function matchGlob(glob: string, value: string): boolean {
  const re = new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i');
  return re.test(value);
}
