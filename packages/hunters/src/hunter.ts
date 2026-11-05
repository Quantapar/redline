import { WeaknessClass, type Candidate } from '@redline/shared';
import type { ChatResponse } from './router-client.js';

/** Pull the first JSON object out of a model response, tolerating prose/fences. */
export function extractJson(content: string): unknown {
  const fence = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fence ? fence[1] : content;
  const start = body!.indexOf('{');
  const end = body!.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(body!.slice(start, end + 1));
  } catch {
    return null;
  }
}

interface RawCandidate {
  weaknessClass?: string;
  targetFunction?: string | null;
  summary?: string;
  forgeTest?: string;
  claimedValueWei?: string;
  usedShortcuts?: boolean;
}

function newId(): string {
  return `cand_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

/** Parse a model response into validated Candidates. Invalid entries are dropped. */
export function parseCandidates(
  resp: ChatResponse,
  scanId: string,
  targetContract: string,
): Candidate[] {
  const parsed = extractJson(resp.content) as { candidates?: RawCandidate[] } | null;
  const list = parsed?.candidates ?? [];
  const out: Candidate[] = [];
  for (const r of list) {
    if (!r.forgeTest || !r.summary) continue;
    const wc = WeaknessClass.safeParse(r.weaknessClass);
    out.push({
      id: newId(),
      scanId,
      hunterModel: resp.model,
      weaknessClass: wc.success ? wc.data : 'other',
      targetContract,
      targetFunction: r.targetFunction ?? null,
      summary: String(r.summary).slice(0, 500),
      forgeTest: String(r.forgeTest),
      steps: [],
      claimedValueWei: /^\d+$/.test(String(r.claimedValueWei)) ? String(r.claimedValueWei) : '0',
      usedShortcuts: Boolean(r.usedShortcuts),
      createdAt: new Date().toISOString(),
    });
  }
  return out;
}

/** Estimate cost in cents from token usage (fallback to a flat per-attempt estimate). */
export function estimateCostCents(resp: ChatResponse, flatCents: number): number {
  if (!resp.usage) return flatCents;
  // ~ $0.50 per 1M tokens blended for cheap coders; scaled, min 1 cent.
  const cents = Math.ceil((resp.usage.totalTokens / 1_000_000) * 50);
  return Math.max(1, cents);
}
