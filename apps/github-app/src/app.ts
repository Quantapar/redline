import type { Probot, Context } from 'probot';
import { createDb, schema, createScan } from '@redline/db';
import { createScanQueue, enqueueScan, createRedis, scanQueueName } from '@redline/worker';
import { setScanCheckRun, getScanCompletionContext } from '@redline/db';
import { QueueEvents } from 'bullmq';
import { decideIntake, buildCheckOutput, type IntakeEvent } from './scan-intake.js';
import type { Finding } from '@redline/shared';

type Database = ReturnType<typeof createDb>['db'];

/** A GitHub client that can resolve a check run (the slice we use). The arg type is
 *  `any` so the real Octokit (with its own precise params) and a test fake both fit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface CheckUpdater {
  checks: { update: (args: any) => Promise<unknown> };
}

/**
 * Resolve a scan's GitHub check run once the scan finishes or fails. On
 * 'completed' the conclusion comes from the findings (red -> failure); on
 * 'failed' it is neutral — a scan that errored proved nothing, so it must not
 * fail the merge, but must not hang either. Returns whether it resolved or
 * skipped (no scan, no check run, or no installation). Extracted and exported so
 * this wiring — not just buildCheckOutput — is unit-tested.
 */
export async function resolveScanCheck(opts: {
  db: Database;
  scanId: string | undefined;
  authFor: (installationId: number) => Promise<CheckUpdater>;
  appUrl: string;
  outcome: 'completed' | 'failed';
  log?: (msg: string) => void;
}): Promise<'resolved' | 'skipped'> {
  if (!opts.scanId) return 'skipped';
  const ctx = await getScanCompletionContext(opts.db, opts.scanId);
  if (!ctx || !ctx.checkRunId || ctx.installationId == null) return 'skipped';
  const [owner, repo] = ctx.repoFullName.split('/');
  const octokit = await opts.authFor(ctx.installationId);
  const out = opts.outcome === 'completed'
    ? buildCheckOutput(ctx.findings as unknown as Finding[], opts.appUrl)
    : {
        conclusion: 'neutral' as const,
        title: 'Redline scan could not complete',
        summary: 'The scan errored before reaching a verdict. This does not block the merge; re-run the scan to try again.',
      };
  await octokit.checks.update({
    owner: owner!, repo: repo!, check_run_id: ctx.checkRunId,
    status: 'completed', conclusion: out.conclusion, completed_at: new Date().toISOString(),
    output: { title: out.title, summary: out.summary },
  });
  opts.log?.(`[redline] resolved check ${ctx.checkRunId} for scan ${opts.scanId}: ${out.conclusion}`);
  return 'resolved';
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// Bounds on attacker-influenced PR input (changed-file list and file contents).
// A PR with thousands of .sol files, or a single enormous file, must not be able
// to exhaust GitHub API calls or bloat the scan row. Generous for real repos.
const MAX_CHANGED_FILES = 50;
const MAX_SOURCE_CHARS = 256_000;

interface RepoMeta {
  ownerLogin: string;
  ownerId: number;
  repoId: number;
  fullName: string;
  defaultBranch: string;
}

/**
 * The Redline GitHub App. It installs on your repos, hears about code changes,
 * opens an in-progress check, queues a scan, and (on completion) turns the check
 * red with a link to the proof. Registration details are in docs/GITHUB_APP.md.
 */
export interface RedlineAppDeps {
  db?: ReturnType<typeof createDb>['db'];
  queue?: ReturnType<typeof createScanQueue>;
  /** skip the Redis QueueEvents completion listener (tests) */
  skipCompletion?: boolean;
}

export function redlineApp(app: Probot, deps: RedlineAppDeps = {}): void {
  const db = deps.db ?? createDb().db;
  const queue = deps.queue ?? createScanQueue();

  // When a scan completes (in the separate worker process), resolve its check.
  if (!deps.skipCompletion) {
  const events = new QueueEvents(scanQueueName(), { connection: createRedis() });
  const scanIdFor = async (jobId: string) => (await queue.getJob(jobId))?.data.scanId as string | undefined;
  const authFor = (installationId: number) => app.auth(installationId);
  events.on('completed', async ({ jobId }: { jobId: string }) => {
    try { await resolveScanCheck({ db, scanId: await scanIdFor(jobId), authFor, appUrl: APP_URL, outcome: 'completed', log: (m) => app.log.info(m) }); }
    catch (err) { app.log.error(`[redline] failed to resolve check: ${String(err)}`); }
  });
  // A scan job that errors fires 'failed', not 'completed'. Without this, the check
  // created as in_progress would hang forever and (under branch protection) block the
  // PR over an infrastructure hiccup. resolveScanCheck sets it to neutral: a scan that
  // errored proved nothing, so it must not fail the merge, but it must not hang either.
  events.on('failed', async ({ jobId }: { jobId: string }) => {
    try { await resolveScanCheck({ db, scanId: await scanIdFor(jobId), authFor, appUrl: APP_URL, outcome: 'failed', log: (m) => app.log.info(m) }); }
    catch (err) { app.log.error(`[redline] failed to resolve a failed scan's check: ${String(err)}`); }
  });
  }

  async function upsertRepo(meta: RepoMeta, installationId: number): Promise<string> {
    const [account] = await db
      .insert(schema.accounts)
      .values({ githubLogin: meta.ownerLogin, githubId: meta.ownerId })
      .onConflictDoUpdate({ target: schema.accounts.githubId, set: { githubLogin: meta.ownerLogin } })
      .returning();
    const [inst] = await db
      .insert(schema.installations)
      .values({ accountId: account!.id, githubInstallationId: installationId })
      .onConflictDoUpdate({ target: schema.installations.githubInstallationId, set: { accountId: account!.id } })
      .returning();
    const [row] = await db
      .insert(schema.repositories)
      .values({ installationId: inst!.id, githubRepoId: meta.repoId, fullName: meta.fullName, defaultBranch: meta.defaultBranch })
      .onConflictDoUpdate({ target: schema.repositories.githubRepoId, set: { fullName: meta.fullName, defaultBranch: meta.defaultBranch } })
      .returning();
    return row!.id;
  }

  async function fetchChangedTargets(
    octokit: Context['octokit'],
    repoRef: { owner: string; repo: string },
    ref: string,
    files: string[],
  ) {
    const targets: { file: string; contract: string; source: string; changedFunctions: string[]; connectedFunctions: string[] }[] = [];
    // A PR author controls the changed-file list and contents. Bound both so a
    // huge PR cannot exhaust GitHub API calls or bloat the scan row: cap the
    // number of files fetched and the size of each source we store.
    for (const file of files.slice(0, MAX_CHANGED_FILES)) {
      try {
        const res = await octokit.repos.getContent({ ...repoRef, path: file, ref });
        const data = res.data as { content?: string; encoding?: string };
        if (!data.content) continue;
        const source = Buffer.from(data.content, (data.encoding as BufferEncoding) ?? 'base64')
          .toString('utf8')
          .slice(0, MAX_SOURCE_CHARS);
        const contract = source.match(/contract\s+(\w+)/)?.[1] ?? '';
        targets.push({ file, contract, source, changedFunctions: [], connectedFunctions: [] });
      } catch {
        // file deleted or unreadable at this ref; skip it
      }
    }
    return targets;
  }

  async function run(
    octokit: Context['octokit'],
    repoRef: { owner: string; repo: string },
    meta: RepoMeta,
    installationId: number,
    ev: IntakeEvent,
  ) {
    const decision = decideIntake(ev);
    app.log.info(`[redline] intake: ${decision.reason}`);
    if (!decision.shouldScan) return;

    const repositoryId = await upsertRepo(meta, installationId);

    const changedTargets = await fetchChangedTargets(octokit, repoRef, ev.headSha, decision.solidityFiles);
    const scan = await createScan(db, {
      repositoryId,
      trigger: decision.trigger,
      commitSha: ev.headSha,
      baseSha: ev.baseSha,
      prNumber: ev.prNumber,
      isIncremental: decision.isIncremental,
      changedTargets,
    });

    const check = await octokit.checks.create({
      ...repoRef,
      name: 'Redline — proof, not opinion',
      head_sha: ev.headSha,
      status: 'in_progress',
      started_at: new Date().toISOString(),
      output: {
        title: 'Attacking the change on a throwaway fork…',
        summary: 'Redline is trying to take the money. You are only blocked if it succeeds.',
      },
    });
    await setScanCheckRun(db, scan.id, check.data.id);

    await enqueueScan(queue, scan.id, decision.trigger === 'pull-request' ? 3 : 5);
    app.log.info(`[redline] queued scan ${scan.id} (check ${check.data.id})`);
  }

  app.on(['pull_request.opened', 'pull_request.synchronize', 'pull_request.reopened'], async (ctx) => {
    const pr = ctx.payload.pull_request;
    const repo = ctx.payload.repository;
    const installationId = ctx.payload.installation?.id;
    if (!installationId) return;
    const files = await ctx.octokit.paginate(ctx.octokit.pulls.listFiles, { ...ctx.repo(), pull_number: pr.number, per_page: 100 });
    await run(
      ctx.octokit,
      ctx.repo(),
      { ownerLogin: repo.owner.login, ownerId: repo.owner.id, repoId: repo.id, fullName: repo.full_name, defaultBranch: repo.default_branch },
      installationId,
      {
        action: 'pull_request',
        defaultBranch: repo.default_branch,
        ref: pr.head.ref,
        headSha: pr.head.sha,
        baseSha: pr.base.sha,
        prNumber: pr.number,
        changedFiles: files.map((f) => f.filename),
      },
    );
  });

  app.on('push', async (ctx) => {
    const p = ctx.payload;
    const repo = p.repository;
    const installationId = p.installation?.id;
    if (!installationId) return;
    const changedFiles = [...new Set(p.commits.flatMap((c) => [...c.added, ...c.modified]))];
    await run(
      ctx.octokit,
      ctx.repo(),
      { ownerLogin: repo.owner.login, ownerId: repo.owner.id, repoId: repo.id, fullName: repo.full_name, defaultBranch: repo.default_branch },
      installationId,
      {
        action: 'push',
        defaultBranch: repo.default_branch,
        ref: p.ref,
        headSha: p.after,
        baseSha: p.before === '0000000000000000000000000000000000000000' ? null : p.before,
        prNumber: null,
        changedFiles,
      },
    );
  });

  app.on('installation.created', async (ctx) => {
    app.log.info(`[redline] installed on ${ctx.payload.repositories?.length ?? 0} repo(s)`);
  });
}
