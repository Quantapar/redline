import { createHash } from 'node:crypto';
import type { Candidate, RefereeRun, RefereeOutcome, BalanceDelta } from '@redline/shared';
import { tallyCouncil, theftFromTarget, auditRun, type CouncilConfig, type CouncilResult, DEFAULT_COUNCIL } from '@redline/shared';
import { stripForReferee, scanCheats } from './cheatcodes.js';

export interface RefereeInput {
  candidate: Candidate;
  refereeName: string;
  provider: string;
  forkUrl?: string;
  forkBlock?: number;
  projectDir?: string;
  thresholdWei: string;
}

/** A referee re-runs a stripped attack for real and reports whether money moved. */
export interface RefereeEngine {
  run(input: RefereeInput): Promise<RefereeRun>;
}

function mkRun(input: RefereeInput, outcome: RefereeOutcome, extra: Partial<RefereeRun> = {}): RefereeRun {
  const now = new Date().toISOString();
  return {
    id: `${input.candidate.id}:${input.refereeName}`,
    candidateId: input.candidate.id,
    refereeName: input.refereeName,
    provider: input.provider,
    forkBlock: input.forkBlock ?? 0,
    outcome,
    thresholdWei: input.thresholdWei,
    deltas: [],
    traceRef: null,
    logsRef: null,
    startedAt: now,
    finishedAt: now,
    error: null,
    ...extra,
  };
}

// ---- Simulation engine (offline, deterministic) ----

interface SimDirective {
  exploitable: boolean;
  netWei: string;
  cheatDependent: boolean;
  flaky: boolean;
}

/** Parse a `// @redline-sim ...` directive used by fixtures and offline mode. */
export function parseSimDirective(source: string): SimDirective | null {
  const m = source.match(/@redline-sim\s+([^\n]+)/);
  if (!m) return null;
  const spec = m[1] ?? '';
  const get = (k: string, d: string) => (spec.match(new RegExp(`${k}=([^\\s]+)`))?.[1] ?? d);
  return {
    exploitable: get('exploitable', 'false') === 'true',
    netWei: get('netWei', '0'),
    cheatDependent: get('cheatDependent', 'false') === 'true',
    flaky: get('flaky', 'false') === 'true',
  };
}

/**
 * Deterministic referee used for offline dev, CI, and demos. It mirrors the real
 * two-room logic: a cheat-dependent exploit stops moving money once stripped, a
 * flaky exploit disagrees across providers, a genuine one reproduces everywhere.
 */
export class SimulationRefereeEngine implements RefereeEngine {
  async run(input: RefereeInput): Promise<RefereeRun> {
    const { candidate } = input;
    const directive = parseSimDirective(candidate.forgeTest);
    const cheats = scanCheats(candidate.forgeTest);

    // Unknown ground truth: no proof, so the honest default is "did not move".
    if (!directive) return mkRun(input, 'did-not-move');

    // Cheat-dependent exploits fail in the referee's room (cheats are stripped).
    if (directive.cheatDependent && cheats.hasForbidden) {
      return mkRun(input, 'did-not-move');
    }
    if (!directive.exploitable) return mkRun(input, 'did-not-move');

    // Flaky exploits reproduce only on some providers -> council sees disagreement.
    if (directive.flaky) {
      const h = parseInt(
        createHash('sha256').update(`${candidate.id}:${input.provider}`).digest('hex').slice(0, 8),
        16,
      );
      if (h % 2 === 0) return mkRun(input, 'did-not-move');
    }

    const delta: BalanceDelta = {
      token: 'native',
      attackerBefore: '0',
      attackerAfter: directive.netWei,
      targetBefore: directive.netWei,
      targetAfter: '0',
      attackerNetOfGas: directive.netWei,
    };
    // The fact the council votes on: did value at or above the threshold leave the target?
    const moved = theftFromTarget([delta], input.thresholdWei);
    return mkRun(input, moved ? 'moved' : 'did-not-move', { deltas: [delta], traceRef: `sim://${input.refereeName}` });
  }
}

// ---- Council dispatch ----

export interface CouncilDispatch {
  providers: string[];        // one per referee, must be distinct
  blocks: number[];           // fork block per referee (may vary)
  forkUrlFor?: (provider: string) => string | undefined;
  /** prepared Foundry project (src + forge-std) the real referee compiles against */
  projectDir?: string;
  thresholdWei: string;
  config?: CouncilConfig;
}

export interface CouncilOutcome {
  runs: RefereeRun[];
  result: CouncilResult;
}

/**
 * Dispatch a candidate to the full council: several independent referees, each
 * on its own provider/block, then tally the fact (did the money move?).
 */
export async function runCouncil(
  engine: RefereeEngine,
  candidate: Candidate,
  dispatch: CouncilDispatch,
): Promise<CouncilOutcome> {
  // Each referee engine strips forbidden cheats itself (plain-transactions rule);
  // here we only flag whether the candidate leaned on any, for the record.
  const { removed } = stripForReferee(candidate.forgeTest);
  const forRun: Candidate = { ...candidate, usedShortcuts: removed.length > 0 };

  // Every 'moved' vote must be backed by measured deltas that add up; a vote that
  // is not is demoted to an error before the tally, so no engine (and no attack
  // output an engine might have trusted) can manufacture a red by assertion.
  const runs = (await Promise.all(
    dispatch.providers.map((provider, i) =>
      engine.run({
        candidate: forRun,
        refereeName: `referee-${String.fromCharCode(97 + i)}`,
        provider,
        forkUrl: dispatch.forkUrlFor?.(provider),
        forkBlock: dispatch.blocks[i] ?? dispatch.blocks[0] ?? 0,
        projectDir: dispatch.projectDir,
        thresholdWei: dispatch.thresholdWei,
      }),
    ),
  )).map(auditRun);

  const result = tallyCouncil(runs, dispatch.config ?? DEFAULT_COUNCIL);
  return { runs, result };
}
