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

/**
 * Build the GitHub Check Run result from findings. Red (reproduced) findings
 * fail the check so the change cannot merge; everything else is neutral/success.
 */
export function buildCheckOutput(findings: Finding[], appUrl: string): CheckOutput {
  const red = findings.filter((f) => f.isRed);
  if (red.length === 0) {
    return {
      conclusion: 'success',
      title: 'No theft could be reproduced',
      summary: `Redline attacked the change and nothing paid out. ${findings.length} candidate(s) were searched; none reproduced.`,
    };
  }
  const lines = red
    .map((f) => `- **${f.title}** — reproduced by ${f.agreementCount}/${f.refereeCount} referees. [View the proof](${appUrl}/findings/${f.id})`)
    .join('\n');
  return {
    conclusion: 'failure',
    title: `${red.length} reproduced theft${red.length > 1 ? 's' : ''} — blocked from merging`,
    summary: `Redline took the money on a throwaway fork. Each alarm comes with a replayable attack.\n\n${lines}\n\nPress **Fix it** on a finding to open a reviewed PR with the fix and a permanent regression test.`,
  };
}
