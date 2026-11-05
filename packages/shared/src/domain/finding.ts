import { z } from 'zod';
import { Severity, WeaknessClass, Consensus } from './enums.js';

/**
 * The judgment panel's assessment. It can rank and explain, but it can NEVER
 * create or cancel a red result. Only a reproduced theft (council consensus)
 * makes a finding red.
 */
export const PanelJudgment = z.object({
  severity: Severity,
  realisticSetup: z.boolean(),      // was the attacker's setup realistic?
  isDuplicate: z.boolean(),
  duplicateOf: z.string().nullable(),
  breaksPolicy: z.array(z.string()),// ids/names of policy rules broken
  rationale: z.string(),
});
export type PanelJudgment = z.infer<typeof PanelJudgment>;

/**
 * A Finding exists only once the council has reached a verdict. It is "red"
 * (an alarm) if and only if consensus === 'reproduced'. The proof travels with
 * it: the attack you can run yourself, and the referee receipts.
 */
export const Finding = z.object({
  id: z.string(),
  scanId: z.string(),
  candidateId: z.string(),
  weaknessClass: WeaknessClass,
  title: z.string(),
  plainSentence: z.string(),        // the one plain sentence shown on the change
  consensus: Consensus,
  isRed: z.boolean(),               // derived: consensus === 'reproduced'
  refereeRunIds: z.array(z.string()),
  agreementCount: z.number().int(),
  refereeCount: z.number().int(),
  /** the attack saved as a reproducible test (gated behind ownership proof for runnable form) */
  regressionTestRef: z.string().nullable(),
  replayRef: z.string().nullable(),
  judgment: PanelJudgment.nullable(),
  createdAt: z.string(),
});
export type Finding = z.infer<typeof Finding>;
