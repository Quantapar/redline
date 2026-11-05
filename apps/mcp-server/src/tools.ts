import { and, desc, eq, schema, type Database } from '@redline/db';

/** List reproduced (red) findings for a repository, newest first. */
export async function listFindings(db: Database, repoFullName: string, onlyRed = true) {
  const rows = await db
    .select({ finding: schema.findings, repo: schema.repositories.fullName })
    .from(schema.findings)
    .innerJoin(schema.scans, eq(schema.findings.scanId, schema.scans.id))
    .innerJoin(schema.repositories, eq(schema.scans.repositoryId, schema.repositories.id))
    .where(onlyRed ? and(eq(schema.repositories.fullName, repoFullName), eq(schema.findings.isRed, true)) : eq(schema.repositories.fullName, repoFullName))
    .orderBy(desc(schema.findings.createdAt));
  return rows.map((r) => ({
    id: r.finding.id,
    title: r.finding.title,
    weaknessClass: r.finding.weaknessClass,
    severity: r.finding.severity,
    consensus: r.finding.consensus,
    plainSentence: r.finding.plainSentence,
    repo: r.repo,
  }));
}

/**
 * Everything a developer's own AI coding tool needs to write the fix itself:
 * the vulnerable contract source, the finding, and the council verdict. We return
 * the plain finding and source, not a weaponised exploit.
 */
export async function getFixContext(db: Database, findingId: string) {
  const [finding] = await db.select().from(schema.findings).where(eq(schema.findings.id, findingId)).limit(1);
  if (!finding) return null;
  const [candidate] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, finding.candidateId)).limit(1);
  return {
    finding: {
      id: finding.id,
      title: finding.title,
      weaknessClass: finding.weaknessClass,
      severity: finding.severity,
      plainSentence: finding.plainSentence,
      isRed: finding.isRed,
    },
    contract: candidate?.targetContract ?? null,
    contractSource: candidate?.contractSource ?? null,
    guidance:
      'Close this vulnerability with the smallest change. Prefer checks-effects-interactions, a ' +
      'reentrancy guard, or the missing access-control modifier. Keep unrelated behaviour unchanged.',
  };
}
