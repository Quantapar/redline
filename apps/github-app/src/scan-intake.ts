import type { Finding } from '@redline/shared';

export interface IntakeEvent {
  action: 'push' | 'pull_request';
  defaultBranch: string;
  ref: string;              // e.g. refs/heads/main or the PR head ref
  headSha: string;
  baseSha: string | null;   // null -> first scan (whole codebase)
  prNumber: number | null;
  changedFiles: string[];
}

export interface IntakeDecision {
  shouldScan: boolean;
  trigger: 'first-scan' | 'push' | 'pull-request';
  isIncremental: boolean;
  solidityFiles: string[];
  reason: string;
}

const SOL = /\.sol$/i;
const IGNORED = /(^|\/)(test|tests|mock|mocks|script|scripts|lib|node_modules)\//i;

/**
 * Decide whether and how to scan from a webhook event. Pure and testable.
 * We scan only when Solidity contracts changed, and scan incrementally unless
 * there is no base to diff against (the first scan).
 */
export function decideIntake(ev: IntakeEvent): IntakeDecision {
  const solidityFiles = ev.changedFiles.filter((f) => SOL.test(f) && !IGNORED.test(f));
  if (ev.action === 'push' && ev.ref !== `refs/heads/${ev.defaultBranch}` && ev.prNumber === null) {
    // ignore pushes to non-default branches that are not PRs
    return { shouldScan: false, trigger: 'push', isIncremental: true, solidityFiles, reason: 'push to non-default branch without PR' };
  }
  if (solidityFiles.length === 0 && ev.baseSha !== null) {
    return { shouldScan: false, trigger: ev.prNumber ? 'pull-request' : 'push', isIncremental: true, solidityFiles, reason: 'no Solidity contracts changed' };
  }
  const trigger = ev.baseSha === null ? 'first-scan' : ev.prNumber ? 'pull-request' : 'push';
  return {
    shouldScan: true,
    trigger,
    isIncremental: ev.baseSha !== null,
    solidityFiles,
    reason: trigger === 'first-scan' ? 'first scan of the repo' : `${solidityFiles.length} contract file(s) changed`,
  };
}

// ---- Check Run output ----

export interface CheckOutput {
  conclusion: 'success' | 'failure' | 'neutral';
  title: string;
  summary: string;
}

/** The verdict a finished scan supports. Only 'clean' may claim nothing paid out. */
export type Verdict = 'red' | 'unverified' | 'clean';

export type VerdictFinding = Pick<Finding, 'id' | 'title' | 'consensus' | 'isRed' | 'agreementCount' | 'refereeCount' | 'plainSentence'> & {
  severity?: string | null;
};

/** What the scan row says about completeness. Omitted fields mean "complete, every candidate judged". */
export interface ScanFacts {
  status?: string;
  candidateCount?: number;
}

export interface VerdictSummary {
  verdict: Verdict;
  red: VerdictFinding[];
  inconclusive: VerdictFinding[];
  fragile: VerdictFinding[];
  /** candidates that never produced a finding (their verification errored) */
  unchecked: number;
  cancelled: boolean;
  incomplete: boolean;
  candidateCount: number;
}

/**
 * Red if any theft reproduced (a proof stands even if the scan was cut short).
 * Clean ONLY when the scan completed and every candidate got a not-reproduced
 * verdict from the referees. Anything else proved nothing either way, so it is
 * 'unverified' and must never be reported as a pass.
 */
export function summarizeScan(findings: VerdictFinding[], facts: ScanFacts = {}): VerdictSummary {
  const red = findings.filter((f) => f.isRed);
  const inconclusive = findings.filter((f) => !f.isRed && f.consensus === 'inconclusive');
  const fragile = findings.filter((f) => !f.isRed && f.consensus === 'fragile');
  const candidateCount = facts.candidateCount ?? findings.length;
  const unchecked = Math.max(0, candidateCount - findings.length);
  const status = facts.status ?? 'complete';
  const cancelled = status === 'cancelled';
  const incomplete = status !== 'complete';
  const verdict: Verdict = red.length > 0
    ? 'red'
    : inconclusive.length || fragile.length || unchecked || incomplete ? 'unverified' : 'clean';
  return { verdict, red, inconclusive, fragile, unchecked, cancelled, incomplete, candidateCount };
}

