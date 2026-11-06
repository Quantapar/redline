import { NextResponse } from 'next/server';
import { and, desc, eq, ne, sql, schema } from '@redline/db';
import { canDeploy, buildAttestation } from '@redline/gates';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const COUNCIL_KEY = 'redline.council.eth';

/**
 * The going-live gate as an API, so a deploy script can refuse to publish an
 * unchecked or red version:  GET /api/deploy-check?repo=owner/repo&version=<sha>
 * Returns { allowed, reason }. A deploy script exits non-zero when allowed=false.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const repoFullName = url.searchParams.get('repo');
  const version = url.searchParams.get('version');
  if (!repoFullName || !version) {
    return NextResponse.json({ allowed: false, reason: 'repo and version are required' }, { status: 400 });
  }

  const d = db();
  const [repo] = await d.select().from(schema.repositories).where(eq(schema.repositories.fullName, repoFullName)).limit(1);
  if (!repo) return NextResponse.json({ allowed: false, reason: 'repository not found' }, { status: 404 });

  // Find the completed scan for exactly this version.
  const [scan] = await d
    .select()
    .from(schema.scans)
    .where(and(eq(schema.scans.repositoryId, repo.id), eq(schema.scans.commitSha, version), eq(schema.scans.status, 'complete')))
    .orderBy(desc(schema.scans.createdAt))
    .limit(1);

  if (!scan) {
    return NextResponse.json({ allowed: false, reason: 'this version was never checked by Redline' }, { status: 200 });
  }

  // Count UNRESOLVED red findings for this scan now, so resolving a false positive
  // unblocks the deploy (the scan's redFindingCount is a frozen snapshot).
  const [open] = await d
    .select({ n: sql<number>`count(*)` })
    .from(schema.findings)
    .where(and(eq(schema.findings.scanId, scan.id), eq(schema.findings.isRed, true), ne(schema.findings.status, 'resolved')));
  const unresolvedRed = Number(open?.n ?? 0);

  // The gate must fail CLOSED: a deploy is allowed only when the council actually
  // reached a decisive verdict on every candidate. Count the candidates and the
  // decisive findings; if any candidate produced no finding, or a finding is
  // 'inconclusive' (not enough valid referee runs), the council did NOT complete,
  // so `canDeploy` will refuse rather than wave an unverified version through.
  const [cand] = await d
    .select({ n: sql<number>`count(*)` })
    .from(schema.candidates)
    .where(eq(schema.candidates.scanId, scan.id));
  const [dec] = await d
    .select({ n: sql<number>`count(*)` })
    .from(schema.findings)
    .where(and(eq(schema.findings.scanId, scan.id), ne(schema.findings.consensus, 'inconclusive')));
  const candidateCount = Number(cand?.n ?? 0);
  const decisiveCount = Number(dec?.n ?? 0);
  const councilComplete = decisiveCount >= candidateCount;

  const attestation = buildAttestation({
    versionHash: scan.commitSha,
    redFindingCount: unresolvedRed,
    councilComplete,
    issuer: COUNCIL_KEY,
  });
  const decision = canDeploy({ candidateVersionHash: version, attestation, councilKeys: [COUNCIL_KEY] });
  return NextResponse.json(decision, { status: 200 });
}
