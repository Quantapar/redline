import { NextResponse } from 'next/server';
import { buildPublicProof, findingProofOnArkiv } from '@redline/worker';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/validate';

export const runtime = 'nodejs';

/**
 * The public, verifiable proof for a finding: the council's votes and receipts,
 * so anyone can re-check that the money moved. It never includes the runnable
 * attack — that stays gated behind ownership. When the proof has been published
 * to Arkiv, the response says where, so it can be re-read from the public database.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const [proof, arkiv] = await Promise.all([buildPublicProof(db(), id), findingProofOnArkiv(id)]);
  if (!proof) return NextResponse.json({ error: 'finding not found' }, { status: 404 });
  return NextResponse.json({
    ...proof,
    arkiv: arkiv ? { network: 'rabdi', entityKey: arkiv.entityKey, explorerUrl: arkiv.explorerUrl } : null,
  });
}
