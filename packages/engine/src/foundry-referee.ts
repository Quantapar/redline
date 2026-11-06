import { writeFile, mkdir, mkdtemp, cp, symlink, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RefereeRun } from '@redline/shared';
import { ExploitPlan } from '@redline/shared';
import type { RefereeEngine, RefereeInput } from './referee.js';
import { scanCheats } from './cheatcodes.js';
import {
  detectFoundry, forgeBuild, readArtifactBytecode, startAnvil, startFork, castDeploy, castSend,
  ANVIL_ACCOUNTS, type AnvilHandle,
} from './foundry.js';
import { runBroadcastExploit } from './broadcast.js';
import { FOUNDRY_TOML } from './project.js';

/** Hard cap on the value any single seed transaction may carry (anvil accounts hold 10,000 ETH). */
export const MAX_SEED_VALUE_WEI = 1_000n * 10n ** 18n;

/**
 * Setup transactions are replayed from the honest-user wallet and may only go to
 * the target. One may not mention the attacker's WALLET: a "seed" that hands the
 * attacker money or authority directly is not a reproduction of a theft.
 *
 * Why this guard does not also need the attacker CONTRACT's (predictable) address:
 * the theft is measured as the TARGET's balance drop caused by attack() alone.
 * Seeds run first, so `targetBefore` is sampled AFTER them — any value a seed moved
 * out of the target (including into the attacker contract) is already baked into
 * `targetBefore` and is NOT credited as theft. A seed therefore cannot manufacture a
 * theft of pre-existing funds. The only thing a seed could do is call a function the
 * target exposes to any ordinary account (it runs from a plain wallet, not a
 * privileged one); if that function grants an arbitrary address drain authority,
 * that is itself the access-control vulnerability under test, so counting the
 * resulting drain is correct, not a false positive.
 */
export function seedPlanProblem(plan: ExploitPlan): string | null {
  const attackerEoa = ANVIL_ACCOUNTS[0]!.address.toLowerCase();
  const mentionsAttacker = (v: string) => v.toLowerCase().includes(attackerEoa);
  if (plan.targetConstructorArgs.some(mentionsAttacker)) return 'target constructor args reference the attacker wallet';
  for (const step of plan.seed) {
    if (step.args.some(mentionsAttacker)) return 'a seed step references the attacker wallet';
    if (BigInt(step.valueWei) > MAX_SEED_VALUE_WEI) return 'a seed step carries more value than the honest wallet holds';
  }
  if (BigInt(plan.targetDeployValueWei) > MAX_SEED_VALUE_WEI) return 'target deploy value exceeds the honest wallet';
  if (BigInt(plan.stakeWei) > MAX_SEED_VALUE_WEI) return 'stake exceeds the attacker wallet';
  return null;
}

/**
 * The real referee. It never reads anything the attack prints and never runs the
 * attack inside `forge test` (where cheatcodes are live). Instead:
 *
 *   1. compile the candidate's attacker contract against the prepared project
 *      (the PR's own contracts + forge-std) with ffi/fs disabled;
 *   2. start a private anvil node — a fork of the configured provider at the
 *      referee's block, or a fresh chain when there is no upstream;
 *   3. deploy the target from the honest-user wallet (fresh chain) or use the
 *      plan's on-fork address, then replay the plan's seed transactions as that
 *      honest user;
 *   4. deploy the attacker from a second wallet and call attack() with the stake
 *      as a real transaction, where the cheatcode precompile is a codeless address;
 *   5. measure the attacker's and the target's balances on chain before and after.
 *
 * The vote is `moved` only when the measured balances show value leaving the
 * target and landing with the attacker above the threshold (theftFromTarget).
 */