export function scanVerdict(findings: VerdictFinding[], facts?: ScanFacts): Verdict {
  return summarizeScan(findings, facts).verdict;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Why a scan has no verdict, one plain clause per cause. */
function noVerdictReasons(s: VerdictSummary): string[] {
  const r: string[] = [];
  if (s.inconclusive.length) r.push(`${plural(s.inconclusive.length, 'suspected weakness', 'suspected weaknesses')} could not be replayed by the referees`);
  if (s.fragile.length) r.push(`${plural(s.fragile.length, 'suspected weakness', 'suspected weaknesses')} split the referees: some saw money move, some did not`);
  if (s.unchecked) r.push(`${plural(s.unchecked, 'candidate attack', 'candidate attacks')} never reached the referees because verification errored`);
  if (s.cancelled) r.push('the scan was cancelled before it finished');
  else if (s.incomplete) r.push('the scan did not finish');
  return r;
}

const MAX_FIELD = 300;
const MAX_ROWS = 20;

/**
 * Make model- or PR-author-influenced text inert inside GitHub markdown: one
 * line, length-capped, markdown/HTML metacharacters escaped, and @mentions,
 * #references and bare links defused so a crafted contract can't forge headings,
 * break the table, ping people, or plant a clickable phishing link.
 */
export function inert(text: string, max = MAX_FIELD): string {
  let t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length > max) t = `${t.slice(0, max - 1)}…`;
  return t
    .replace(/[\\`*_[\]<>|~]/g, (c) => `\\${c}`)
    .replace(/[@#]/g, (c) => `${c}\u200b`)
    .replace(/\b(https?|ftp):\/\//gi, '$1\u200b://')
    .replace(/\bwww\./gi, 'www\u200b.');
}

/**
 * Build the GitHub Check Run result from findings. Red (reproduced) findings
 * fail the check so the change cannot merge. A scan without a full referee
 * verdict is neutral (neither blocks nor clears); only a real verdict passes.
 */
export function buildCheckOutput(findings: VerdictFinding[], appUrl: string, facts?: ScanFacts): CheckOutput {
  const s = summarizeScan(findings, facts);
  if (s.verdict === 'unverified') {
    const reasons = noVerdictReasons(s).join('; ');
    return {
      conclusion: 'neutral',
      title: 'No verdict: Redline could not prove this change either way',
      summary: `This is not a pass. ${reasons.charAt(0).toUpperCase()}${reasons.slice(1)}. The change is neither blocked nor cleared.`,
    };
  }
  if (s.verdict === 'clean') {
    return {
      conclusion: 'success',
      title: 'No theft could be reproduced',
      summary: s.candidateCount === 0
        ? "Redline's hunters found no plausible attack on the changed contracts."
        : `Redline attacked the change and nothing paid out. ${plural(s.candidateCount, 'candidate attack was', 'candidate attacks were')} tried; none reproduced.`,
    };
  }
  const lines = s.red
    .slice(0, MAX_ROWS)
    .map((f) => `- **${inert(f.title)}**: reproduced by ${f.agreementCount}/${f.refereeCount} referees. [View the proof](${appUrl}/findings/${f.id})`)
    .join('\n');
  return {
    conclusion: 'failure',
    title: `${plural(s.red.length, 'reproduced theft', 'reproduced thefts')}: blocked from merging`,
    summary: `Redline took the money on a throwaway fork. Each alarm comes with a replayable attack.\n\n${lines}\n\nPress **Fix it** on a finding to generate the smallest fix and save the attack as a permanent regression test.`,
  };
}

// ---- Pull request verdict comment ----

/** Hidden marker that identifies Redline's single sticky comment on a PR. */
export const VERDICT_MARKER = '<!-- redline:verdict -->';

export interface CommentContext extends ScanFacts {
  appUrl: string;
  scanId: string;
  commitSha: string;
}

const short = (sha: string) => sha.slice(0, 7);

function footer(ctx: CommentContext): string {
  return `<sub>Commit \`${short(ctx.commitSha)}\` · [Open the scan](${ctx.appUrl}/scans/${ctx.scanId}) · Redline: proof, not opinion</sub>`;
}

function moreRows(total: number): string[] {
  return total > MAX_ROWS ? [`| …and ${total - MAX_ROWS} more | | | |`] : [];
}

/** The comment posted the moment a scan is queued; edited in place when it ends. */
export function buildPendingComment(ctx: CommentContext): string {
  return [
    VERDICT_MARKER,
    '## 🟡 Redline is attacking this change',
    '',
    'Hunters are searching the changed contracts for a way to take the money. Every candidate is then replayed by independent referees on throwaway forks. You are only blocked if they agree the money moved.',
    '',
    'This comment updates with the verdict when the scan finishes.',
    '',
    '---',
    footer(ctx),
  ].join('\n');
}

/**
 * The verdict comment for a finished (or errored) scan. Pure, so every wording
 * path is unit-tested. Honest by construction: only a complete, fully judged
 * scan is reported as clean, and every "no verdict" says why.
 */
export function buildVerdictComment(
  findings: VerdictFinding[],
  ctx: CommentContext,
  outcome: 'completed' | 'failed' = 'completed',
): string {
  const lines: string[] = [VERDICT_MARKER];
  const s = summarizeScan(findings, ctx);

  if (outcome === 'failed') {
    lines.push(
      '## ⚠️ Redline could not finish this scan',
      '',
      'The scan errored before reaching a verdict. Nothing was proven either way, so this does not block the merge. Push a new commit or re-open the PR to try again.',
    );
  } else if (s.verdict === 'red') {
    lines.push(
      `## 🔴 ${plural(s.red.length, 'reproduced theft', 'reproduced thefts')}: merge blocked`,
      '',
      'Redline replayed the attack as plain transactions on independent throwaway forks, and the referees agreed the money moved. Nothing real was at stake.',
      '',
      '| Finding | Severity | Referees | Proof |',
      '| --- | --- | --- | --- |',
      ...s.red.slice(0, MAX_ROWS).map((f) => `| **${inert(f.title)}** | ${inert(f.severity ?? '-', 20)} | ${f.agreementCount}/${f.refereeCount} agreed | [View proof](${ctx.appUrl}/findings/${f.id}) |`),
      ...moreRows(s.red.length),
      '',
      '<details><summary>What happened</summary>',
      '',
      ...s.red.slice(0, MAX_ROWS).map((f) => `- **${inert(f.title)}**: ${inert(f.plainSentence)}`),
      '',
      '</details>',
      '',
      'Press **Fix it** on a finding to generate the smallest fix. The attack is saved as a permanent regression test that re-runs on every future change.',
    );
  } else if (s.verdict === 'unverified') {
    const open = [...s.inconclusive, ...s.fragile];
    lines.push(
      '## ⚪ No verdict: Redline could not prove this change either way',
      '',
      '**This is not a pass.** The change is neither blocked nor cleared, because:',
      '',
      ...noVerdictReasons(s).map((r) => `- ${r}`),
    );
    if (open.length) {
      lines.push(
        '',
        '| Suspected | Referees | Details |',
        '| --- | --- | --- |',
        ...open.slice(0, MAX_ROWS).map((f) => `| ${inert(f.title)} | ${f.refereeCount > 0 ? `${f.agreementCount}/${f.refereeCount} saw money move` : 'could not replay'} | [Open](${ctx.appUrl}/findings/${f.id}) |`),
        ...(open.length > MAX_ROWS ? [`| …and ${open.length - MAX_ROWS} more | | |`] : []),
      );
    }
  } else {
    lines.push(
      '## 🟢 No theft could be reproduced',
      '',
      s.candidateCount === 0
        ? "Redline's hunters found no plausible attack on the changed contracts."
        : `Redline attacked the change and nothing paid out. ${plural(s.candidateCount, 'candidate attack was', 'candidate attacks were')} tried, and the referees agreed none of them moved money.`,
      '',
      '<sub>This means the change survived these attacks, at this time. It is not a guarantee the code is bug-free.</sub>',
    );
  }

  lines.push('', '---', footer(ctx));
  return lines.join('\n');
}
