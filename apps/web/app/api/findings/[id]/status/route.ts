import { NextResponse } from 'next/server';
import { setFindingStatus } from '@redline/db';
import { FindingStatus } from '@redline/shared';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/validate';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const parsed = FindingStatus.safeParse(body.status);
  if (!parsed.success) return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  const row = await setFindingStatus(db(), id, parsed.data);
  if (!row) return NextResponse.json({ error: 'finding not found' }, { status: 404 });
  return NextResponse.json({ status: row.status });
}
