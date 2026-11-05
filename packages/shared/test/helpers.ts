import type { RefereeRun } from '../src/domain/referee.js';
import type { RefereeOutcome } from '../src/domain/enums.js';

let seq = 0;
export function makeRun(
  outcome: RefereeOutcome,
  opts: Partial<RefereeRun> = {},
): RefereeRun {
  seq += 1;
  return {
    id: `run-${seq}`,
    candidateId: 'cand-1',
    refereeName: opts.refereeName ?? `referee-${seq}`,
    provider: opts.provider ?? `provider-${seq}`,
    forkBlock: opts.forkBlock ?? 1000 + seq,
    outcome,
    thresholdWei: opts.thresholdWei ?? '1000000000000000', // 0.001 ETH
    deltas: opts.deltas ?? [],
    traceRef: opts.traceRef ?? null,
    logsRef: opts.logsRef ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    error: opts.error ?? null,
    ...opts,
  };
}

export function runs(spec: Array<RefereeOutcome | [RefereeOutcome, Partial<RefereeRun>]>): RefereeRun[] {
  return spec.map((s) => (Array.isArray(s) ? makeRun(s[0], s[1]) : makeRun(s)));
}
