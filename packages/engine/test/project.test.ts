import { describe, it, expect, afterEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  detectFoundry, prepareRefereeProject, forgeBuildArtifact,
  FoundryRefereeEngine, type RefereeProject,
} from '../src/index.js';
import type { Candidate } from '@redline/shared';

const hasFoundry = (await detectFoundry()).available;

const VAULT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract EtherVault {
  mapping(address => uint256) public balances;
  function deposit() external payable { balances[msg.sender] += msg.value; }
  function withdraw() external {
    uint256 bal = balances[msg.sender];
    require(bal > 0, "no balance");
    (bool ok, ) = msg.sender.call{value: bal}("");
    require(ok, "send failed");
    balances[msg.sender] = 0;
  }
}`;

let project: RefereeProject | null = null;
afterEach(async () => { if (project) { await project.cleanup(); project = null; } });

describe('prepareRefereeProject', () => {
  it('writes each contract under src/ and hardens foundry.toml (ffi off, no fs access)', async () => {
    project = await prepareRefereeProject([{ file: 'contracts/EtherVault.sol', source: VAULT }]);
    expect(existsSync(join(project.projectDir, 'src', 'contracts', 'EtherVault.sol'))).toBe(true);
    const toml = await readFile(join(project.projectDir, 'foundry.toml'), 'utf8');
    expect(toml).toMatch(/ffi\s*=\s*false/);
    expect(toml).toMatch(/fs_permissions\s*=\s*\[\]/);
  });

  it('drops a PR-author path that escapes the project dir, keeping valid targets', async () => {
    // A malicious path is skipped, not fatal: the good target is still written and
    // verification proceeds. (safeProjectPath's rejection is unit-tested in broadcast.test.ts.)
    project = await prepareRefereeProject([
      { file: '../../../../etc/evil.sol', source: 'escaped' },
      { file: 'Good.sol', source: 'contract Good {}' },
    ]);
    expect(existsSync(join(project.projectDir, 'src', 'Good.sol'))).toBe(true);
    expect(existsSync('/etc/evil.sol')).toBe(false);
  });

  it.skipIf(!hasFoundry)('produces a project forge can compile (forge-std present)', async () => {
    project = await prepareRefereeProject([{ file: 'EtherVault.sol', source: VAULT }]);
    expect(project.hasForgeStd).toBe(true);
    const { bytecode } = await forgeBuildArtifact({ projectDir: project.projectDir, contractName: 'EtherVault' });
    expect(bytecode.length).toBeGreaterThan(2);
  }, 120_000);

  it.skipIf(!hasFoundry)('a cheat-funded attack (vm.deal) never produces a false red', async () => {
    // An attack that funds its setup with vm.deal/vm.prank is cheat-dependent. The
    // referee STRIPS those lines and runs the plain transaction; with no cheat to
    // fund it, nothing moves, so the verdict is did-not-move — never a false red.
    // (Cheat-free value verification with a funded attacker is the broadcast path's
    // job, where anvil genesis funds a real EOA — see broadcast.test.ts.)
    project = await prepareRefereeProject([{ file: 'EtherVault.sol', source: VAULT }]);
    const exploit = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import "forge-std/Test.sol";
import {EtherVault} from "../src/EtherVault.sol";
contract Exploit is Test {
  function test_drain() public {
    EtherVault v = new EtherVault();
    address honest = address(0xBEEF);
    vm.deal(honest, 10 ether);
    vm.prank(honest);
    v.deposit{value: 10 ether}();
    assertGt(address(v).balance, 0);
  }
}`;
    const candidate: Candidate = {
      id: 'c', scanId: 's', hunterModel: 'm', weaknessClass: 'reentrancy', targetContract: 'EtherVault',
      targetFunction: 'withdraw', summary: 'drains', forgeTest: exploit, steps: [], claimedValueWei: '0',
      usedShortcuts: false, createdAt: '',
    };
    const run = await new FoundryRefereeEngine().run({
      candidate, refereeName: 'referee-a', provider: 'room-a',
      projectDir: project.projectDir, thresholdWei: '1000000000000000',
    });
    // The cheat-stripped attack cannot fund itself, so it moves nothing. The one
    // thing that must never happen is a false 'moved'.
    expect(run.outcome).not.toBe('moved');
    expect(['did-not-move', 'build-failed', 'error']).toContain(run.outcome);
  }, 120_000);
});