export class FoundryRefereeEngine implements RefereeEngine {
  async run(input: RefereeInput): Promise<RefereeRun> {
    const now = () => new Date().toISOString();
    const base: RefereeRun = {
      id: `${input.candidate.id}:${input.refereeName}`,
      candidateId: input.candidate.id,
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
    const fail = (outcome: RefereeRun['outcome'], error: string): RefereeRun =>
      ({ ...base, outcome, finishedAt: now(), error });

    // Defense in depth for the plain-transactions rule. Cheats are inert on the
    // node anyway, but an attack that leans on one is by definition not a plain
    // transaction, so it is refused rather than run. An error is not a valid vote.
    if (scanCheats(input.candidate.forgeTest).hasForbidden) {
      return fail('error', 'attack source uses a forbidden cheat; referee refuses cheat-bearing run');
    }

    const parsedPlan = ExploitPlan.safeParse(input.candidate.plan);
    if (!parsedPlan.success) {
      return fail('error', 'candidate has no runnable exploit plan (deployable attacker required)');
    }
    const plan = parsedPlan.data;
    const planProblem = seedPlanProblem(plan);
    if (planProblem) return fail('error', planProblem);

    const foundry = await detectFoundry();
    if (!foundry.available) return fail('build-failed', 'foundry not installed');
    if (!input.projectDir) return fail('error', 'no prepared project dir');
    if (input.forkUrl && !plan.targetAddress) {
      return fail('error', 'fork referee needs the deployed target address');
    }

    // Each referee compiles in its own throwaway working dir that shares the
    // prepared project's src/ and lib/ (forge-std) by symlink but holds only this
    // referee's attacker. Concurrent referees never clobber each other's files.
    let runDir: string | null = null;
    let node: AnvilHandle | null = null;
    try {
      runDir = await mkdtemp(join(tmpdir(), 'redline-run-'));
      // The hardened config is written directly (ffi off, no fs access) rather than
      // copied, so the blast-radius floor is guaranteed for every run.
      await writeFile(join(runDir, 'foundry.toml'), FOUNDRY_TOML, 'utf8');
      for (const sub of ['src', 'lib']) {
        const from = join(input.projectDir, sub);
        if (!existsSync(from)) continue;
        try {
          await symlink(from, join(runDir, sub), 'dir');
        } catch {
          await cp(from, join(runDir, sub), { recursive: true });
        }
      }
      const attackDir = join(runDir, 'test');
      await mkdir(attackDir, { recursive: true });
      await writeFile(join(attackDir, `Redline_${input.refereeName.replace(/[^A-Za-z0-9_]/g, '_')}.sol`), input.candidate.forgeTest, 'utf8');

      try {
        await forgeBuild({ projectDir: runDir });
      } catch (err) {
        return fail('build-failed', String(err).slice(0, 300));
      }
      let attackerBytecode: string;
      try {
        attackerBytecode = await readArtifactBytecode(runDir, plan.attackerContract);
      } catch (err) {
        return fail('build-failed', String(err).slice(0, 300));
      }

      node = input.forkUrl
        ? await startFork({ forkUrl: input.forkUrl, block: input.forkBlock || undefined })
        : await startAnvil();
      const honest = ANVIL_ACCOUNTS[1]!;

      // The target: on a fork it already exists; on a fresh chain the honest wallet
      // deploys the contract under review from the prepared project's own build.
      let targetAddress: string;
      if (input.forkUrl) {
        targetAddress = plan.targetAddress!;
      } else {
        let targetBytecode: string;
        try {
          targetBytecode = await readArtifactBytecode(runDir, input.candidate.targetContract);
        } catch (err) {
          return fail('build-failed', String(err).slice(0, 300));
        }
        targetAddress = await castDeploy({
          rpcUrl: node.rpcUrl,
          privateKey: honest.privateKey,
          bytecode: targetBytecode,
          constructorSig: plan.targetConstructorSig ?? undefined,
          constructorArgs: plan.targetConstructorArgs,
          valueWei: plan.targetDeployValueWei,
        });
      }

      // Seed: honest-user transactions to the target, from the honest wallet only.
      for (const step of plan.seed) {
        const res = await castSend({
          rpcUrl: node.rpcUrl, privateKey: honest.privateKey, to: targetAddress,
          sig: step.sig, args: step.args, valueWei: step.valueWei,
        });
        if (!res.status) return fail('error', `seed step reverted: ${step.sig}`);
      }

      const run = await runBroadcastExploit({
        rpcUrl: node.rpcUrl,
        targetAddress,
        attackerBytecode,
        constructorSig: 'constructor(address)',
        constructorArgs: [targetAddress],
        entrypoint: 'attack()',
        stakeWei: plan.stakeWei,
        thresholdWei: input.thresholdWei,
        refereeName: input.refereeName,
        provider: input.provider,
        candidateId: input.candidate.id,
        forkBlock: node.block,
      });
      return { ...run, startedAt: base.startedAt };
    } catch (err) {
      return fail('error', String(err).slice(0, 300));
    } finally {
      if (node) await node.stop().catch(() => undefined);
      if (runDir) await rm(runDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
