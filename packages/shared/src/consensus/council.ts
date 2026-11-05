import type { RefereeRun } from '../domain/referee.js';
import type { Consensus } from '../domain/enums.js';

export interface CouncilConfig {
  /** minimum number of VALID (non-error) runs required to reach any verdict */
  minValidRuns: number;
  /** number of independent 'moved' votes required to call it reproduced */
  quorum: number;
  /**
   * If false (default, strict), ANY referee reporting 'did-not-move' forces a
   * 'fragile' verdict even when quorum of 'moved' is met — because a universal
   * bug should reproduce everywhere. If true, dissent is tolerated once quorum
   * is reached.
   */
  allowDissent: boolean;
  /** referees must run on distinct providers for the verdict to count */
  requireDistinctProviders: boolean;
}

export const DEFAULT_COUNCIL: CouncilConfig = {
  minValidRuns: 3,
  quorum: 3,
  allowDissent: false,
  requireDistinctProviders: true,
};

export interface CouncilResult {
  consensus: Consensus;
  /** number of valid runs that reported value moved */
  agreementCount: number;
  validCount: number;
  dissentCount: number;
  errorCount: number;
  providersDistinct: boolean;
  /** true iff consensus === 'reproduced' — the ONLY thing that raises a red alarm */
  isRed: boolean;
  reasons: string[];
}

/**
 * The referee council. Takes the independent referee runs and decides the one
 * fact that matters: did the money move, reproducibly, across independent rooms?
 *
 * This function never reads code and never forms an opinion. It only counts
 * agreement over measured outcomes. Only 'reproduced' is red.
 */
export function tallyCouncil(
  runs: RefereeRun[],
  config: CouncilConfig = DEFAULT_COUNCIL,
): CouncilResult {
  const reasons: string[] = [];
  const valid = runs.filter((r) => r.outcome === 'moved' || r.outcome === 'did-not-move');
  const moved = valid.filter((r) => r.outcome === 'moved');
  const didNotMove = valid.filter((r) => r.outcome === 'did-not-move');
  const errorCount = runs.length - valid.length;

  const providers = new Set(valid.map((r) => r.provider));
  const providersDistinct = providers.size === valid.length;

  const base = {
    agreementCount: moved.length,
    validCount: valid.length,
    dissentCount: didNotMove.length,
    errorCount,
    providersDistinct,
  };

  const fail = (consensus: Consensus, reason: string): CouncilResult => {
    reasons.push(reason);
    return { ...base, consensus, isRed: false, reasons };
  };

  if (valid.length < config.minValidRuns) {
    return fail('inconclusive', `only ${valid.length}/${config.minValidRuns} valid runs`);
  }
  if (config.requireDistinctProviders && !providersDistinct) {
    return fail('inconclusive', 'referees did not run on distinct providers');
  }

  if (moved.length >= config.quorum) {
    if (!config.allowDissent && didNotMove.length > 0) {
      return fail(
        'fragile',
        `quorum met (${moved.length}) but ${didNotMove.length} referee(s) disagreed; not universal`,
      );
    }
    reasons.push(`${moved.length} independent referees reproduced the theft`);
    return { ...base, consensus: 'reproduced', isRed: true, reasons };
  }

  if (moved.length > 0) {
    return fail(
      'fragile',
      `only ${moved.length}/${config.quorum} referees reproduced it; fragile or conditional`,
    );
  }

  return fail('not-reproduced', 'no referee could move the money');
}
