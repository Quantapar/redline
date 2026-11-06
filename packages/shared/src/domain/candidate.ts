import { z } from 'zod';
import { WeaknessClass } from './enums.js';

/**
 * A candidate is a HYPOTHESIS produced by a hunter model: "this might be
 * exploitable, here is an attack to try." It is an opinion until the referee
 * council reproduces it. Candidates may use cheat shortcuts while searching;
 * those are stripped before verification.
 */
export const AttackStep = z.object({
  description: z.string(),
  /** solidity/forge-test fragment or a structured call */
  call: z.string(),
});
export type AttackStep = z.infer<typeof AttackStep>;

/** One honest-user transaction sent to the target before the attack (from a separate funded wallet). */
export const SeedStep = z.object({
  /** plain function signature, e.g. 'deposit()' */
  sig: z.string().max(200),
  args: z.array(z.string().max(200)).max(16).default([]),
  /** wei sent with the call (decimal string) */
  valueWei: z.string().regex(/^\d+$/).default('0'),
});
export type SeedStep = z.infer<typeof SeedStep>;

/**
 * How a referee REPRODUCES a candidate for real. The attack itself is a deployable
 * Solidity contract (in `Candidate.forgeTest`) that exposes `constructor(address target)`
 * and `attack() external payable`. The referee deploys the target from one wallet,
 * replays the seed transactions as an honest user, deploys the attacker from a second
 * wallet, calls attack() with the stake as msg.value, and measures the balances on
 * chain. Nothing in this plan is trusted as a verdict; it only tells the referee what
 * to run.
 */
export const ExploitPlan = z.object({
  /** name of the attacker contract inside the attack source */
  attackerContract: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/),
  /** how to deploy the target on a fresh chain (null when it takes no constructor args) */
  targetConstructorSig: z.string().max(200).nullable().default(null),
  targetConstructorArgs: z.array(z.string().max(200)).max(16).default([]),
  /** wei the target's deployer sends with the deployment */
  targetDeployValueWei: z.string().regex(/^\d+$/).default('0'),
  /** honest-user transactions to the target before the attack */
  seed: z.array(SeedStep).max(8).default([]),
  /** the attacker's own stake, sent as msg.value to attack() */
  stakeWei: z.string().regex(/^\d+$/).default('0'),
  /** on a forked chain: the already-deployed target address (fresh chain: ignored) */
  targetAddress: z.string().regex(/^0x[0-9a-fA-F]{40}$/).nullable().default(null),
});
export type ExploitPlan = z.infer<typeof ExploitPlan>;

export const Candidate = z.object({
  id: z.string(),
  scanId: z.string(),
  hunterModel: z.string(),         // which model proposed it (from the swarm)
  modelReceipt: z.string().nullable().optional(), // provider receipt proving which model ran
  weaknessClass: WeaknessClass,
  targetContract: z.string(),
  targetFunction: z.string().nullable(),
  summary: z.string(),             // one plain sentence
  /**
   * The attack source, authored against the user's own code. With a `plan` this is a
   * deployable attacker contract the referee runs as real transactions; without one
   * (legacy / simulation fixtures) it is a forge test the real referee cannot measure
   * and therefore never calls moved.
   */
  forgeTest: z.string(),
  /** how a referee reproduces the attack for real; null means it cannot be measured */
  plan: ExploitPlan.nullable().optional(),
  steps: z.array(AttackStep),
  /** claimed value moved (wei, decimal string) — to be proven, not trusted */
  claimedValueWei: z.string(),
  /** did the hunter rely on cheatcodes/shortcuts that must be stripped? */
  usedShortcuts: z.boolean(),
  createdAt: z.string(),
});
export type Candidate = z.infer<typeof Candidate>;
