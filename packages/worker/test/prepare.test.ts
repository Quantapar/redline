import { describe, it, expect } from 'vitest';
import { gitPrepare } from '../src/prepare.js';
import { schema } from '@redline/db';

type Scan = typeof schema.scans.$inferSelect;
function scanWith(changedTargets: unknown): Scan {
  return {
    id: 's1', repositoryId: 'r1', trigger: 'push', status: 'preparing', commitSha: 'abc',
    baseSha: null, prNumber: null, githubCheckRunId: null, isIncremental: true,
    changedTargets, budgetCapCents: 500, spentCents: 0, candidateCount: 0, redFindingCount: 0,
    startedAt: null, finishedAt: null, createdAt: new Date(),
  } as unknown as Scan;
}

describe('gitPrepare — build targets from captured sources', () => {
  it('builds a hunt target from a changed contract with source', async () => {
    const { targets } = await gitPrepare(scanWith([
      { file: 'src/Vault.sol', contract: 'Vault', source: 'contract Vault { function withdraw() external {} function deposit() external {} }', changedFunctions: [] },
    ]));
    expect(targets).toHaveLength(1);
    expect(targets[0]!.contractName).toBe('Vault');
    expect(targets[0]!.filePath).toBe('src/Vault.sol');
    expect(targets[0]!.changedFunctions).toContain('withdraw');
  });

  it('derives the contract name from source when not provided', async () => {
    const { targets } = await gitPrepare(scanWith([
      { file: 'src/Token.sol', source: 'pragma solidity ^0.8.0; contract RewardToken { }' },
    ]));
    expect(targets[0]!.contractName).toBe('RewardToken');
  });

  it('skips files whose content was not captured (nothing to attack)', async () => {
    const { targets } = await gitPrepare(scanWith([{ file: 'src/Empty.sol', contract: 'Empty' }]));
    expect(targets).toHaveLength(0);
  });

  it('handles an empty change set', async () => {
    const { targets } = await gitPrepare(scanWith([]));
    expect(targets).toHaveLength(0);
  });
});
