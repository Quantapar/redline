import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDb, schema, eq } from '@redline/db';
import { redlineApp } from '../src/app.js';

const url = process.env.TEST_DATABASE_URL ?? 'postgresql://manu@localhost:5432/redline_test';
const handle = createDb(url);

// A fake Probot app that records event handlers and a fake queue that records adds.
function fakeApp() {
  const handlers = new Map<string, (ctx: unknown) => Promise<void>>();
  const app = {
    log: { info() {}, error() {} },
    auth: async () => ({}),
    on(events: string | string[], fn: (ctx: unknown) => Promise<void>) {
      (Array.isArray(events) ? events : [events]).forEach((e) => handlers.set(e, fn));
    },
  };
  return { app, handlers };
}

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64');

function prContext(opts: { files: string[] }) {
  const listFiles = () => {};
  return {
    octokit: {
      paginate: async () => opts.files.map((filename) => ({ filename })),
      pulls: { listFiles },
      repos: {
        getContent: async ({ path }: { path: string }) => ({
          data: { content: b64(`// ${path}\ncontract Vault { function withdraw() external {} }`), encoding: 'base64' },
        }),
      },
      checks: { create: async () => ({ data: { id: 999 } }) },
    },
    repo: () => ({ owner: 'acme', repo: 'vault' }),
    payload: {
      pull_request: { number: 7, head: { ref: 'feature/x', sha: 'headsha' }, base: { sha: 'basesha' } },
      repository: { owner: { login: 'acme', id: 1 }, id: 100, full_name: 'acme/vault', default_branch: 'main' },
      installation: { id: 55 },
    },
  };
}

const jobs: { scanId: string }[] = [];
const fakeQueue = { add: async (_name: string, data: { scanId: string }) => { jobs.push(data); } } as never;

beforeAll(async () => {
  for (const t of [schema.refereeRuns, schema.regressionTests, schema.fixes, schema.findings, schema.candidates, schema.scans, schema.repositories, schema.installations, schema.accounts]) {
    await handle.db.delete(t);
  }
});
afterAll(async () => { await handle.close(); });
beforeEach(() => { jobs.length = 0; });

describe('GitHub App pull_request handler', () => {
  it('creates a scan, stores the check id, and enqueues when a contract changed', async () => {
    const { app, handlers } = fakeApp();
    redlineApp(app as never, { db: handle.db, queue: fakeQueue, skipCompletion: true });
    const handler = handlers.get('pull_request.opened')!;
    expect(handler).toBeDefined();

    await handler(prContext({ files: ['src/Vault.sol', 'README.md'] }));

    const scans = await handle.db.select().from(schema.scans);
    expect(scans).toHaveLength(1);
    expect(scans[0]!.trigger).toBe('pull-request');
    expect(scans[0]!.commitSha).toBe('headsha');
    expect(scans[0]!.prNumber).toBe(7);
    expect(scans[0]!.githubCheckRunId).toBe(999); // the check id was stored
    // the changed contract's source was captured
    const targets = scans[0]!.changedTargets as { file: string; source?: string }[];
    expect(targets[0]!.source).toContain('contract Vault');
    // and it was enqueued
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.scanId).toBe(scans[0]!.id);
  });

  it('does not scan when no Solidity contracts changed', async () => {
    await handle.db.delete(schema.scans);
    const { app, handlers } = fakeApp();
    redlineApp(app as never, { db: handle.db, queue: fakeQueue, skipCompletion: true });
    await handlers.get('pull_request.opened')!(prContext({ files: ['README.md', 'package.json'] }));
    expect(await handle.db.select().from(schema.scans)).toHaveLength(0);
    expect(jobs).toHaveLength(0);
  });
});
