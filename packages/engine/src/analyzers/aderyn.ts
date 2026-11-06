import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalyzerResult, AnalyzerHit } from './types.js';
const pexec = promisify(execFile);

/** Run Aderyn if available; parse its JSON report into focus hits. Never throws. */
export async function runAderyn(projectDir: string, bin = 'aderyn'): Promise<AnalyzerResult> {
  const out = join(projectDir, 'aderyn-report.json');
  try {
    await pexec(bin, [projectDir, '-o', out], { timeout: 120_000 });
  } catch (e) {
    // ENOENT means Aderyn is not installed -> genuinely unavailable. Any other error
    // means it ran but failed; it may still have written a partial report, so fall
    // through and try to read it. Previously a missing Aderyn was reported as available.
    if ((e as { code?: unknown }).code === 'ENOENT') return { tool: 'aderyn', available: false, hits: [], raw: '' };
  }
  let raw = '';
  const hits: AnalyzerHit[] = [];
  try {
    raw = await readFile(out, 'utf8');
    hits.push(...parseAderynJson(raw));
  } catch {
    /* no report written */
  }
  return { tool: 'aderyn', available: true, hits, raw: raw.slice(0, 20_000) };
}

/** Parse an Aderyn JSON report into focus hits. Pure and testable. */
export function parseAderynJson(raw: string): AnalyzerHit[] {
  const hits: AnalyzerHit[] = [];
  let parsed: {
    high_issues?: { issues?: Array<Record<string, unknown>> };
    medium_issues?: { issues?: Array<Record<string, unknown>> };
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return hits;
  }
  const collect = (issues: Array<Record<string, unknown>> | undefined, confidence: 'high' | 'medium') => {
    for (const issue of issues ?? []) {
      const instances = (issue.instances as Array<Record<string, unknown>>) ?? [];
      for (const inst of instances) {
        hits.push({
          tool: 'aderyn',
          weaknessClass: 'other',
          contract: String(inst.contract_name ?? 'unknown'),
          functionName: null,
          file: String(inst.contract_path ?? ''),
          line: typeof inst.line_no === 'number' ? inst.line_no : null,
          confidence,
          note: String(issue.title ?? '').slice(0, 280),
        });
      }
    }
  };
  collect(parsed.high_issues?.issues, 'high');
  collect(parsed.medium_issues?.issues, 'medium');
  return hits;
}
