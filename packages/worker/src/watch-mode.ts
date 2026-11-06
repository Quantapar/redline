import { createScan, insertRecipe, schema, desc, eq, type Database } from '@redline/db';

export interface WatchRecipe {
  weaknessClass: string;
  chain: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  template: string;
  labels?: string[];
}

/**
 * Watch mode: a new hack appears in the world, so we turn it into a recipe and
 * re-test every customer. Adds the recipe to the shared library and queues a
 * watch-mode scan of each enabled repository's latest known version.
 */
export async function triggerWatchMode(
  db: Database,
  opts: {
    recipe: WatchRecipe;
    enqueue: (scanId: string) => Promise<void>;
    /** called when one repo fails to queue; the rollout continues regardless */
    onError?: (repositoryId: string, err: unknown) => void;
  },
): Promise<{ recipeId: string; scansQueued: number; failed: number }> {
  const recipe = await insertRecipe(db, {
    weaknessClass: opts.recipe.weaknessClass,
    chain: opts.recipe.chain,
    severity: opts.recipe.severity,
    labels: opts.recipe.labels ?? [],
    title: opts.recipe.title,
    template: opts.recipe.template,
    source: 'watch-mode',
  });

  const repos = await db.select().from(schema.repositories).where(eq(schema.repositories.enabled, true));
  let queued = 0;
  let failed = 0;
  for (const repo of repos) {
    // Re-testing is a fan-out: one repo that fails to queue (DB hiccup, bad data)
    // must not abort the rollout to every other customer. Isolate each repo.
    try {
      const [latest] = await db
        .select()
        .from(schema.scans)
        .where(eq(schema.scans.repositoryId, repo.id))
        .orderBy(desc(schema.scans.createdAt))
        .limit(1);
      const commitSha = latest?.commitSha ?? 'HEAD';
      const scan = await createScan(db, {
        repositoryId: repo.id,
        trigger: 'watch-mode',
        commitSha,
        isIncremental: false,
        changedTargets: latest?.changedTargets ?? [],
      });
      await opts.enqueue(scan.id);
      queued += 1;
    } catch (err) {
      failed += 1;
      opts.onError?.(repo.id, err);
    }
  }
  return { recipeId: recipe.id, scansQueued: queued, failed };
}
