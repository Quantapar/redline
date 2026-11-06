import type { BalanceDelta, RefereeRun } from '../domain/referee.js';

/** Parse a wei decimal string to bigint; throws on malformed input. */
export function wei(v: string): bigint {
  if (!/^-?\d+$/.test(v)) throw new Error(`invalid wei value: ${v}`);
  return BigInt(v);
}

/**
 * Decide, from measured balances alone, whether value actually moved to the
 * attacker. This is the FACT the council votes on — not an opinion about the code.
 *
 * Money moved iff the attacker's net gain (across every tracked token), after
 * subtracting gas, meets or exceeds the threshold. The threshold must be > 0 so
 * that dust and rounding never count as a theft.
 */
export function attackerGained(deltas: BalanceDelta[], thresholdWei: string): boolean {
  const threshold = wei(thresholdWei);
  if (threshold <= 0n) throw new Error('threshold must be positive');
  let totalNativeNet = 0n;
  let anyTokenGain = false;
  for (const d of deltas) {
    const net = wei(d.attackerNetOfGas);
    if (d.token === 'native') {
      totalNativeNet += net;
    } else if (net >= threshold) {
      anyTokenGain = true;
    }
  }
  return totalNativeNet >= threshold || anyTokenGain;
}

/**
 * The fact a real referee votes on: value left THE TARGET and landed with the
 * attacker. For at least one tracked token, the attacker's measured net gain and
 * the target's measured loss must both meet the threshold. Requiring the loss on
 * the target side (not just a gain on the attacker side) means a gain funded by
 * anything other than the contract under review — another contract on a fork, a
 * setup step that pays the attacker — is not a theft of this contract.
 */
export function theftFromTarget(deltas: BalanceDelta[], thresholdWei: string): boolean {
  const threshold = wei(thresholdWei);
  if (threshold <= 0n) throw new Error('threshold must be positive');
  for (const d of deltas) {
    const gain = wei(d.attackerNetOfGas);
    const loss = wei(d.targetBefore) - wei(d.targetAfter);
    if (gain >= threshold && loss >= threshold) return true;
  }
  return false;
}

/**
 * Sanity check that a referee run is internally consistent: the attacker's
 * post balance minus pre balance should be within a tolerance of the reported
 * net (allowing for gas bookkeeping). Guards against fabricated deltas.
 */
export function deltaIsConsistent(d: BalanceDelta, toleranceWei = '0'): boolean {
  try {
    return deltaIsConsistentStrict(d, toleranceWei);
  } catch {
    return false; // malformed numbers are not consistent with anything
  }
}

function deltaIsConsistentStrict(d: BalanceDelta, toleranceWei: string): boolean {
  const tol = wei(toleranceWei);
  const observed = wei(d.attackerAfter) - wei(d.attackerBefore);
  const reported = wei(d.attackerNetOfGas);
  const diff = observed - reported;
  const abs = diff < 0n ? -diff : diff;
  return abs <= tol;
}

/**
 * A 'moved' vote is only valid when it is backed by measured deltas that add up.
 * A run that claims moved with no deltas, or with a reported net that the before/
 * after balances do not support, is a fabricated vote and is demoted to an error
 * (an error is never a valid vote, so it can never contribute to a red).
 */
export function auditRun(run: RefereeRun): RefereeRun {
  if (run.outcome !== 'moved') return run;
  if (run.deltas.length === 0) {
    return { ...run, outcome: 'error', error: 'moved reported without measured deltas' };
  }
  if (!run.deltas.every((d) => deltaIsConsistent(d))) {
    return { ...run, outcome: 'error', error: 'moved reported with deltas inconsistent with measured balances' };
  }
  return run;
}
