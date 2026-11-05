import { eq, desc } from 'drizzle-orm';
import type { Database } from './client.js';
import * as s from './schema.js';

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
