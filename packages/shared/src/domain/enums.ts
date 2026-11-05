import { z } from 'zod';

/** Severity assigned by the judgment panel (never creates/cancels a red result). */
export const Severity = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof Severity>;

/** Classes of smart-contract weakness the hunters probe for. */
export const WeaknessClass = z.enum([
  'reentrancy',
  'access-control',
  'unchecked-external-call',
  'integer-overflow',
  'price-oracle-manipulation',
  'flash-loan',
  'logic-error',
  'uninitialized-storage',
  'delegatecall',
  'signature-replay',
  'dos',
  'front-running',
  'other',
]);
export type WeaknessClass = z.infer<typeof WeaknessClass>;

/** Lifecycle of a scan. */
export const ScanStatus = z.enum([
  'queued',
  'preparing',
  'static-analysis',
  'hunting',
  'verifying',
  'judging',
  'complete',
  'failed',
  'cancelled',
]);
export type ScanStatus = z.infer<typeof ScanStatus>;

/** Why a scan was triggered. */
export const ScanTrigger = z.enum(['first-scan', 'push', 'pull-request', 'watch-mode', 'manual']);
export type ScanTrigger = z.infer<typeof ScanTrigger>;

/** A single referee's finding on whether value actually moved. */
export const RefereeOutcome = z.enum(['moved', 'did-not-move', 'error', 'build-failed']);
export type RefereeOutcome = z.infer<typeof RefereeOutcome>;

/**
 * The council's consensus over all referee runs.
 * - reproduced: referees independently agree value moved -> raises a red alarm
 * - fragile:    referees disagree -> not a universal bug, NO alarm
 * - not-reproduced: referees agree value did not move -> NO alarm
 * - inconclusive: not enough valid runs to decide
 */
export const Consensus = z.enum(['reproduced', 'fragile', 'not-reproduced', 'inconclusive']);
export type Consensus = z.infer<typeof Consensus>;
