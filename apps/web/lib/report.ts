/**
 * The onboarding's report, built only from what a scan stored: which weakness
 * classes the agents attacked (candidates), what the referees reproduced
 * (findings), and the fix Redline drafted, if any. Pure, so it is tested
 * without a database and runs the same on the server and in the page.
 */

export type Verdict = 'red' | 'warn' | 'ok';

export interface ReportFinding {
  id: string;
  weaknessClass: string;
  title: string;
  plainSentence: string;
  severity: string | null;
  isRed: boolean;
  consensus: string;
  agreementCount: number;
  refereeCount: number;
  targetContract: string | null;
  targetFunction: string | null;
  /** Largest net value one referee run moved, in wei ('0' when none). */
  movedWei: string;
  /** The Foundry test that reproduces the exploit, when it was kept. */
  exploitTest: string | null;
  /** The patch Redline drafted for it, when one was generated. */
  fix: { explanation: string; diff: string } | null;
}

export interface ReportArea {
  weaknessClass: string;
  verdict: Verdict;
  /** Findings of this class (any verdict). */
  findings: number;
}

/** What a finding counts as: reproduced, shaky, or nothing proven. */
export function findingVerdict(f: Pick<ReportFinding, 'isRed' | 'consensus'>): Verdict {
  if (f.isRed) return 'red';
  return f.consensus === 'fragile' || f.consensus === 'inconclusive' ? 'warn' : 'ok';
}

// What one reproduced exploit costs the score, by severity. Unrated ones count
// as high: they moved money, the judge just didn't grade them.
const RED_PENALTY: Record<string, number> = { critical: 45, high: 30, medium: 15, low: 8, info: 4 };
const WARN_PENALTY = 5;

/** 100 with nothing reproduced; each reproduced exploit takes off by severity. */
export function reportScore(findings: Pick<ReportFinding, 'isRed' | 'consensus' | 'severity'>[]): number {
  let score = 100;
  for (const f of findings) {
    const v = findingVerdict(f);
    if (v === 'red') score -= RED_PENALTY[f.severity ?? ''] ?? RED_PENALTY.high!;
    else if (v === 'warn') score -= WARN_PENALTY;
  }
  return Math.max(0, Math.min(100, score));
}

export function scoreLabel(score: number): string {
  if (score >= 85) return 'Holding up';
  if (score >= 50) return 'Needs work';
  return 'At risk';
}

const RANK: Record<Verdict, number> = { red: 0, warn: 1, ok: 2 };

/**
 * One row per weakness class the agents attacked, worst first: red when any
 * finding of it was reproduced, warn when one was shaky, ok when it was
 * attacked and nothing moved.
 */
export function reportAreas(
  attacked: { weaknessClass: string }[],
  findings: Pick<ReportFinding, 'weaknessClass' | 'isRed' | 'consensus'>[],
): ReportArea[] {
  const areas = new Map<string, ReportArea>();
  for (const c of attacked) {
    if (!areas.has(c.weaknessClass)) areas.set(c.weaknessClass, { weaknessClass: c.weaknessClass, verdict: 'ok', findings: 0 });
  }
  for (const f of findings) {
    const a = areas.get(f.weaknessClass) ?? { weaknessClass: f.weaknessClass, verdict: 'ok' as Verdict, findings: 0 };
    const v = findingVerdict(f);
    if (RANK[v] < RANK[a.verdict]) a.verdict = v;
    a.findings += 1;
    areas.set(f.weaknessClass, a);
  }
  return [...areas.values()].sort((x, y) => RANK[x.verdict] - RANK[y.verdict] || x.weaknessClass.localeCompare(y.weaknessClass));
}

/** The fixes worth showing, most urgent first: reproduced, then shaky. */
export function fixOrder<T extends Pick<ReportFinding, 'isRed' | 'consensus' | 'severity'>>(findings: T[]): T[] {
  const sev: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return findings
    .filter((f) => findingVerdict(f) !== 'ok')
    .sort(
      (a, b) =>
        RANK[findingVerdict(a)] - RANK[findingVerdict(b)] || (sev[a.severity ?? ''] ?? 1) - (sev[b.severity ?? ''] ?? 1),
    );
}

/**
 * What "Copy fix for agent" puts on the clipboard: a self-contained brief a
 * coding agent (Claude Code, Cursor, Copilot) can act on, with the exploit that
 * proves it and Redline's drafted patch when there is one.
 */
export function agentPrompt(repo: string, f: ReportFinding): string {
  const where = [f.targetContract, f.targetFunction && `${f.targetFunction}()`].filter(Boolean).join('.');
  const proof = f.isRed
    ? `Redline reproduced it on a mainnet fork: ${f.agreementCount} of ${f.refereeCount} independent referees moved funds.`
    : `Redline flagged it, but only ${f.agreementCount} of ${f.refereeCount} referees reproduced it, so treat it as likely rather than proven.`;
  return [
    `Fix this security issue in ${repo}${where ? `, in ${where}` : ''}.`,
    '',
    `## ${f.title}`,
    '',
    f.plainSentence,
    '',
    proof,
    ...(f.exploitTest ? ['', 'The exploit, as a Foundry test that passes while the bug is there:', '', '```solidity', f.exploitTest.trim(), '```'] : []),
    ...(f.fix ? ['', "Redline's suggested patch:", '', f.fix.explanation.trim(), '', '```diff', f.fix.diff.trim(), '```'] : []),
    '',
    'Make the smallest change that stops the exploit, keep the exploit test, and make it fail on the bug and pass once fixed.',
  ].join('\n');
}
