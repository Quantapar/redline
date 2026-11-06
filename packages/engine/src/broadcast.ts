import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import type { BalanceDelta, RefereeRun } from '@redline/shared';
import { theftFromTarget } from '@redline/shared';
import { castBalance, castDeploy, castSend, ANVIL_ACCOUNTS } from './foundry.js';

/** Is `child` the same as, or contained within, `parent`? (lexical) */
function isContained(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel));
}

/**
 * Join a PR-author-controlled relative path under a project directory, refusing
 * anything that would escape it. The source file paths captured from a pull
 * request (prepare.ts) are attacker-influenced: a crafted name like
 * `../../../../etc/foo`, an absolute path, or a symlink that points outside must
 * never become a write target outside the sandbox project. Returns the safe
 * absolute path, or throws.
 */
export function safeProjectPath(projectDir: string, relFile: string): string {
  if (!relFile || isAbsolute(relFile)) {
    throw new Error(`unsafe source path (absolute or empty): ${relFile}`);
  }
  if (relFile.includes('\0')) throw new Error('unsafe source path (NUL byte)');
  const base = normalize(projectDir);
  const target = normalize(join(base, relFile));

  // 1. Lexical containment: after normalising . / .. the target must stay under base.
  //    `rel === '..'` or `rel` starting with `../` means it climbed out; an absolute
  //    rel means different roots. A leading `..` without a separator (e.g. `..keep`)
  //    is a legitimate filename, so it is NOT rejected here.
  if (!isContained(base, target)) {
    throw new Error(`unsafe source path escapes project dir: ${relFile}`);
  }

  // 2. Symlink-aware check: a string check cannot see that `src/x` is a symlink to
  //    `/`. Resolve the deepest existing ancestor of the target and re-verify it is
  //    still inside the real base. Only runs when base actually exists on disk
  //    (callers always write into a real project dir); otherwise the lexical result
  //    stands.
  if (existsSync(base)) {
    const realBase = realpathSync(base);
    let probe = target;
    while (!existsSync(probe)) {
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    const realProbe = realpathSync(probe);
    if (!isContained(realBase, realProbe)) {
      throw new Error(`unsafe source path resolves (via symlink) outside project dir: ${relFile}`);
    }
  }
  return target;
}

export interface BroadcastExploitInput {
  /** a running anvil node (fresh chain or a fork) */
  rpcUrl: string;
  /** the contract under review, already deployed on the node; its balance is measured too */
  targetAddress: string;
  /** creation bytecode of the attacker contract (from forgeBuildArtifact) */
  attackerBytecode: string;
  /** optional constructor, e.g. sig 'constructor(address)' + [targetAddress] */
  constructorSig?: string;
  constructorArgs?: string[];
  /** the attack entrypoint, e.g. 'attack()' */
  entrypoint?: string;
  entrypointArgs?: string[];
  /** stake the attacker legitimately contributes (sent as msg.value to attack) */
  stakeWei?: string;
  /** minimum net theft (wei) to count as "money moved" */
  thresholdWei: string;
  /** identity for the resulting RefereeRun */
  refereeName: string;
  provider: string;
  candidateId: string;
  forkBlock?: number;
  /** cast binary, overridable for tests */
  bin?: string;
}

/**
 * Run an attack as REAL transactions against an anvil node from a funded EOA.
 *
 * This is the execution-level isolation the static cheat scanner cannot provide:
 * the attacker contract runs as ordinary deployed code, so a call to the Foundry
 * cheatcode precompile (0x7109...12d) hits a codeless address and is an inert
 * no-op. An attacker cannot vm.deal itself funds, vm.store a balance, or vm.prank
 * another account — the only way its balance grows is by actually moving value on
 * chain. Net theft is measured from the attacker contract's real balance AND the
 * target's real balance, so a faked exploit nets zero and is reported
 * did-not-move, never moved. Nothing the attack prints is read.
 */
export async function runBroadcastExploit(input: BroadcastExploitInput): Promise<RefereeRun> {
  const now = () => new Date().toISOString();
  const attackerEoa = ANVIL_ACCOUNTS[0]!;
  const stake = BigInt(input.stakeWei ?? '0');
  const base: RefereeRun = {
    id: `${input.candidateId}:${input.refereeName}`,
    candidateId: input.candidateId,
    refereeName: input.refereeName,
    provider: input.provider,
    forkBlock: input.forkBlock ?? 0,
    outcome: 'error',
    thresholdWei: input.thresholdWei,
    deltas: [],
    traceRef: null,
    logsRef: null,
    startedAt: now(),
    finishedAt: null,
    error: null,
  };
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.targetAddress)) {
    return { ...base, outcome: 'error', finishedAt: now(), error: 'invalid target address' };
  }

  try {
    // 1. Deploy the attacker as real creation code from the funded EOA.
    const attacker = await castDeploy({
      rpcUrl: input.rpcUrl,
      privateKey: attackerEoa.privateKey,
      bytecode: input.attackerBytecode,
      constructorSig: input.constructorSig,
      constructorArgs: input.constructorArgs,
      bin: input.bin,
    });

    // 2. Measure both sides before the attack. The attacker's "before" INCLUDES the
    //    stake it is about to send, so after - before is exactly its net gain and the
    //    recorded delta is self-consistent (deltaIsConsistent) with no tolerance.
    const attackerHeld = BigInt(await castBalance(input.rpcUrl, attacker, input.bin));
    const attackerBefore = attackerHeld + stake;
    const targetBefore = BigInt(await castBalance(input.rpcUrl, input.targetAddress, input.bin));

    // 3. Run the attack as a real transaction. A revert is a non-exploit, not an error.
    const res = await castSend({
      rpcUrl: input.rpcUrl,
      privateKey: attackerEoa.privateKey,
      to: attacker,
      sig: input.entrypoint ?? 'attack()',
      args: input.entrypointArgs,
      valueWei: stake.toString(),
      bin: input.bin,
    });

    // 4. Measure again. Gas is paid by the EOA, not the contract, so the contract
    //    balance is already net of gas. A reverted attack still consumed nothing from
    //    the contract (the stake bounced with the revert), and the measurement shows it.
    const attackerAfter = BigInt(await castBalance(input.rpcUrl, attacker, input.bin));
    const targetAfter = BigInt(await castBalance(input.rpcUrl, input.targetAddress, input.bin));
    // On a revert the stake never left the EOA, so the attacker "put in" nothing.
    const effectiveBefore = res.status ? attackerBefore : attackerHeld;

    const delta: BalanceDelta = {
      token: 'native',
      attackerBefore: effectiveBefore.toString(),
      attackerAfter: attackerAfter.toString(),
      targetBefore: targetBefore.toString(),
      targetAfter: targetAfter.toString(),
      attackerNetOfGas: (attackerAfter - effectiveBefore).toString(),
    };

    if (!res.status) {
      // The attack transaction reverted — nothing moved.
      return { ...base, outcome: 'did-not-move', deltas: [delta], finishedAt: now(), traceRef: `anvil://${attacker}` };
    }

    const moved = theftFromTarget([delta], input.thresholdWei);
    return {
      ...base,
      outcome: moved ? 'moved' : 'did-not-move',
      deltas: [delta],
      finishedAt: now(),
      traceRef: `anvil://${attacker}`,
    };
  } catch (err) {
    return { ...base, outcome: 'error', finishedAt: now(), error: String(err).slice(0, 300) };
  }
}
