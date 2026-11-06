import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { parsePolicy } from './policy.js';
import type { Policy } from '@redline/shared';

export interface LocalTarget {
  contractName: string;
  filePath: string;
  source: string;
  changedFunctions: string[];
  analyzerNotes: string[];
}

const IGNORE_DIRS = new Set(['node_modules', 'lib', 'out', 'cache', 'test', 'tests', 'script', 'scripts', '.git', 'artifacts', 'broadcast']);

async function walk(dir: string, root: string, acc: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (!IGNORE_DIRS.has(e.name)) await walk(full, root, acc);
    } else if (e.isFile() && e.name.endsWith('.sol') && !/\.(t|s)\.sol$/i.test(e.name)) {
      acc.push(full);
    }
  }
}

/** Find the Solidity contracts in a project and read their sources. */
export async function detectTargets(dir: string): Promise<LocalTarget[]> {
  const files: string[] = [];
  await walk(dir, dir, files);
  const targets: LocalTarget[] = [];
  for (const file of files) {
    const source = await readFile(file, 'utf8');

    const contractName = extractContractName(source, '');
    if (!contractName) continue;
    targets.push({
      contractName,
      filePath: relative(dir, file),
      source,
      changedFunctions: [...source.matchAll(/function\s+(\w+)/g)].map((m) => m[1]!).slice(0, 20),
      analyzerNotes: [],
    });
  }
  return targets;
}

/** Load .redline/policy.yml from a project dir, if present. */
export async function loadProjectPolicy(dir: string): Promise<Policy> {
  try {
    const text = await readFile(join(dir, '.redline', 'policy.yml'), 'utf8');
    return parsePolicy(text);
  } catch {
    return { version: 1, rules: [] };
  }
}

export async function isDir(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

import { BudgetGuard, extractContractName, type Candidate } from '@redline/shared';
import { OGRouterClient, huntSwarm, type RouterClient } from '@redline/hunters';
import { SimulationRefereeEngine, createRefereeEngine, runCouncil, type RefereeEngine } from '@redline/engine';

export interface LocalScanReport {
  candidateCount: number;
  red: { contract: string; weaknessClass: string; summary: string; agreement: string }[];
  spentCents: number;
}

/** Run a hunt + council pass over local targets, without a database. */
export async function runLocalScan(opts: {
  targets: LocalTarget[];
  policy: Policy;
  budgetCents: number;
  forceSimulation?: boolean;
  onProgress?: (m: string) => void;
  /** injectable for tests; defaults to the real 0G router client */
  client?: RouterClient;
}): Promise<LocalScanReport> {
  const client = opts.client ?? new OGRouterClient();
  const engine: RefereeEngine = opts.forceSimulation
    ? new SimulationRefereeEngine()
    : await createRefereeEngine();
  const budget = new BudgetGuard(opts.budgetCents);

  const candidates = await huntSwarm({
    client,
    scanId: 'local',
    targets: opts.targets.map((t) => ({ ...t })),
    policy: opts.policy,
    budget,
    onProgress: opts.onProgress,
  });

  const dispatch = { providers: ['room-a', 'room-b', 'room-c'], blocks: [0, 0, 0], thresholdWei: '1000000000000000' };
  const red: LocalScanReport['red'] = [];
  for (const c of candidates as Candidate[]) {
    const { result } = await runCouncil(engine, c, dispatch);
    if (result.isRed) {
      red.push({ contract: c.targetContract, weaknessClass: c.weaknessClass, summary: c.summary, agreement: `${result.agreementCount}/${result.validCount}` });
    }
  }
  return { candidateCount: candidates.length, red, spentCents: budget.spentCents };
}
