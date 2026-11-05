import { NextResponse } from 'next/server';
import { and, desc, eq, schema } from '@redline/db';
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

  const attestation = buildAttestation({
    versionHash: scan.commitSha,
    redFindingCount: scan.redFindingCount,
    councilComplete: true,
    issuer: COUNCIL_KEY,
  });
  const decision = canDeploy({ candidateVersionHash: version, attestation, councilKeys: [COUNCIL_KEY] });
  return NextResponse.json(decision, { status: 200 });
}
