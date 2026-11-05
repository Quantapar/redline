import type { Probot, Context } from 'probot';
import { createDb, schema, createScan } from '@redline/db';
import { createScanQueue, enqueueScan } from '@redline/worker';
import { decideIntake, type IntakeEvent } from './scan-intake.js';

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
export function redlineApp(app: Probot): void {
  const { db } = createDb();
  const queue = createScanQueue();

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

    const scan = await createScan(db, {
      repositoryId,
      trigger: decision.trigger,
      commitSha: ev.headSha,
      baseSha: ev.baseSha,
      prNumber: ev.prNumber,
      isIncremental: decision.isIncremental,
      changedTargets: decision.solidityFiles.map((f) => ({ file: f, contract: '', changedFunctions: [], connectedFunctions: [] })),
    });

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
