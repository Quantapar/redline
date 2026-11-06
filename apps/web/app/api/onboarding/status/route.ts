import { NextResponse } from 'next/server';
import { desc, eq, sql, schema } from '@redline/db';
import { db } from '@/lib/db';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/onboarding/status?repo=<GitHub repository id>
 *
 * What the onboarding's Attack step polls while someone waits: whether the
 * repo has been connected (the GitHub App install registered it) and how far its
 * latest scan has got. Public, since the onboarding runs signed out, so it only
 * ever returns progress: the stage, how many contracts, attacks and referee
 * runs. What the scan found stays behind sign-in on the dashboard.
 */
export async function GET(req: Request) {
  // Polled every few seconds, so the limit is generous per visitor
  const rl = rateLimit(`onboarding-status:${clientKey(req)}`, 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const repoParam = new URL(req.url).searchParams.get('repo') ?? '';
  if (!/^\d{1,15}$/.test(repoParam)) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const d = db();
  const [repo] = await d
    .select({ id: schema.repositories.id, fullName: schema.repositories.fullName })
    .from(schema.repositories)
    .where(eq(schema.repositories.githubRepoId, Number(repoParam)))
    .limit(1);
  if (!repo) return NextResponse.json({ connected: false });

  const [scan] = await d
    .select()
    .from(schema.scans)
    .where(eq(schema.scans.repositoryId, repo.id))
    .orderBy(desc(schema.scans.createdAt))
    .limit(1);
  if (!scan) return NextResponse.json({ connected: true, fullName: repo.fullName, scan: null });

  const [counts] = await d
    .select({
      attacks: sql<number>`count(distinct ${schema.candidates.id})`,
      refereeRuns: sql<number>`count(${schema.refereeRuns.id})`,
    })
    .from(schema.candidates)
    .leftJoin(schema.refereeRuns, eq(schema.refereeRuns.candidateId, schema.candidates.id))
    .where(eq(schema.candidates.scanId, scan.id));

  return NextResponse.json({
    connected: true,
    fullName: repo.fullName,
    scan: {
      id: scan.id,
      status: scan.status,
      commitSha: scan.commitSha,
      contracts: Array.isArray(scan.changedTargets) ? scan.changedTargets.length : 0,
      attacks: Number(counts?.attacks ?? 0),
      refereeRuns: Number(counts?.refereeRuns ?? 0),
      startedAt: scan.startedAt,
      finishedAt: scan.finishedAt,
      // Whether Redline actually posted a check run; without one, the UI must not claim it did
      checkPosted: Boolean(scan.githubCheckRunId),
      // The check Redline posted on the commit, live on GitHub
      checkUrl: scan.githubCheckRunId
        ? `https://github.com/${repo.fullName}/runs/${scan.githubCheckRunId}`
        : `https://github.com/${repo.fullName}/commit/${scan.commitSha}/checks`,
    },
  });
}
