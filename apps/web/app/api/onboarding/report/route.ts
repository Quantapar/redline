import { NextResponse } from 'next/server';
import { decrypt, inArray, schema } from '@redline/db';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { getScanDetail } from '@/lib/queries';
import { netMovedWei } from '@/lib/referee-value';
import { isUuid } from '@/lib/validate';
import { fixOrder, reportAreas, reportScore, scoreLabel, type ReportFinding } from '@/lib/report';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/onboarding/report?scan=<scan id>
 *
 * The onboarding verdict for a finished scan: its score, every weakness class
 * the agents attacked and how each held up, and what to fix, with the exploit
 * test and any drafted patch for "Copy fix for agent". Signed in only, and
 * only for a scan of one of the viewer's own repositories (getScanDetail).
 */
export async function GET(req: Request) {
  const scanId = new URL(req.url).searchParams.get('scan') ?? '';
  if (!isUuid(scanId)) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: 'sign_in' }, { status: 401 });

  const detail = await getScanDetail(scanId);
  if (!detail) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { scan, repo, candidates, findings } = detail;

  const d = db();
  const candidateIds = candidates.map((c) => c.id);
  const findingIds = findings.map((f) => f.id);
  const [runs, fixes] = await Promise.all([
    candidateIds.length
      ? d.select({ candidateId: schema.refereeRuns.candidateId, outcome: schema.refereeRuns.outcome, deltas: schema.refereeRuns.deltas })
          .from(schema.refereeRuns)
          .where(inArray(schema.refereeRuns.candidateId, candidateIds))
      : Promise.resolve([]),
    findingIds.length
      ? d.select().from(schema.fixes).where(inArray(schema.fixes.findingId, findingIds))
      : Promise.resolve([]),
  ]);

  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const fixByFinding = new Map(fixes.map((f) => [f.findingId, f]));
  // The most one referee run moved, per candidate: what the exploit is worth
  const movedByCandidate = new Map<string, bigint>();
  for (const r of runs) {
    if (r.outcome !== 'moved') continue;
    const v = BigInt(netMovedWei(r.deltas));
    if (v > (movedByCandidate.get(r.candidateId) ?? 0n)) movedByCandidate.set(r.candidateId, v);
  }

  const all: ReportFinding[] = findings.map((f) => {
    const c = candidateById.get(f.candidateId);
    const fix = fixByFinding.get(f.id);
    let exploitTest: string | null = null;
    try {
      exploitTest = c?.forgeTest ? decrypt(c.forgeTest) : null;
    } catch {
      exploitTest = null; // a test stored under a rotated key: the brief goes without it
    }
    return {
      id: f.id,
      weaknessClass: f.weaknessClass,
      title: f.title,
      plainSentence: f.plainSentence,
      severity: f.severity,
      isRed: f.isRed,
      consensus: f.consensus,
      agreementCount: f.agreementCount,
      refereeCount: f.refereeCount,
      targetContract: c?.targetContract ?? null,
      targetFunction: c?.targetFunction ?? null,
      movedWei: (movedByCandidate.get(f.candidateId) ?? 0n).toString(),
      exploitTest,
      fix: fix ? { explanation: fix.explanation, diff: fix.diff } : null,
    };
  });

  const score = reportScore(all);
  return NextResponse.json({
    repo: repo?.fullName ?? null,
    scan: {
      id: scan.id,
      status: scan.status,
      commitSha: scan.commitSha,
      contracts: Array.isArray(scan.changedTargets) ? scan.changedTargets.length : 0,
      finishedAt: scan.finishedAt ?? scan.createdAt ?? null,
    },
    score,
    label: scoreLabel(score),
    areas: reportAreas(candidates, all),
    fixes: fixOrder(all),
    attacks: candidates.length,
    // Referee runs that actually executed on a fork; errors and failed builds don't count
    replays: runs.filter((r) => r.outcome === 'moved' || r.outcome === 'did-not-move').length,
  });
}
