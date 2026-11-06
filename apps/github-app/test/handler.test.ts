import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDb, schema, eq } from '@redline/db';
import { redlineApp, resolveScanCheck } from '../src/app.js';
import { createScan, setScanCheckRun, insertCandidate, insertFinding } from '@redline/db';
import { vi } from 'vitest';

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

  it('bounds a hostile PR: caps file count and source size stored on the scan', async () => {
    await handle.db.delete(schema.scans);
    const { app, handlers } = fakeApp();
    redlineApp(app as never, { db: handle.db, queue: fakeQueue, skipCompletion: true });
    const files = Array.from({ length: 200 }, (_, i) => `src/C${i}.sol`);
    const huge = '// x\ncontract Vault {}\n' + 'A'.repeat(500_000);
    const ctx = {
      octokit: {
        paginate: async () => files.map((filename) => ({ filename })),
        pulls: { listFiles: () => {} },
        repos: { getContent: async () => ({ data: { content: b64(huge), encoding: 'base64' } }) },
        checks: { create: async () => ({ data: { id: 999 } }) },
      },
      repo: () => ({ owner: 'acme', repo: 'vault' }),
      payload: {
        pull_request: { number: 9, head: { ref: 'feature/big', sha: 'bigsha' }, base: { sha: 'basesha' } },
        repository: { owner: { login: 'acme', id: 1 }, id: 100, full_name: 'acme/vault', default_branch: 'main' },
        installation: { id: 55 },
      },
    };
    await handlers.get('pull_request.opened')!(ctx);
    const [scan] = await handle.db.select().from(schema.scans);
    const targets = scan!.changedTargets as { source: string }[];
    expect(targets.length).toBeLessThanOrEqual(50);          // file count capped
    expect(targets[0]!.source.length).toBeLessThanOrEqual(256_000); // source size capped
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


describe('resolveScanCheck — resolves the GitHub check when a scan ends', () => {
  async function seedScanWithCheck(opts: { red: boolean; withCheckRun: boolean }) {
    const n = Math.floor(Math.random() * 1e9);
    const [acc] = await handle.db.insert(schema.accounts).values({ githubLogin: `rsc-${n}`, githubId: n }).returning();
    const [inst] = await handle.db.insert(schema.installations).values({ accountId: acc!.id, githubInstallationId: n }).returning();
    const [repo] = await handle.db.insert(schema.repositories).values({ installationId: inst!.id, githubRepoId: n, fullName: `acme/vault-${n}` }).returning();
    const scan = await createScan(handle.db, { repositoryId: repo!.id, trigger: 'pull-request', commitSha: 'rsc', prNumber: 1 });
    if (opts.withCheckRun) await setScanCheckRun(handle.db, scan.id, 7777);
    if (opts.red) {
      const c = await insertCandidate(handle.db, { scanId: scan.id, hunterModel: 'm', weaknessClass: 'reentrancy', targetContract: 'V', summary: 's', forgeTest: 'f' });
      await insertFinding(handle.db, { scanId: scan.id, candidateId: c.id, weaknessClass: 'reentrancy', title: 'Reentrancy in V', plainSentence: 'p', consensus: 'reproduced', isRed: true, agreementCount: 3, refereeCount: 3 });
    }
    return scan;
  }
  const fakeAuth = (update: ReturnType<typeof vi.fn>) => async () => ({ checks: { update } });

  it('fails the check on a completed scan with a red finding', async () => {
    const scan = await seedScanWithCheck({ red: true, withCheckRun: true });
    const update = vi.fn().mockResolvedValue({});
    const r = await resolveScanCheck({ db: handle.db, scanId: scan.id, authFor: fakeAuth(update), appUrl: 'https://x', outcome: 'completed' });
    expect(r).toBe('resolved');
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]![0]).toMatchObject({ check_run_id: 7777, conclusion: 'failure', status: 'completed' });
  });

  it('passes the check on a completed scan with no red finding', async () => {
    const scan = await seedScanWithCheck({ red: false, withCheckRun: true });
    const update = vi.fn().mockResolvedValue({});
    await resolveScanCheck({ db: handle.db, scanId: scan.id, authFor: fakeAuth(update), appUrl: 'https://x', outcome: 'completed' });
    expect(update.mock.calls[0]![0]).toMatchObject({ conclusion: 'success' });
  });

  it('resolves a FAILED scan to neutral (never blocks the merge, never hangs)', async () => {
    const scan = await seedScanWithCheck({ red: false, withCheckRun: true });
    const update = vi.fn().mockResolvedValue({});
    await resolveScanCheck({ db: handle.db, scanId: scan.id, authFor: fakeAuth(update), appUrl: 'https://x', outcome: 'failed' });
    expect(update.mock.calls[0]![0]).toMatchObject({ conclusion: 'neutral' });
  });

  it('skips (no octokit call) when there is no check run or no scan id', async () => {
    const scan = await seedScanWithCheck({ red: false, withCheckRun: false });
    const update = vi.fn();
    expect(await resolveScanCheck({ db: handle.db, scanId: scan.id, authFor: fakeAuth(update), appUrl: 'https://x', outcome: 'completed' })).toBe('skipped');
    expect(await resolveScanCheck({ db: handle.db, scanId: undefined, authFor: fakeAuth(update), appUrl: 'https://x', outcome: 'completed' })).toBe('skipped');
    expect(update).not.toHaveBeenCalled();
  });
});
