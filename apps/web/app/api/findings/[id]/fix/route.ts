import { NextResponse } from 'next/server';
import { eq, schema } from '@redline/db';
import { OGRouterClient, buildFixMessages, parseFix, DEFAULT_FIXER_MODEL } from '@redline/hunters';
import { db } from '@/lib/db';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const rl = rateLimit(`fix:${clientKey(req)}`, 10, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate limited' }, { status: 429, headers: { 'retry-after': String(Math.ceil(rl.retryAfterMs / 1000)) } });
  const { id } = await params;
  const d = db();

  const [finding] = await d.select().from(schema.findings).where(eq(schema.findings.id, id)).limit(1);
  if (!finding) return NextResponse.json({ error: 'finding not found' }, { status: 404 });
  if (!finding.isRed) return NextResponse.json({ error: 'only a reproduced (red) finding can be fixed' }, { status: 422 });

  const [candidate] = await d.select().from(schema.candidates).where(eq(schema.candidates.id, finding.candidateId)).limit(1);
  if (!candidate?.contractSource) {
    return NextResponse.json({ error: 'no contract source stored for this finding' }, { status: 422 });
  }

  // Reuse an existing fix if one was already generated.
  const [existing] = await d.select().from(schema.fixes).where(eq(schema.fixes.findingId, id)).limit(1);
  if (existing) {
    return NextResponse.json({ explanation: existing.explanation, diff: existing.diff, branch: existing.branch, cached: true });
  }

  let client: OGRouterClient;
  try {
    client = new OGRouterClient();
  } catch {
    return NextResponse.json({ error: 'model router not configured' }, { status: 503 });
  }

  const resp = await client.chat({
    model: DEFAULT_FIXER_MODEL,
    messages: buildFixMessages({
      contractName: candidate.targetContract,
      source: candidate.contractSource,
      weaknessClass: candidate.weaknessClass,
      summary: finding.plainSentence,
    }),
    jsonMode: true,
    maxTokens: 3000,
  });

  const fix = parseFix(resp);
  if (!fix) return NextResponse.json({ error: 'could not generate a fix', raw: resp.content.slice(0, 400) }, { status: 502 });

  const branch = `redline/fix-${finding.weaknessClass}-${id.slice(0, 8)}`;
  const [row] = await d
    .insert(schema.fixes)
    .values({
      findingId: id,
      branch,
      diff: fix.diff || '(no diff returned)',
      explanation: fix.explanation,
      regressionTestRef: finding.regressionTestRef ?? candidate.id,
      reattackPassed: null, // re-attack runs on a fork once Foundry is enabled
    })
    .returning();

  return NextResponse.json({ explanation: row!.explanation, diff: row!.diff, branch: row!.branch, model: resp.model, receipt: resp.receipt });
}
