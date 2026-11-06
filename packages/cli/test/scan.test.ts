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
