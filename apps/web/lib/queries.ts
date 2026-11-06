import { and, desc, eq, ne, sql, decrypt } from '@redline/db';
import { schema } from '@redline/db';
import { db } from './db';

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

export async function getStats() {
  const d = db();
  const [repos] = await d.select({ n: sql<number>`count(*)` }).from(schema.repositories);
  const [scans] = await d.select({ n: sql<number>`count(*)` }).from(schema.scans);
  const [red] = await d.select({ n: sql<number>`count(*)` }).from(schema.findings).where(eq(schema.findings.isRed, true));
  const [reg] = await d.select({ n: sql<number>`count(*)` }).from(schema.regressionTests);

  // value at risk: sum ONCE per unresolved red finding (take one moved referee run each).
  const movedRuns = await d
    .select({ findingId: schema.findings.id, deltas: schema.refereeRuns.deltas })
    .from(schema.refereeRuns)
    .innerJoin(schema.findings, eq(schema.refereeRuns.candidateId, schema.findings.candidateId))
    .where(
      and(
        eq(schema.findings.isRed, true),
        ne(schema.findings.status, 'resolved'),
        eq(schema.refereeRuns.outcome, 'moved'),
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
  const d = db();
  // Three queries total, independent of repo count (no N+1).
  const [rows, allScans, redRows] = await Promise.all([
    d.select().from(schema.repositories).orderBy(schema.repositories.fullName),
    d.select().from(schema.scans).orderBy(desc(schema.scans.createdAt)),
    d
      .select({ repositoryId: schema.scans.repositoryId, n: sql<number>`count(*)` })
      .from(schema.findings)
      .innerJoin(schema.scans, eq(schema.findings.scanId, schema.scans.id))
      .where(eq(schema.findings.isRed, true))
      .groupBy(schema.scans.repositoryId),
  ]);
  const latestByRepo = new Map<string, (typeof allScans)[number]>();
  for (const scan of allScans) if (!latestByRepo.has(scan.repositoryId)) latestByRepo.set(scan.repositoryId, scan);
  const redByRepo = new Map(redRows.map((r) => [r.repositoryId, Number(r.n)]));
  return rows.map((r) => ({ ...r, latestScan: latestByRepo.get(r.id) ?? null, redCount: redByRepo.get(r.id) ?? 0 }));
}

export async function listRecentScans(limit = 10) {
  const d = db();
  return d
    .select({
      scan: schema.scans,
      repoName: schema.repositories.fullName,
    })
    .from(schema.scans)
    .innerJoin(schema.repositories, eq(schema.scans.repositoryId, schema.repositories.id))
    .orderBy(desc(schema.scans.createdAt))
    .limit(limit);
}

export async function getScanDetail(scanId: string) {
  const d = db();
  const [scan] = await d.select().from(schema.scans).where(eq(schema.scans.id, scanId)).limit(1);
  if (!scan) return null;
  const [repo] = await d.select().from(schema.repositories).where(eq(schema.repositories.id, scan.repositoryId)).limit(1);
  const candidates = await d.select().from(schema.candidates).where(eq(schema.candidates.scanId, scanId));
  const findings = await d.select().from(schema.findings).where(eq(schema.findings.scanId, scanId)).orderBy(desc(schema.findings.isRed));
  return { scan, repo: repo ?? null, candidates, findings };
}

export async function getFindingDetail(findingId: string) {
  const d = db();
  const [finding] = await d.select().from(schema.findings).where(eq(schema.findings.id, findingId)).limit(1);
  if (!finding) return null;
  const [candidateRow] = await d.select().from(schema.candidates).where(eq(schema.candidates.id, finding.candidateId)).limit(1);
  const candidate = candidateRow ? { ...candidateRow, forgeTest: decrypt(candidateRow.forgeTest) } : undefined;
  const runs = candidate
    ? await d.select().from(schema.refereeRuns).where(eq(schema.refereeRuns.candidateId, candidate.id))
    : [];
  const [scan] = await d.select().from(schema.scans).where(eq(schema.scans.id, finding.scanId)).limit(1);
  const repo = scan ? (await d.select().from(schema.repositories).where(eq(schema.repositories.id, scan.repositoryId)).limit(1))[0] : null;
  return { finding, candidate: candidate ?? null, runs, scan: scan ?? null, repo: repo ?? null };
}

export async function listAllFindings() {
  const d = db();
  return d
    .select({ finding: schema.findings, repoName: schema.repositories.fullName })
    .from(schema.findings)
    .innerJoin(schema.scans, eq(schema.findings.scanId, schema.scans.id))
    .innerJoin(schema.repositories, eq(schema.scans.repositoryId, schema.repositories.id))
    .orderBy(desc(schema.findings.isRed), desc(schema.findings.createdAt));
}

export async function getDeployGates() {
  const d = db();
  const repos = await d.select().from(schema.repositories).orderBy(schema.repositories.fullName);
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
  const { listRecipes } = await import('@redline/db');
  return listRecipes(db());
}
