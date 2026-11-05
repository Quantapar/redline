import { NextResponse } from 'next/server';
import { triggerWatchMode, createScanQueue, enqueueScan } from '@redline/worker';
import { WeaknessClass, Severity } from '@redline/shared';
import { db } from '@/lib/db';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Watch mode: a new hack appears in the world. Turn it into a recipe and re-test
 * every repo.  POST { weaknessClass, title, template, chain?, severity? }.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`watch:${clientKey(req)}`, 5, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate limited' }, { status: 429 });

  const body = await req.json().catch(() => ({}));
  const wc = WeaknessClass.safeParse(body.weaknessClass);
  if (!wc.success) return NextResponse.json({ error: 'invalid weaknessClass' }, { status: 400 });
  if (!body.title || !body.template) return NextResponse.json({ error: 'title and template are required' }, { status: 400 });

  const queue = createScanQueue();
  try {
    const res = await triggerWatchMode(db(), {
      recipe: {
        weaknessClass: wc.data,
        chain: typeof body.chain === 'string' ? body.chain : 'ethereum',
        severity: Severity.safeParse(body.severity).success ? body.severity : 'high',
        title: String(body.title),
        template: String(body.template),
        labels: Array.isArray(body.labels) ? body.labels.map(String) : [],
      },
      enqueue: (scanId) => enqueueScan(queue, scanId, 2),
    });
    return NextResponse.json(res);
  } finally {
    await queue.close();
  }
}
