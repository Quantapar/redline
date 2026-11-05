import { z } from 'zod';
import { ScanStatus, ScanTrigger } from './enums.js';

export const ChangedTarget = z.object({
  file: z.string(),
  contract: z.string(),
  changedFunctions: z.array(z.string()),
  /** functions connected to the change (callers/callees) that are also in scope */
  connectedFunctions: z.array(z.string()),
});
export type ChangedTarget = z.infer<typeof ChangedTarget>;

export const Scan = z.object({
  id: z.string(),
  repositoryId: z.string(),
  trigger: ScanTrigger,
  status: ScanStatus,
  commitSha: z.string(),
  baseSha: z.string().nullable(),     // null for first-scan (whole codebase)
  prNumber: z.number().int().nullable(),
  isIncremental: z.boolean(),         // true = attack only what changed + connected
  changedTargets: z.array(ChangedTarget),
  /** hard spend cap for this scan, in USD cents, enforced by the budget guard */
  budgetCapCents: z.number().int().positive(),
  spentCents: z.number().int().nonnegative(),
  candidateCount: z.number().int().nonnegative(),
  redFindingCount: z.number().int().nonnegative(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type Scan = z.infer<typeof Scan>;
