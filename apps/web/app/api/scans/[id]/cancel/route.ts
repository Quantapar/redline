import { NextResponse } from 'next/server';
import { requireMutationAuth } from '@/lib/auth';
import { rateLimit, clientKey } from '@/lib/rate-limit';
import { createScanQueue, cancelScan } from '@redline/worker';
import { db } from '@/lib/db';
import { isUuid } from '@/lib/validate';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const csrf = requireMutationAuth(req);
  if (csrf) return csrf;
  const rl = rateLimit(`cancel:${clientKey(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) } });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  const queue = createScanQueue();
  try {
    const res = await cancelScan(db(), queue, id);
    const status = res.cancelled ? 200 : res.reason === 'not found' ? 404 : 409;
    return NextResponse.json(res, { status });
  } finally {
    await queue.close();
  }
}
