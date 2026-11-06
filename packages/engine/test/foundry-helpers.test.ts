import { describe, it, expect } from 'vitest';
import { parseNet, wrapTest } from '../src/foundry-referee.js';
import type { Candidate } from '@redline/shared';

const candidate: Candidate = {
  id: 'c', scanId: 's', hunterModel: 'm', weaknessClass: 'reentrancy', targetContract: 'Vault',
  targetFunction: 'withdraw', summary: 's', forgeTest: '', steps: [], claimedValueWei: '0',
  usedShortcuts: false, createdAt: '',
};

describe('parseNet', () => {
  it('extracts the net value from a REDLINE_NET log line', () => {
    expect(parseNet('... Logs:\n  REDLINE_NET: 8500000000000000000\n...')).toBe('8500000000000000000');
  });
  it('handles a negative net', () => {
    expect(parseNet('REDLINE_NET -5')).toBe('-5');
  });
  it('returns null when absent', () => {
    expect(parseNet('no marker here')).toBeNull();
  });
});

describe('wrapTest', () => {
  it('leaves an existing Test contract untouched', () => {
    const existing = 'contract ExploitTest is Test { function test_x() public {} }';
    expect(wrapTest(candidate, existing, 'Vault')).toBe(existing);
  });
  it('wraps a bare function body into a forge-std Test contract', () => {
    const wrapped = wrapTest(candidate, 'function testExploit() public { target.withdraw(); }', 'Vault');
    expect(wrapped).toContain('import "forge-std/Test.sol"');
    expect(wrapped).toContain('is Test');
    expect(wrapped).toContain('target.withdraw()');
  });
  it('wraps a loose statement into a test function', () => {
    const wrapped = wrapTest(candidate, 'target.drain();', 'Vault');
    expect(wrapped).toContain('function test_Redline() public');
    expect(wrapped).toContain('target.drain()');
  });
});

import { startFork } from '../src/foundry.js';

describe('startFork fails gracefully when anvil cannot spawn', () => {
  it('throws a clear error instead of crashing on an uncaught spawn error', async () => {
    // A non-existent binary makes spawn emit ENOENT; without the error listener this
    // would be an uncaught exception that crashes the process.
    await expect(
      startFork({ forkUrl: 'http://127.0.0.1:1', bin: 'anvil-not-installed-xyz', port: 18599 }),
    ).rejects.toThrow(/anvil failed to start/);
  });
});
