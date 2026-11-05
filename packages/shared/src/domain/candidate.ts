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

export const Candidate = z.object({
  id: z.string(),
  scanId: z.string(),
  hunterModel: z.string(),         // which model proposed it (from the swarm)
  modelReceipt: z.string().nullable().optional(), // provider receipt proving which model ran
  weaknessClass: WeaknessClass,
  targetContract: z.string(),
  targetFunction: z.string().nullable(),
  summary: z.string(),             // one plain sentence
  /** the attack as a self-contained Foundry test, authored against the user's own code */
  forgeTest: z.string(),
  steps: z.array(AttackStep),
  /** claimed value moved (wei, decimal string) — to be proven, not trusted */
  claimedValueWei: z.string(),
  /** did the hunter rely on cheatcodes/shortcuts that must be stripped? */
  usedShortcuts: z.boolean(),
  createdAt: z.string(),
});
export type Candidate = z.infer<typeof Candidate>;
