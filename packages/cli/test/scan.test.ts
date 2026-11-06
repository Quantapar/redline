import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { detectTargets } from '../src/scan.js';

const fixtures = fileURLToPath(new URL('../../../fixtures/vault', import.meta.url));

describe('detectTargets', () => {
  it('finds the vault contract and excludes test files', async () => {
    const targets = await detectTargets(fixtures);
    const names = targets.map((t) => t.contractName);
    expect(names).toContain('EtherVault');
    // the exploit test (.t.sol) must not be scanned as a target
    expect(targets.every((t) => !t.filePath.endsWith('.t.sol'))).toBe(true);
  });
  it('extracts function names from the contract', async () => {
    const [vault] = await detectTargets(fixtures);
    expect(vault!.changedFunctions).toContain('withdraw');
    expect(vault!.changedFunctions).toContain('deposit');
  });
});

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProjectPolicy } from '../src/scan.js';

describe('loadProjectPolicy — reads .redline/policy.yml, falls back gracefully', () => {
  it('loads and parses a present policy file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rl-pol-'));
    try {
      mkdirSync(join(dir, '.redline'));
      writeFileSync(join(dir, '.redline', 'policy.yml'), 'version: 1\nrules:\n  - id: no-withdraw\n    text: guard withdraw\n    severity: high\n    appliesTo: ["withdraw*"]\n');
      const pol = await loadProjectPolicy(dir);
      expect(pol.rules.map((r) => r.id)).toContain('no-withdraw');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('returns an empty default policy when none exists (no throw)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rl-pol-'));
    try {
      const pol = await loadProjectPolicy(dir);
      expect(pol).toEqual({ version: 1, rules: [] });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('returns the default on a malformed policy file instead of crashing the scan', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rl-pol-'));
    try {
      mkdirSync(join(dir, '.redline'));
      writeFileSync(join(dir, '.redline', 'policy.yml'), 'this: is: not: valid: yaml: : :\n  - broken');
      const pol = await loadProjectPolicy(dir);
      expect(pol.rules).toEqual([]);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

import { isDir } from '../src/scan.js';

describe('isDir', () => {
  it('is true for a directory, false for a file or missing path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'rl-isdir-'));
    const file = join(dir, 'f.txt');
    writeFileSync(file, 'x');
    try {
      expect(await isDir(dir)).toBe(true);
      expect(await isDir(file)).toBe(false);
      expect(await isDir(join(dir, 'nope'))).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});

import { runLocalScan } from '../src/scan.js';
import { FakeRouterClient } from '@redline/hunters';

describe('runLocalScan — hunt + council over local targets, no DB', () => {
  const target = { contractName: 'EtherVault', filePath: 'src/EtherVault.sol', source: 'contract EtherVault { function withdraw() external {} }', changedFunctions: ['withdraw'], analyzerNotes: [] };

  it('reports a red finding when the council reproduces a genuine exploit', async () => {
    const client = new FakeRouterClient(() => JSON.stringify({ candidates: [{
      weaknessClass: 'reentrancy', targetFunction: 'withdraw', summary: 'drains the vault',
      forgeTest: '// @redline-sim exploitable=true netWei=5000000000000000000 cheatDependent=false flaky=false\nfunction t() public {}',
      claimedValueWei: '5000000000000000000', usedShortcuts: false,
    }] }));
    const report = await runLocalScan({ targets: [target], policy: { version: 1, rules: [] }, budgetCents: 500, forceSimulation: true, client });
    expect(report.candidateCount).toBe(1);
    expect(report.red).toHaveLength(1);
    expect(report.red[0]!.contract).toBe('EtherVault');
  });

  it('reports no red when the exploit does not reproduce, and respects the budget', async () => {
    const client = new FakeRouterClient(() => JSON.stringify({ candidates: [{
      weaknessClass: 'reentrancy', targetFunction: 'withdraw', summary: 'maybe',
      forgeTest: '// @redline-sim exploitable=false netWei=0 cheatDependent=false flaky=false\nfunction t() public {}',
      claimedValueWei: '0', usedShortcuts: false,
    }] }));
    const report = await runLocalScan({ targets: [target], policy: { version: 1, rules: [] }, budgetCents: 500, forceSimulation: true, client });
    expect(report.red).toHaveLength(0);
    expect(report.spentCents).toBeLessThanOrEqual(500); // never overran the cap
  });
});
