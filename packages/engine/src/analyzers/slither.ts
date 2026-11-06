import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AnalyzerResult, AnalyzerHit } from './types.js';
import type { WeaknessClass } from '@redline/shared';
const pexec = promisify(execFile);

const SLITHER_TO_CLASS: Record<string, WeaknessClass> = {
  'reentrancy-eth': 'reentrancy',
  'reentrancy-no-eth': 'reentrancy',
  'arbitrary-send-eth': 'access-control',
  'unchecked-transfer': 'unchecked-external-call',
  'unprotected-upgrade': 'access-control',
  'suicidal': 'access-control',
  'delegatecall-loop': 'delegatecall',
  'controlled-delegatecall': 'delegatecall',
  'weak-prng': 'logic-error',
  'tx-origin': 'access-control',
  'uninitialized-state': 'uninitialized-storage',
};

/** Run Slither if available; parse detectors into focus hits. Never throws. */
export async function runSlither(projectDir: string, bin = 'slither'): Promise<AnalyzerResult> {
  let stdout = '';
  try {
    const r = await pexec(bin, [projectDir, '--json', '-'], { timeout: 120_000, maxBuffer: 64 * 1024 * 1024 });
    stdout = r.stdout;
  } catch (e) {
    const err = e as { stdout?: string; code?: unknown };
    // ENOENT means Slither is not installed -> genuinely unavailable. A numeric exit
    // code means it RAN and exited non-zero (it does that when it finds issues) but
    // still printed JSON on stdout, which we parse. Previously both were conflated,
    // so a missing Slither was wrongly reported as available with no findings.
    if (err.code === 'ENOENT') return { tool: 'slither', available: false, hits: [], raw: '' };
    stdout = err.stdout ?? '';
  }
  const hits = parseSlitherJson(stdout);
  return { tool: 'slither', available: true, hits, raw: stdout.slice(0, 20_000) };
}

/** Parse Slither's --json output into focus hits. Pure and testable. */
export function parseSlitherJson(stdout: string): AnalyzerHit[] {
  const hits: AnalyzerHit[] = [];
  let parsed: { results?: { detectors?: Array<Record<string, unknown>> } };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return hits;
  }
  for (const d of parsed.results?.detectors ?? []) {
    const check = String(d.check ?? '');
    const els = (d.elements as Array<Record<string, unknown>>) ?? [];
    const first = els[0] ?? {};
    const sm = (first.source_mapping as { lines?: number[]; filename_relative?: string }) ?? {};
    hits.push({
      tool: 'slither',
      weaknessClass: SLITHER_TO_CLASS[check] ?? 'other',
      contract: String((first.type_specific_fields as { parent?: { name?: string } })?.parent?.name ?? first.name ?? 'unknown'),
      functionName: first.type === 'function' ? String(first.name ?? '') : null,
      file: sm.filename_relative ?? '',
      line: sm.lines?.[0] ?? null,
      confidence: String(d.confidence ?? 'medium').toLowerCase() as 'high' | 'medium' | 'low',
      note: String(d.description ?? check).slice(0, 280),
    });
  }
  return hits;
}
