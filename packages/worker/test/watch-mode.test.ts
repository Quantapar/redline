import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { schema } from '@redline/db';
import { triggerWatchMode } from '../src/watch-mode.js';
import { testDb, resetDb, seedRepo } from './helpers.js';

const handle = testDb();
beforeEach(async () => { await resetDb(handle.db); });
afterAll(async () => { await handle.close(); });

describe('watch mode', () => {
  it('adds a recipe and queues a scan for every enabled repo', async () => {
    await seedRepo(handle.db);
    await seedRepo(handle.db);
    const queued: string[] = [];
    const res = await triggerWatchMode(handle.db, {
      recipe: { weaknessClass: 'signature-replay', chain: 'ethereum', severity: 'high', title: 'New replay hack', template: 'replay the signed permit' },
      enqueue: async (id) => { queued.push(id); },
    });
    expect(res.scansQueued).toBe(2);
    expect(queued).toHaveLength(2);
    const recipes = await handle.db.select().from(schema.recipes);
    expect(recipes).toHaveLength(1);
    expect(recipes[0]!.source).toBe('watch-mode');
    const scans = await handle.db.select().from(schema.scans);
    expect(scans.every((s) => s.trigger === 'watch-mode')).toBe(true);
  });

  it('queues nothing when there are no repos', async () => {
    const res = await triggerWatchMode(handle.db, {
      recipe: { weaknessClass: 'reentrancy', chain: 'ethereum', severity: 'critical', title: 't', template: 't' },
      enqueue: async () => {},
    });
    expect(res.scansQueued).toBe(0);
  });

  it('keeps rolling out to other repos when one fails to queue', async () => {
    await seedRepo(handle.db);
    await seedRepo(handle.db);
    await seedRepo(handle.db);
    let n = 0;
    const errored: string[] = [];
    const res = await triggerWatchMode(handle.db, {
      recipe: { weaknessClass: 'reentrancy', chain: 'ethereum', severity: 'critical', title: 't', template: 't' },
      // the second repo's enqueue throws; the rollout must continue to the third
      enqueue: async () => { n += 1; if (n === 2) throw new Error('queue down'); },
      onError: (repoId) => errored.push(repoId),
    });
    expect(res.scansQueued).toBe(2); // first and third succeeded
    expect(res.failed).toBe(1);      // second failed but did not abort
    expect(errored).toHaveLength(1);
    // the recipe was still added despite the one failure
    expect(await handle.db.select().from(schema.recipes)).toHaveLength(1);
  });
});
