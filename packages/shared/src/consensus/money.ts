import type { BalanceDelta } from '../domain/referee.js';

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
 * Sanity check that a referee run is internally consistent: the attacker's
 * post balance minus pre balance should be within a tolerance of the reported
 * net (allowing for gas bookkeeping). Guards against fabricated deltas.
 */
export function deltaIsConsistent(d: BalanceDelta, toleranceWei = '0'): boolean {
  const tol = wei(toleranceWei);
  const observed = wei(d.attackerAfter) - wei(d.attackerBefore);
  const reported = wei(d.attackerNetOfGas);
  const diff = observed - reported;
  const abs = diff < 0n ? -diff : diff;
  return abs <= tol;
}
