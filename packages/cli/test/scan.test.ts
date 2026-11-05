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
