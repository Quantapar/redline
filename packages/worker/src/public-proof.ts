import { eq, schema, type Database } from '@redline/db';
import { arkivReadEnabled, arkivWriteConfigured, getProofRef, publishProof, type ArkivRef } from '@redline/arkiv';

/**
 * The public, verifiable proof for a finding: the council's votes and receipts, so
 * anyone can re-check that the money moved. It never includes the runnable attack —
 * that stays gated behind ownership. The same JSON is served by the web API and
 * published to Arkiv.
 */
export async function buildPublicProof(db: Database, findingId: string) {
  const [finding] = await db.select().from(schema.findings).where(eq(schema.findings.id, findingId)).limit(1);
  if (!finding) return null;
  const runs = await db.select().from(schema.refereeRuns).where(eq(schema.refereeRuns.candidateId, finding.candidateId));
  const [candidate] = await db.select().from(schema.candidates).where(eq(schema.candidates.id, finding.candidateId)).limit(1);

  return {
    finding: {
      id: finding.id,
      title: finding.title,
      weaknessClass: finding.weaknessClass,
      severity: finding.severity,
      consensus: finding.consensus,
      isRed: finding.isRed,
      agreement: `${finding.agreementCount}/${finding.refereeCount}`,
    },
    council: runs.map((r) => ({
      referee: r.refereeName,
      provider: r.provider,
      forkBlock: r.forkBlock,
      outcome: r.outcome,
      thresholdWei: r.thresholdWei,
      // the measured balance deltas are the receipt; no attack code is included
      deltas: r.deltas,
      receipt: r.traceRef,
    })),
    discovery: candidate ? { hunterModel: candidate.hunterModel, modelReceipt: candidate.modelReceipt } : null,
    verifiable: 'Re-run each referee independently and confirm the balance deltas. No code is trusted.',
  };
}

/** Publish a finding's public proof to Arkiv. Returns null when Arkiv is not configured. */
export async function publishFindingProof(db: Database, findingId: string): Promise<ArkivRef | null> {
  if (!arkivWriteConfigured()) return null;
  const proof = await buildPublicProof(db, findingId);
  if (!proof) return null;
  return publishProof({
    findingId,
    isRed: proof.finding.isRed,
    weaknessClass: proof.finding.weaknessClass,
    severity: proof.finding.severity,
    agreement: proof.finding.agreement,
    title: proof.finding.title,
    proof,
  });
}

/** Where this finding's proof lives on Arkiv, if it has been published. Never throws. */
export async function findingProofOnArkiv(findingId: string, timeoutMs = 4000): Promise<ArkivRef | null> {
  if (!arkivReadEnabled()) return null;
  try {
    return await withTimeout(getProofRef(findingId), timeoutMs);
  } catch {
    return null;
  }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`arkiv: timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}
