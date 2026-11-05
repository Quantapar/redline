import { NextResponse } from 'next/server';
import { createScanQueue, cancelScan } from '@redline/worker';
import { db } from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const queue = createScanQueue();
  try {
    const res = await cancelScan(db(), queue, id);
    return NextResponse.json(res, { status: res.cancelled ? 200 : 409 });
  } finally {
    await queue.close();
  }
}
