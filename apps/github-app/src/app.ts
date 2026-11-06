import type { Probot, Context } from 'probot';
import { createDb, schema, createScan, and, eq, desc } from '@redline/db';
import { createScanQueue, enqueueScan, createRedis, scanQueueName } from '@redline/worker';
import { setScanCheckRun, getScanCompletionContext } from '@redline/db';
import { extractContractName } from '@redline/shared';
import { QueueEvents } from 'bullmq';
import {
  decideIntake, buildCheckOutput, buildVerdictComment, buildPendingComment, VERDICT_MARKER, type IntakeEvent,
} from './scan-intake.js';

type Database = ReturnType<typeof createDb>['db'];

/** A GitHub client that can resolve a check run (the slice we use). The arg type is
 *  `any` so the real Octokit (with its own precise params) and a test fake both fit. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Call = (args: any) => Promise<any>;
export interface CheckUpdater {
  checks: { update: Call };
  /** PR conversation comments (GitHub serves PR comments through the issues API). */
  issues?: { listComments: Call; createComment: Call; updateComment: Call; deleteComment?: Call };
}
export type CommentClient = Required<Pick<CheckUpdater, 'issues'>>;

interface GhComment {
  id: number;
  body?: string;
  user?: { type?: string };
  performed_via_github_app?: { id?: number } | null;
}

/** Read every comment on the PR (100 per page, bounded so a runaway PR can't loop us). */
async function listAllComments(octokit: CommentClient, ref: { owner: string; repo: string; issue_number: number }) {
  const all: GhComment[] = [];
  for (let page = 1; page <= 30; page++) {
    const { data } = await octokit.issues.listComments({ ...ref, per_page: 100, page });
    all.push(...(data as GhComment[]));
    if ((data as GhComment[]).length < 100) break;
  }
  return all;
}

/**
 * Create or edit Redline's single sticky comment on a PR, found by its hidden
 * marker AND authored by this exact GitHub App (performed_via_github_app.id), so
 * neither a human nor another bot quoting the marker can make Redline overwrite
 * their comment. Without an app id (tests, misconfig) it falls back to bot-only.
 * If two events raced and both created one, the extras are removed so a stale
 * "attacking…" comment can't linger.
 */
export async function upsertVerdictComment(
  octokit: CommentClient,
  ref: { owner: string; repo: string; issue_number: number },
  body: string,
  appId?: number,
): Promise<'created' | 'updated'> {
  const isMine = (c: GhComment) =>
    !!c.body?.includes(VERDICT_MARKER) &&
    (appId ? c.performed_via_github_app?.id === appId : c.user?.type === 'Bot');
  const mine = (await listAllComments(octokit, ref)).filter(isMine).sort((x, y) => x.id - y.id);

  if (mine.length > 0) {
    await octokit.issues.updateComment({ owner: ref.owner, repo: ref.repo, comment_id: mine[0]!.id, body });
    await removeDuplicates(octokit, ref, mine.slice(1));
    return 'updated';
  }
  await octokit.issues.createComment({ ...ref, body });
  // Close the list-then-create race: if a concurrent event also created one, keep
  // the oldest, give it this body, and delete the rest.
  const after = (await listAllComments(octokit, ref)).filter(isMine).sort((x, y) => x.id - y.id);
  if (after.length > 1) {
    await octokit.issues.updateComment({ owner: ref.owner, repo: ref.repo, comment_id: after[0]!.id, body });
    await removeDuplicates(octokit, ref, after.slice(1));
  }
  return 'created';
}

async function removeDuplicates(octokit: CommentClient, ref: { owner: string; repo: string }, extras: GhComment[]) {
  if (!octokit.issues.deleteComment) return;
  for (const c of extras) {
    await octokit.issues.deleteComment({ owner: ref.owner, repo: ref.repo, comment_id: c.id }).catch(() => {});
  }
}

/** True when no newer scan exists for the same repository + PR (a stale verdict must not win). */
async function isLatestScanForPr(db: Database, scan: { id: string; repositoryId: string; prNumber: number | null }) {
  if (!scan.prNumber) return true;
  const [latest] = await db
    .select({ id: schema.scans.id })
    .from(schema.scans)
    .where(and(eq(schema.scans.repositoryId, scan.repositoryId), eq(schema.scans.prNumber, scan.prNumber)))
    .orderBy(desc(schema.scans.createdAt))
    .limit(1);
  return !latest || latest.id === scan.id;
}

/**
 * Resolve a scan on GitHub once it finishes or fails: complete its check run and
 * write the verdict into the PR's sticky comment. On 'completed' the verdict comes
 * from the findings and the scan row (red -> failure; anything short of a full
 * referee verdict -> neutral); on 'failed' it is neutral — a scan that errored
 * proved nothing, so it must not fail the merge, but must not hang either.
 * The check run belongs to this scan's own commit, so it is always resolved. The
 * sticky comment is shared by the whole PR, so only the newest scan may write it.
 * The check and the comment are independent: a failure of one is reported through
 * `logError` and does not stop the other. Returns 'skipped' when nothing was
 * resolved. Exported so this wiring — not just the builders — is unit-tested.
 */
