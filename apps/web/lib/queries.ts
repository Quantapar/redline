import { and, desc, eq, ne, inArray, sql, decrypt } from '@redline/db';
import { schema } from '@redline/db';
import { db } from './db';
import { viewerRepoIds } from './viewer';

/**
 * Every repository-derived query in this module is scoped to the signed-in
 * viewer. `viewerRepoIds()` returns the repository ids the viewer owns (through
 * installations → accounts), or an empty list for a signed-out / unconnected
 * viewer. Each query short-circuits to an empty result on an empty list, so the
 * dashboard never shows one tenant's findings, scans or repositories to another.
 * The recipe library is the only public, un-scoped data set.
 */

/**
 * Sum native value-at-risk across moved referee runs, counting each finding ONCE.
 * A red finding has several moved runs (one per agreeing referee) reporting the
 * same theft; counting them all would multiply the headline figure (a real bug we
 * had before). Pure and unit-tested so that dedup can't silently regress.
 */
export function sumNativeAtRisk(rows: { findingId: string; deltas: unknown }[]): bigint {
  let atRisk = 0n;
  const counted = new Set<string>();
  for (const r of rows) {
    if (counted.has(r.findingId)) continue; // one moved run per finding
    counted.add(r.findingId);
    try {
      for (const dlt of (r.deltas as { token: string; attackerNetOfGas: string }[]) ?? []) {
        if (dlt.token === 'native') { atRisk += BigInt(dlt.attackerNetOfGas); break; }
      }
    } catch { /* skip a malformed delta set */ }
  }
  return atRisk;
}

const EMPTY_STATS = {
  repos: 0,
  scans: 0,
  redFindings: 0,
  regressionTests: 0,
  valueAtRiskWei: '0',
};

export async function getStats() {
  const repoIds = await viewerRepoIds();
  if (repoIds.length === 0) return EMPTY_STATS;
  const d = db();

  const [repos] = await d
    .select({ n: sql<number>`count(*)` })
    .from(schema.repositories)
    .where(inArray(schema.repositories.id, repoIds));
  const [scans] = await d
    .select({ n: sql<number>`count(*)` })
    .from(schema.scans)
    .where(inArray(schema.scans.repositoryId, repoIds));
  const [red] = await d
    .select({ n: sql<number>`count(*)` })
    .from(schema.findings)
    .innerJoin(schema.scans, eq(schema.findings.scanId, schema.scans.id))
    .where(and(eq(schema.findings.isRed, true), inArray(schema.scans.repositoryId, repoIds)));
  const [reg] = await d
    .select({ n: sql<number>`count(*)` })
    .from(schema.regressionTests)
    .where(inArray(schema.regressionTests.repositoryId, repoIds));

  // value at risk: sum ONCE per unresolved red finding (take one moved referee run each).
  const movedRuns = await d
    .select({ findingId: schema.findings.id, deltas: schema.refereeRuns.deltas })
    .from(schema.refereeRuns)
    .innerJoin(schema.findings, eq(schema.refereeRuns.candidateId, schema.findings.candidateId))
    .innerJoin(schema.scans, eq(schema.findings.scanId, schema.scans.id))
    .where(
      and(
        eq(schema.findings.isRed, true),
        ne(schema.findings.status, 'resolved'),
        eq(schema.refereeRuns.outcome, 'moved'),
        inArray(schema.scans.repositoryId, repoIds),
      ),
    );
  const atRisk = sumNativeAtRisk(movedRuns);

  return {
    repos: Number(repos?.n ?? 0),
    scans: Number(scans?.n ?? 0),
    redFindings: Number(red?.n ?? 0),
    regressionTests: Number(reg?.n ?? 0),
    valueAtRiskWei: atRisk.toString(),
  };
}

export async function listRepositories() {
  const repoIds = await viewerRepoIds();
  if (repoIds.length === 0) return [];
  const d = db();
  // Three queries total, independent of repo count (no N+1), all scoped to the viewer.
  const [rows, allScans, redRows] = await Promise.all([
    d.select().from(schema.repositories).where(inArray(schema.repositories.id, repoIds)).orderBy(schema.repositories.fullName),
    d.select().from(schema.scans).where(inArray(schema.scans.repositoryId, repoIds)).orderBy(desc(schema.scans.createdAt)),
    d
      .select({ repositoryId: schema.scans.repositoryId, n: sql<number>`count(*)` })
      .from(schema.findings)
      .innerJoin(schema.scans, eq(schema.findings.scanId, schema.scans.id))
      .where(and(eq(schema.findings.isRed, true), inArray(schema.scans.repositoryId, repoIds)))
      .groupBy(schema.scans.repositoryId),
  ]);
  const latestByRepo = new Map<string, (typeof allScans)[number]>();
  for (const scan of allScans) if (!latestByRepo.has(scan.repositoryId)) latestByRepo.set(scan.repositoryId, scan);
  const redByRepo = new Map(redRows.map((r) => [r.repositoryId, Number(r.n)]));
  return rows.map((r) => ({ ...r, latestScan: latestByRepo.get(r.id) ?? null, redCount: redByRepo.get(r.id) ?? 0 }));
}

