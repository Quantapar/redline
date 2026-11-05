import { NextResponse } from 'next/server';
import { eq, schema } from '@redline/db';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * The public, verifiable proof for a finding: the council's votes and receipts,
 * so anyone can re-check that the money moved. It never includes the runnable
 * attack — that stays gated behind ownership.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = db();
  const [finding] = await d.select().from(schema.findings).where(eq(schema.findings.id, id)).limit(1);
  if (!finding) return NextResponse.json({ error: 'finding not found' }, { status: 404 });
  const runs = await d.select().from(schema.refereeRuns).where(eq(schema.refereeRuns.candidateId, finding.candidateId));
  const [candidate] = await d.select().from(schema.candidates).where(eq(schema.candidates.id, finding.candidateId)).limit(1);

  return NextResponse.json({
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
  });
}
