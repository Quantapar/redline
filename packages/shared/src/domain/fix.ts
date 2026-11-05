import { z } from 'zod';

/**
 * A fix is a PR Redline opens for a red finding: the smallest code change, the
 * attack saved as a permanent regression test, and a plain explanation. A human
 * always reviews before merge. After opening, the same attack (plus fresh ones)
 * is re-run against the fix; green means it held.
 */
export const Fix = z.object({
  id: z.string(),
  findingId: z.string(),
  branch: z.string(),
  prNumber: z.number().int().nullable(),
  diff: z.string(),
  explanation: z.string(),
  regressionTestRef: z.string(),
  /** result of re-attacking the fix */
  reattackPassed: z.boolean().nullable(),
  createdAt: z.string(),
});
export type Fix = z.infer<typeof Fix>;
