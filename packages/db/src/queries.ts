import { eq, desc, and, notInArray } from 'drizzle-orm';
import type { Database } from './client.js';
import * as s from './schema.js';

const TERMINAL_SCAN_STATUSES = ['complete', 'failed', 'cancelled'] as const;

// ---- Scans ----
export async function createScan(
  db: Database,
  input: {
    repositoryId: string;
    trigger: typeof s.scanTriggerEnum.enumValues[number];
    commitSha: string;
    baseSha?: string | null;
    prNumber?: number | null;
    isIncremental?: boolean;
    changedTargets?: unknown;
    budgetCapCents?: number;
  },
) {
  const [row] = await db
    .insert(s.scans)
    .values({
      repositoryId: input.repositoryId,
      trigger: input.trigger,
      commitSha: input.commitSha,
      baseSha: input.baseSha ?? null,
      prNumber: input.prNumber ?? null,
      isIncremental: input.isIncremental ?? true,
      changedTargets: (input.changedTargets ?? []) as object,
      budgetCapCents: input.budgetCapCents ?? 500,
    })
    .returning();
  return row!;
}

export async function setScanStatus(
  db: Database,
  scanId: string,
  status: typeof s.scanStatusEnum.enumValues[number],
  patch: Partial<typeof s.scans.$inferInsert> = {},
) {
  await db.update(s.scans).set({ status, ...patch }).where(eq(s.scans.id, scanId));
}

/**
 * Atomically cancel a scan ONLY if it has not already reached a terminal state.
 * This is a compare-and-set: if the worker completes (or fails, or another cancel
 * lands) in the race window, this updates zero rows and returns false, so a
 * finished scan is never overwritten with 'cancelled'. Returns true iff it cancelled.
 */
export async function cancelScanIfActive(db: Database, scanId: string): Promise<boolean> {
  const rows = await db
    .update(s.scans)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(and(eq(s.scans.id, scanId), notInArray(s.scans.status, [...TERMINAL_SCAN_STATUSES])))
    .returning({ id: s.scans.id });
  return rows.length > 0;
}

export async function getScan(db: Database, scanId: string) {
  const [row] = await db.select().from(s.scans).where(eq(s.scans.id, scanId)).limit(1);
  return row ?? null;
}

// ---- Candidates ----
export async function insertCandidate(db: Database, c: typeof s.candidates.$inferInsert) {
  const [row] = await db.insert(s.candidates).values(c).returning();
  return row!;
}

// ---- Referee runs ----
export async function insertRefereeRuns(db: Database, runs: (typeof s.refereeRuns.$inferInsert)[]) {
  if (runs.length === 0) return [];
  return db.insert(s.refereeRuns).values(runs).returning();
}

// ---- Findings ----
export async function insertFinding(db: Database, f: typeof s.findings.$inferInsert) {
  const [row] = await db.insert(s.findings).values(f).returning();
  return row!;
}

export async function listFindingsForScan(db: Database, scanId: string) {
  return db.select().from(s.findings).where(eq(s.findings.scanId, scanId)).orderBy(desc(s.findings.createdAt));
}

// ---- Regression tests (forever-tests) ----
export async function insertRegressionTest(db: Database, t: typeof s.regressionTests.$inferInsert) {
  const [row] = await db.insert(s.regressionTests).values(t).returning();
  return row!;
}

export async function listActiveRegressionTests(db: Database, repositoryId: string) {
  return db
    .select()
    .from(s.regressionTests)
    .where(eq(s.regressionTests.repositoryId, repositoryId));
}

// ---- Repositories (minimal, for pipeline + app) ----
export async function getRepository(db: Database, repositoryId: string) {
  const [row] = await db.select().from(s.repositories).where(eq(s.repositories.id, repositoryId)).limit(1);
  return row ?? null;
}

// ---- GitHub check wiring ----
export async function setScanCheckRun(db: Database, scanId: string, checkRunId: number) {
  await db.update(s.scans).set({ githubCheckRunId: checkRunId }).where(eq(s.scans.id, scanId));
}

/** Everything the GitHub App needs to resolve a check when a scan completes. */
export async function getScanCompletionContext(db: Database, scanId: string) {
  const [scan] = await db.select().from(s.scans).where(eq(s.scans.id, scanId)).limit(1);
  if (!scan) return null;
  const [repo] = await db.select().from(s.repositories).where(eq(s.repositories.id, scan.repositoryId)).limit(1);
  if (!repo) return null;
  const [inst] = await db.select().from(s.installations).where(eq(s.installations.id, repo.installationId)).limit(1);
  const findings = await db.select().from(s.findings).where(eq(s.findings.scanId, scanId));
  return {
    scan,
    repoFullName: repo.fullName,
    installationId: inst?.githubInstallationId ?? null,
    checkRunId: scan.githubCheckRunId,
    findings,
  };
}

// ---- Recipe library (shared, public) ----
export async function listRecipes(db: Database) {
  return db.select().from(s.recipes).orderBy(s.recipes.weaknessClass);
}

export async function recipesByClass(db: Database, weaknessClass: string, limit = 5) {
  return db.select().from(s.recipes).where(eq(s.recipes.weaknessClass, weaknessClass)).limit(limit);
}

export async function insertRecipe(db: Database, r: typeof s.recipes.$inferInsert) {
  const [row] = await db.insert(s.recipes).values(r).returning();
  return row!;
}

export async function setFindingStatus(
  db: Database,
  findingId: string,
  status: typeof s.findingStatusEnum.enumValues[number],
) {
  const [row] = await db.update(s.findings).set({ status }).where(eq(s.findings.id, findingId)).returning();
  return row ?? null;
}
