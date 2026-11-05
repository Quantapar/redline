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
  opts: { recipe: WatchRecipe; enqueue: (scanId: string) => Promise<void> },
): Promise<{ recipeId: string; scansQueued: number }> {
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
  for (const repo of repos) {
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
  }
  return { recipeId: recipe.id, scansQueued: queued };
}
