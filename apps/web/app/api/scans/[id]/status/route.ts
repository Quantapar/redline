import { NextResponse } from 'next/server';
import { eq, schema } from '@redline/db';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [scan] = await db().select({ status: schema.scans.status, red: schema.scans.redFindingCount }).from(schema.scans).where(eq(schema.scans.id, id)).limit(1);
  if (!scan) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.json({ status: scan.status, redCount: scan.red });
}