export async function resolveScanCheck(opts: {
  db: Database;
  scanId: string | undefined;
  authFor: (installationId: number) => Promise<CheckUpdater>;
  appUrl: string;
  outcome: 'completed' | 'failed';
  /** this GitHub App's id, so only Redline's own comment is ever edited */
  appId?: number;
  log?: (msg: string) => void;
  logError?: (msg: string) => void;
}): Promise<'resolved' | 'skipped'> {
  if (!opts.scanId) return 'skipped';
  const ctx = await getScanCompletionContext(opts.db, opts.scanId);
  if (!ctx || ctx.installationId == null) return 'skipped';
  const prNumber = ctx.scan.prNumber;
  const writeComment = !!prNumber && (await isLatestScanForPr(opts.db, ctx.scan));
  if (!ctx.checkRunId && !writeComment) {
    if (prNumber) opts.log?.(`[redline] scan ${opts.scanId} is stale for PR #${prNumber}; leaving the newer verdict alone`);
    return 'skipped';
  }
  const [owner, repo] = ctx.repoFullName.split('/');
  const octokit = await opts.authFor(ctx.installationId);
  const findings = ctx.findings as unknown as Parameters<typeof buildCheckOutput>[0];
  const facts = { status: ctx.scan.status, candidateCount: ctx.scan.candidateCount };
  const logError = opts.logError ?? opts.log;
  let did = false;

  if (ctx.checkRunId) {
    const out = opts.outcome === 'completed'
      ? buildCheckOutput(findings, opts.appUrl, facts)
      : {
          conclusion: 'neutral' as const,
          title: 'Redline scan could not complete',
          summary: 'The scan errored before reaching a verdict. This does not block the merge; re-run the scan to try again.',
        };
    try {
      await octokit.checks.update({
        owner: owner!, repo: repo!, check_run_id: ctx.checkRunId,
        status: 'completed', conclusion: out.conclusion, completed_at: new Date().toISOString(),
        output: { title: out.title, summary: out.summary },
      });
      did = true;
      opts.log?.(`[redline] resolved check ${ctx.checkRunId} for scan ${opts.scanId}: ${out.conclusion}`);
    } catch (err) {
      logError?.(`[redline] could not resolve check ${ctx.checkRunId} for scan ${opts.scanId}: ${String(err)}`);
    }
  }

  if (writeComment && octokit.issues) {
    const body = buildVerdictComment(findings, {
      appUrl: opts.appUrl, scanId: ctx.scan.id, commitSha: ctx.scan.commitSha, ...facts,
    }, opts.outcome);
    try {
      const r = await upsertVerdictComment(octokit as CommentClient, { owner: owner!, repo: repo!, issue_number: prNumber! }, body, opts.appId);
      did = true;
      opts.log?.(`[redline] ${r} verdict comment on PR #${prNumber} for scan ${opts.scanId}`);
    } catch (err) {
      logError?.(`[redline] could not write verdict comment on PR #${prNumber}: ${String(err)}`);
    }
  } else if (prNumber && !writeComment) {
    opts.log?.(`[redline] scan ${opts.scanId} is stale for PR #${prNumber}; resolved its check only`);
  }
  return did ? 'resolved' : 'skipped';
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
  /** this GitHub App's id (defaults to APP_ID / GITHUB_APP_ID) */
  appId?: number;
}

export function redlineApp(app: Probot, deps: RedlineAppDeps = {}): void {
  const db = deps.db ?? createDb().db;
  const queue = deps.queue ?? createScanQueue();
  // Read at startup, not import time: index.ts loads the root .env after imports run.
  const appId = deps.appId ?? (Number(process.env.APP_ID ?? process.env.GITHUB_APP_ID) || undefined);

  // When a scan completes (in the separate worker process), resolve its check.
  if (!deps.skipCompletion) {
  const events = new QueueEvents(scanQueueName(), { connection: createRedis() });
  const scanIdFor = async (jobId: string) => (await queue.getJob(jobId))?.data.scanId as string | undefined;
  const authFor = (installationId: number) => app.auth(installationId);
  events.on('completed', async ({ jobId }: { jobId: string }) => {
    try { await resolveScanCheck({ db, scanId: await scanIdFor(jobId), authFor, appUrl: APP_URL, outcome: 'completed', appId, log: (m) => app.log.info(m), logError: (m) => app.log.error(m) }); }
    catch (err) { app.log.error(`[redline] failed to resolve check: ${String(err)}`); }
  });
  // A scan job that errors fires 'failed', not 'completed'. Without this, the check
  // created as in_progress would hang forever and (under branch protection) block the
  // PR over an infrastructure hiccup. resolveScanCheck sets it to neutral: a scan that
  // errored proved nothing, so it must not fail the merge, but it must not hang either.
  events.on('failed', async ({ jobId }: { jobId: string }) => {
    try { await resolveScanCheck({ db, scanId: await scanIdFor(jobId), authFor, appUrl: APP_URL, outcome: 'failed', appId, log: (m) => app.log.info(m), logError: (m) => app.log.error(m) }); }
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
        const contract = extractContractName(source, '', file);
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

    // Post (or reset) the sticky verdict comment so the PR shows Redline is working.
    // Best-effort: a comment failure must never stop the scan itself.
    if (ev.prNumber) {
      try {
        await upsertVerdictComment(
          octokit as unknown as CommentClient,
          { ...repoRef, issue_number: ev.prNumber },
          buildPendingComment({ appUrl: APP_URL, scanId: scan.id, commitSha: ev.headSha }),
          appId,
        );
      } catch (err) {
        app.log.error(`[redline] could not post the pending comment on PR #${ev.prNumber}: ${String(err)}`);
      }
    }

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
