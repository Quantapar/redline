import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import type { BalanceDelta, RefereeRun } from '@redline/shared';
import { attackerGained } from '@redline/shared';
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
 * chain. Net theft is measured from the attacker contract's real balance, so a
 * faked exploit nets zero and is reported did-not-move, never moved.
 */
export async function runBroadcastExploit(input: BroadcastExploitInput): Promise<RefereeRun> {
  const now = () => new Date().toISOString();
  const attackerEoa = ANVIL_ACCOUNTS[0]!;
  const stake = input.stakeWei ?? '0';
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

    // 2. The attacker contract starts from zero; the stake is supplied as msg.value
    //    on the attack call, so its gain is measured as (final balance - stake).
    const before = BigInt(await castBalance(input.rpcUrl, attacker, input.bin));

    // 3. Run the attack as a real transaction. A revert is a non-exploit, not an error.
    const res = await castSend({
      rpcUrl: input.rpcUrl,
      privateKey: attackerEoa.privateKey,
      to: attacker,
      sig: input.entrypoint ?? 'attack()',
      args: input.entrypointArgs,
      valueWei: stake,
      bin: input.bin,
    });

    const after = BigInt(await castBalance(input.rpcUrl, attacker, input.bin));
    // Net theft = what the attacker contract holds now, minus what it held before
    // the attack (normally 0, but a forked CREATE address could pre-hold value) and
    // minus its own staked msg.value. Gas is paid by the EOA, not the contract, so
    // the contract balance is already net of gas for the stolen funds. Subtracting
    // `before` keeps this consistent with deltaIsConsistent (after - before).
    const theft = after - before - BigInt(stake);

    const delta: BalanceDelta = {
      token: 'native',
      attackerBefore: before.toString(),
      attackerAfter: after.toString(),
      targetBefore: '0',
      targetAfter: '0',
      attackerNetOfGas: (theft > 0n ? theft : 0n).toString(),
    };

    if (!res.status) {
      // The attack transaction reverted — nothing moved.
      return { ...base, outcome: 'did-not-move', deltas: [delta], finishedAt: now(), traceRef: `anvil://${attacker}` };
    }

    const moved = attackerGained([delta], input.thresholdWei);
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