export async function listRecentScans(limit = 10) {
  const repoIds = await viewerRepoIds();
  if (repoIds.length === 0) return [];
  const d = db();
  return d
    .select({
      scan: schema.scans,
      repoName: schema.repositories.fullName,
    })
    .from(schema.scans)
    .innerJoin(schema.repositories, eq(schema.scans.repositoryId, schema.repositories.id))
    .where(inArray(schema.scans.repositoryId, repoIds))
    .orderBy(desc(schema.scans.createdAt))
    .limit(limit);
}

export async function getScanDetail(scanId: string) {
  const repoIds = await viewerRepoIds();
  if (repoIds.length === 0) return null;
  const d = db();
  const [scan] = await d.select().from(schema.scans).where(eq(schema.scans.id, scanId)).limit(1);
  if (!scan) return null;
  // Ownership check: the scan's repository must belong to the viewer.
  if (!repoIds.includes(scan.repositoryId)) return null;
  const [repo] = await d.select().from(schema.repositories).where(eq(schema.repositories.id, scan.repositoryId)).limit(1);
  const candidates = await d.select().from(schema.candidates).where(eq(schema.candidates.scanId, scanId));
  const findings = await d.select().from(schema.findings).where(eq(schema.findings.scanId, scanId)).orderBy(desc(schema.findings.isRed));
  return { scan, repo: repo ?? null, candidates, findings };
}

export async function getFindingDetail(findingId: string) {
  const repoIds = await viewerRepoIds();
  if (repoIds.length === 0) return null;
  const d = db();
  const [finding] = await d.select().from(schema.findings).where(eq(schema.findings.id, findingId)).limit(1);
  if (!finding) return null;
  const [scan] = await d.select().from(schema.scans).where(eq(schema.scans.id, finding.scanId)).limit(1);
  // Ownership check: the finding's scan must belong to one of the viewer's repositories.
  if (!scan || !repoIds.includes(scan.repositoryId)) return null;
  const [candidateRow] = await d.select().from(schema.candidates).where(eq(schema.candidates.id, finding.candidateId)).limit(1);
  const candidate = candidateRow ? { ...candidateRow, forgeTest: decrypt(candidateRow.forgeTest) } : undefined;
  const runs = candidate
    ? await d.select().from(schema.refereeRuns).where(eq(schema.refereeRuns.candidateId, candidate.id))
    : [];
  const repo = (await d.select().from(schema.repositories).where(eq(schema.repositories.id, scan.repositoryId)).limit(1))[0];
  return { finding, candidate: candidate ?? null, runs, scan, repo: repo ?? null };
}

export async function listAllFindings() {
  const repoIds = await viewerRepoIds();
  if (repoIds.length === 0) return [];
  const d = db();
  return d
    .select({ finding: schema.findings, repoName: schema.repositories.fullName })
    .from(schema.findings)
    .innerJoin(schema.scans, eq(schema.findings.scanId, schema.scans.id))
    .innerJoin(schema.repositories, eq(schema.scans.repositoryId, schema.repositories.id))
    .where(inArray(schema.scans.repositoryId, repoIds))
    .orderBy(desc(schema.findings.isRed), desc(schema.findings.createdAt));
}

export async function getDeployGates() {
  const repoIds = await viewerRepoIds();
  if (repoIds.length === 0) return [];
  const d = db();
  const repos = await d
    .select()
    .from(schema.repositories)
    .where(inArray(schema.repositories.id, repoIds))
    .orderBy(schema.repositories.fullName);
  const out = [];
  for (const r of repos) {
    const [scan] = await d
      .select()
      .from(schema.scans)
      .where(and(eq(schema.scans.repositoryId, r.id), eq(schema.scans.status, 'complete')))
      .orderBy(desc(schema.scans.createdAt))
      .limit(1);
    out.push({ repo: r, scan: scan ?? null });
  }
  return out;
}

export async function getRecipes() {
  // The recipe library is a public catalogue of attack templates; it holds no
  // private repository code and is intentionally visible to every viewer.
  const { listRecipes } = await import('@redline/db');
  return listRecipes(db());
}
