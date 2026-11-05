import type { PrepareResult } from './pipeline.js';
import { DEFAULT_POLICY } from '@redline/shared';
import type { schema } from '@redline/db';

/**
 * Production prepare step: clone the repo at the commit, detect contracts and
 * test setup, diff against the base to find changed + connected targets, and run
 * Slither/Aderyn to collect focus hints. Stubbed here; wired to git in a later pass.
 */
export async function gitPrepare(_scan: typeof schema.scans.$inferSelect): Promise<PrepareResult> {
  // TODO: clone + detect + diff + static analysis. Until then, no targets.
  return { targets: [], policy: DEFAULT_POLICY };
}
