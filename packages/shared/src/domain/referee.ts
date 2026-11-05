import { z } from 'zod';
import { RefereeOutcome } from './enums.js';

/**
 * A money measurement taken on a fresh fork: the attacker wallet's balance
 * (and the target contract's balance) before and after running the stripped-down
 * attack as plain transactions. All amounts are wei, as decimal strings.
 */
export const BalanceDelta = z.object({
  token: z.string(),            // 'native' or an ERC-20 address
  attackerBefore: z.string(),
  attackerAfter: z.string(),
  targetBefore: z.string(),
  targetAfter: z.string(),
  /** net value gained by the attacker, after subtracting gas spent (wei, decimal string) */
  attackerNetOfGas: z.string(),
});
export type BalanceDelta = z.infer<typeof BalanceDelta>;

/**
 * One referee's independent re-run of a candidate attack.
 * Each referee runs on its OWN fresh fork, at a different block/provider/moment,
 * from one ordinary wallet funded only enough for gas. Cheat shortcuts (dealing
 * tokens, pranking owners, cheatcodes) are stripped before this runs.
 */
export const RefereeRun = z.object({
  id: z.string(),
  candidateId: z.string(),
  refereeName: z.string(),        // e.g. 'referee-a'
  provider: z.string(),           // RPC provider / compute room, must differ across referees
  forkBlock: z.number().int().nonnegative(),
  outcome: RefereeOutcome,
  /** minimum net value the attacker must gain (over gas) for 'moved' to be true */
  thresholdWei: z.string(),
  deltas: z.array(BalanceDelta),
  /** the exact transaction trace, kept for the replay */
  traceRef: z.string().nullable(),
  logsRef: z.string().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
});
export type RefereeRun = z.infer<typeof RefereeRun>;
