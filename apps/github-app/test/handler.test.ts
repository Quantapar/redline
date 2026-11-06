import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createDb, schema, eq } from '@redline/db';
import { redlineApp, resolveScanCheck } from '../src/app.js';
import { createScan, setScanCheckRun, setScanStatus, insertCandidate, insertFinding } from '@redline/db';
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

function prContext(opts: { files: string[]; issues?: unknown }) {
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
      issues: opts.issues,
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

  it('posts the pending verdict comment on the PR when a scan is queued', async () => {
    await handle.db.delete(schema.scans);
    const { app, handlers } = fakeApp();
    redlineApp(app as never, { db: handle.db, queue: fakeQueue, skipCompletion: true });
    const issues = { listComments: vi.fn().mockResolvedValue({ data: [] }), createComment: vi.fn().mockResolvedValue({}), updateComment: vi.fn() };
    await handlers.get('pull_request.opened')!(prContext({ files: ['src/Vault.sol'], issues }));
    expect(issues.createComment).toHaveBeenCalledOnce();
    expect(issues.createComment.mock.calls[0]![0]).toMatchObject({ owner: 'acme', repo: 'vault', issue_number: 7 });
    expect(issues.createComment.mock.calls[0]![0].body).toMatch(/Redline is attacking this change/);
    expect(jobs).toHaveLength(1);
  });

  it('still queues the scan when the pending comment cannot be posted', async () => {
    await handle.db.delete(schema.scans);
    const { app, handlers } = fakeApp();
    redlineApp(app as never, { db: handle.db, queue: fakeQueue, skipCompletion: true });
    const issues = { listComments: vi.fn().mockRejectedValue(new Error('403')), createComment: vi.fn(), updateComment: vi.fn() };
    await handlers.get('pull_request.opened')!(prContext({ files: ['src/Vault.sol'], issues }));
    expect(jobs).toHaveLength(1);
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
  async function seedScanWithCheck(opts: { red: boolean; withCheckRun: boolean; unverified?: boolean }) {
    const n = Math.floor(Math.random() * 1e9);
    const [acc] = await handle.db.insert(schema.accounts).values({ githubLogin: `rsc-${n}`, githubId: n }).returning();
    const [inst] = await handle.db.insert(schema.installations).values({ accountId: acc!.id, githubInstallationId: n }).returning();
    const [repo] = await handle.db.insert(schema.repositories).values({ installationId: inst!.id, githubRepoId: n, fullName: `acme/vault-${n}` }).returning();
    const scan = await createScan(handle.db, { repositoryId: repo!.id, trigger: 'pull-request', commitSha: 'rsc', prNumber: 1 });
    // a scan reaching resolveScanCheck on the 'completed' path has finished in the worker
    await setScanStatus(handle.db, scan.id, 'complete');
    if (opts.withCheckRun) await setScanCheckRun(handle.db, scan.id, 7777);
    if (opts.unverified) {
      const c = await insertCandidate(handle.db, { scanId: scan.id, hunterModel: 'm', weaknessClass: 'reentrancy', targetContract: 'V', summary: 's', forgeTest: 'f' });
      await insertFinding(handle.db, { scanId: scan.id, candidateId: c.id, weaknessClass: 'reentrancy', title: 'Reentrancy in V', plainSentence: 'p', consensus: 'inconclusive', isRed: false, agreementCount: 0, refereeCount: 0 });
    }
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

  type C = { id: number; body: string; user: { type: string }; performed_via_github_app?: { id: number } | null };
  const APP = 5639732;
  /** A stateful GitHub comments fake: real paging (100/page) and created comments show up on re-list. */
  function fakeIssues(existing: C[] = [], opts: { racer?: C } = {}) {
    const store = [...existing];
    let nextId = 1000;
    let creates = 0;
    return {
      store,
      listComments: vi.fn(async ({ page = 1 }: { page?: number }) => ({ data: store.slice((page - 1) * 100, page * 100) })),
      createComment: vi.fn(async ({ body }: { body: string }) => {
        creates++;
        // simulate a concurrent event that created its own comment at the same moment
        if (creates === 1 && opts.racer) store.push(opts.racer);
        store.push({ id: nextId++, body, user: { type: 'Bot' }, performed_via_github_app: { id: APP } });
        return {};
      }),
      updateComment: vi.fn(async ({ comment_id, body }: { comment_id: number; body: string }) => {
        const c = store.find((x) => x.id === comment_id); if (c) c.body = body; return {};
      }),
      deleteComment: vi.fn(async ({ comment_id }: { comment_id: number }) => {
        const i = store.findIndex((x) => x.id === comment_id); if (i >= 0) store.splice(i, 1); return {};
      }),
    };
  }
  const authWith = (update: ReturnType<typeof vi.fn>, issues: ReturnType<typeof fakeIssues>) => async () => ({ checks: { update }, issues });
  const ok = () => vi.fn().mockResolvedValue({});
  const resolve = (scanId: string, issues: ReturnType<typeof fakeIssues>, extra: Record<string, unknown> = {}) =>
    resolveScanCheck({ db: handle.db, scanId, authFor: authWith(ok(), issues), appUrl: 'https://x', outcome: 'completed', appId: APP, ...extra });
  const mineC = (id: number, body = '<!-- redline:verdict -->\n## 🟡 Redline is attacking this change'): C =>
    ({ id, body, user: { type: 'Bot' }, performed_via_github_app: { id: APP } });

  it('writes the red verdict as a new PR comment when none exists yet', async () => {
    const scan = await seedScanWithCheck({ red: true, withCheckRun: true });
    const issues = fakeIssues();
    expect(await resolve(scan.id, issues)).toBe('resolved');
    expect(issues.createComment).toHaveBeenCalledOnce();
    const arg = issues.createComment.mock.calls[0]![0] as { issue_number: number; body: string };
    expect(arg.issue_number).toBe(1);
    expect(arg.body).toContain('<!-- redline:verdict -->');
    expect(arg.body).toMatch(/🔴 1 reproduced theft/);
    expect(issues.updateComment).not.toHaveBeenCalled();
  });

  it("edits only Redline's own comment — never a human's or another bot's that quotes the marker", async () => {
    const scan = await seedScanWithCheck({ red: false, withCheckRun: true });
    const issues = fakeIssues([
      { id: 11, body: 'quoting <!-- redline:verdict --> here', user: { type: 'User' } },
      { id: 12, body: '<!-- redline:verdict --> echoed by CI', user: { type: 'Bot' }, performed_via_github_app: { id: 15368 } },
      mineC(22),
    ]);
    await resolve(scan.id, issues);
    expect(issues.createComment).not.toHaveBeenCalled();
    expect(issues.updateComment).toHaveBeenCalledOnce();
    expect(issues.updateComment.mock.calls[0]![0]).toMatchObject({ comment_id: 22 });
    expect(issues.store.find((c) => c.id === 12)!.body).toBe('<!-- redline:verdict --> echoed by CI');
  });

  it('finds its comment past the first page instead of posting a duplicate', async () => {
    const scan = await seedScanWithCheck({ red: false, withCheckRun: true });
    const chatter: C[] = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, body: `comment ${i}`, user: { type: 'User' } }));
    const issues = fakeIssues([...chatter, mineC(500)]);
    await resolve(scan.id, issues);
    expect(issues.createComment).not.toHaveBeenCalled();
    expect(issues.updateComment.mock.calls[0]![0]).toMatchObject({ comment_id: 500 });
  });

  it('when two events raced and both created a comment, keeps one and deletes the extra', async () => {
    const scan = await seedScanWithCheck({ red: true, withCheckRun: true });
    const issues = fakeIssues([], { racer: mineC(900) });
    await resolve(scan.id, issues);
    const mine = issues.store.filter((c) => c.body.includes('redline:verdict'));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.id).toBe(900);               // the oldest survives
    expect(mine[0]!.body).toMatch(/🔴/);          // and carries the verdict, not "attacking"
    expect(issues.deleteComment).toHaveBeenCalledOnce();
  });

  it('a stale scan resolves its own check but never overwrites the newer verdict comment', async () => {
    const older = await seedScanWithCheck({ red: true, withCheckRun: true });
    // a newer scan for the same repo + PR (a synchronize push)
    await createScan(handle.db, { repositoryId: older.repositoryId, trigger: 'pull-request', commitSha: 'newer', prNumber: older.prNumber });
    const update = ok();
    const issues = fakeIssues([mineC(22)]);
    expect(await resolveScanCheck({ db: handle.db, scanId: older.id, authFor: authWith(update, issues), appUrl: 'https://x', outcome: 'completed', appId: APP })).toBe('resolved');
    expect(update).toHaveBeenCalledOnce();               // its check (on its own commit) is resolved
    expect(issues.updateComment).not.toHaveBeenCalled(); // the PR comment is left to the newer scan
    expect(issues.createComment).not.toHaveBeenCalled();
  });

  it('an unverified scan is a neutral check and a "no verdict" comment, not a green pass', async () => {
    const scan = await seedScanWithCheck({ red: false, withCheckRun: true, unverified: true });
    const update = ok();
    const issues = fakeIssues();
    await resolveScanCheck({ db: handle.db, scanId: scan.id, authFor: authWith(update, issues), appUrl: 'https://x', outcome: 'completed', appId: APP });
    expect(update.mock.calls[0]![0]).toMatchObject({ conclusion: 'neutral' });
    expect((issues.createComment.mock.calls[0]![0] as { body: string }).body).toMatch(/No verdict[\s\S]*This is not a pass/);
  });

  it('a failed check update is reported as an error, and the comment is still written', async () => {
    const scan = await seedScanWithCheck({ red: true, withCheckRun: true });
    const issues = fakeIssues();
    const info = vi.fn(); const error = vi.fn();
    const r = await resolveScanCheck({
      db: handle.db, scanId: scan.id, authFor: authWith(vi.fn().mockRejectedValue(new Error('boom')), issues),
      appUrl: 'https://x', outcome: 'completed', appId: APP, log: info, logError: error,
    });
    expect(r).toBe('resolved');
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/could not resolve check .*boom/));
    expect(issues.createComment).toHaveBeenCalledOnce();
  });

  it('writes the "could not finish" comment for a failed scan', async () => {
    const scan = await seedScanWithCheck({ red: false, withCheckRun: true });
    const issues = fakeIssues();
    await resolve(scan.id, issues, { outcome: 'failed' });
    expect((issues.createComment.mock.calls[0]![0] as { body: string }).body).toMatch(/could not finish this scan/);
  });

  it('a PR scan without a check run still gets its verdict comment', async () => {
    const scan = await seedScanWithCheck({ red: true, withCheckRun: false });
    const issues = fakeIssues();
    expect(await resolve(scan.id, issues)).toBe('resolved');
    expect(issues.createComment).toHaveBeenCalledOnce();
  });

  it('skips when the client cannot comment and there is no check run, or there is no scan id', async () => {
    const scan = await seedScanWithCheck({ red: false, withCheckRun: false });
    const update = vi.fn();
    expect(await resolveScanCheck({ db: handle.db, scanId: scan.id, authFor: fakeAuth(update), appUrl: 'https://x', outcome: 'completed' })).toBe('skipped');
    expect(await resolveScanCheck({ db: handle.db, scanId: undefined, authFor: fakeAuth(update), appUrl: 'https://x', outcome: 'completed' })).toBe('skipped');
    expect(update).not.toHaveBeenCalled();
  });
});
