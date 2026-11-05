import { z } from 'zod';
import { WeaknessClass, Severity } from './enums.js';

/**
 * A reusable attack recipe from the shared public library (stored on the public
 * owned/expiring database). The swarm pulls recipes on every scan; proven attacks
 * are published back as entries anyone can replay. Never holds private customer code.
 */
export const Recipe = z.object({
  id: z.string(),
  weaknessClass: WeaknessClass,
  chain: z.string(),
  severity: Severity,
  labels: z.array(z.string()),
  title: z.string(),
  /** generic, parameterised attack template — not tied to any private contract */
  template: z.string(),
  ownerWallet: z.string().nullable(),
  expiresAt: z.string().nullable(),
  source: z.enum(['seed', 'watch-mode', 'community']),
  createdAt: z.string(),
});
export type Recipe = z.infer<typeof Recipe>;
