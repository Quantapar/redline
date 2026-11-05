import { z } from 'zod';
import { Severity } from './enums.js';

/**
 * A team's security rules, written in plain English in a .redline/policy.yml file
 * in their repo. No coding needed. The hunters are told to pay special attention
 * to these, and anything breaking them is flagged.
 */
export const PolicyRule = z.object({
  id: z.string(),                 // stable slug, e.g. 'no-unguarded-money-move'
  text: z.string(),               // plain-English rule
  severity: Severity.default('high'),
  /** optional structured hints to focus the hunters */
  appliesTo: z.array(z.string()).default([]), // function-name globs, e.g. ['withdraw*']
});
export type PolicyRule = z.infer<typeof PolicyRule>;

export const Policy = z.object({
  version: z.literal(1).default(1),
  rules: z.array(PolicyRule).default([]),
});
export type Policy = z.infer<typeof Policy>;

export const DEFAULT_POLICY: Policy = { version: 1, rules: [] };
