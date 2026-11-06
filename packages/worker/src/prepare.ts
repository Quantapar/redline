import type { PrepareResult } from './pipeline.js';
import { DEFAULT_POLICY, extractContractName } from '@redline/shared';
import type { schema } from '@redline/db';
import type { HuntTarget } from '@redline/hunters';

interface StoredTarget {
  file: string;
  contract?: string;
  source?: string;
  changedFunctions?: string[];
}

/**
 * Build hunt targets from the sources the GitHub App captured for the changed
 * contracts. The App fetches each changed .sol file's content at the scanned
 * commit and stores it on the scan, so the worker (in its own sealed sandbox)
 * has exactly the code under review without cloning.
 */
export async function gitPrepare(scan: typeof schema.scans.$inferSelect): Promise<PrepareResult> {
  const stored = (scan.changedTargets as StoredTarget[] | null) ?? [];
  const targets: HuntTarget[] = [];
  for (const t of stored) {
    if (!t.source) continue; // no content captured -> nothing to attack
    const contractName = t.contract || extractContractName(t.source, 'Unknown', t.file);
    // SECURITY: t.file is a PR-author-controlled path. It is safe to store and to
    // use as a GitHub API path (GitHub resolves it within the repo). When it is
    // joined into a local write path for the Foundry src-prep step, it MUST go
    // through `safeProjectPath` (packages/engine/src/broadcast.ts), which rejects
    // absolute paths and `..` traversal so a crafted filename cannot escape the
    // sandbox project dir. That guard is implemented and unit-tested.
    targets.push({
      contractName,
      filePath: t.file,
      source: t.source,
      changedFunctions: t.changedFunctions && t.changedFunctions.length > 0
        ? t.changedFunctions
        : [...t.source.matchAll(/function\s+(\w+)/g)].map((m) => m[1]!).slice(0, 20),
      analyzerNotes: [],
    });
  }
  // Return the default here; the pipeline overrides it with the repository's own
  // .redline/policy.yml (cached as policyJson) when the repo has a valid one, so the
  // per-repo rules guide both the hunt prompt and the judge.
  return { targets, policy: DEFAULT_POLICY };
}
