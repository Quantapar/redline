import { createDb, schema } from '@redline/db';

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://manu@localhost:5432/redline_test';

export function testDb() {
  return createDb(TEST_DB_URL);
}

export async function resetDb(db: ReturnType<typeof createDb>['db']) {
  // order respects FKs
  await db.delete(schema.refereeRuns);
  await db.delete(schema.recipes);
  await db.delete(schema.regressionTests);
  await db.delete(schema.fixes);
  await db.delete(schema.findings);
  await db.delete(schema.candidates);
  await db.delete(schema.scans);
  await db.delete(schema.repositories);
  await db.delete(schema.installations);
  await db.delete(schema.accounts);
}

export async function seedRepo(db: ReturnType<typeof createDb>['db']) {
  const n = Math.floor(Math.random() * 1e9);
  const [account] = await db.insert(schema.accounts).values({ githubLogin: `acme-${n}`, githubId: n }).returning();
  const [inst] = await db.insert(schema.installations).values({ accountId: account!.id, githubInstallationId: n }).returning();
  const [repo] = await db.insert(schema.repositories).values({
    installationId: inst!.id, githubRepoId: n, fullName: `acme-${n}/vault`, defaultBranch: 'main',
  }).returning();
  return repo!;
}
