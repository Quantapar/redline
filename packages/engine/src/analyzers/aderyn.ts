import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AnalyzerResult, AnalyzerHit } from './types.js';
const pexec = promisify(execFile);

/** Run Aderyn if available; parse its JSON report into focus hits. Never throws. */
export async function runAderyn(projectDir: string): Promise<AnalyzerResult> {
  try {
    const out = join(projectDir, 'aderyn-report.json');
    await pexec('aderyn', [projectDir, '-o', out], { timeout: 120_000 }).catch(() => undefined);
    let raw = '';
    const hits: AnalyzerHit[] = [];
    try {
      raw = await readFile(out, 'utf8');
      hits.push(...parseAderynJson(raw));
    } catch {
      /* ignore */
    }
    return { tool: 'aderyn', available: true, hits, raw: raw.slice(0, 20_000) };
  } catch {
    return { tool: 'aderyn', available: false, hits: [], raw: '' };
  }
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
