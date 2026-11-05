import { NextResponse } from 'next/server';
import { createScanQueue, cancelScan } from '@redline/worker';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const queue = createScanQueue();
  try {
    const res = await cancelScan(db(), queue, id);
    const status = res.cancelled ? 200 : res.reason === 'not found' ? 404 : 409;
    return NextResponse.json(res, { status });
  } finally {
    await queue.close();
  }
}
