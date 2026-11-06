import type { PrepareResult } from './pipeline.js';
import { DEFAULT_POLICY } from '@redline/shared';
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
    const contractName = t.contract || t.source.match(/contract\s+(\w+)/)?.[1] || 'Unknown';
    // SECURITY: t.file is a PR-author-controlled path. It is safe to store and to
    // use as a GitHub API path (GitHub resolves it within the repo), but when the
    // Foundry src-prep step is built it MUST NOT be joined into a local write path
    // without normalising and rejecting traversal (`..`, absolute paths), or a
    // crafted filename could escape the sandbox project dir. See docs/NEED-FROM-YOU.md.
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
