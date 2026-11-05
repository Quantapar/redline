import {
  pgTable, pgEnum, text, integer, bigint, boolean, timestamp, jsonb, uuid, index, primaryKey,
} from 'drizzle-orm/pg-core';

// ---- Enums (mirror @redline/shared) ----
export const severityEnum = pgEnum('severity', ['critical', 'high', 'medium', 'low', 'info']);
export const scanStatusEnum = pgEnum('scan_status', [
  'queued', 'preparing', 'static-analysis', 'hunting', 'verifying', 'judging', 'complete', 'failed', 'cancelled',
]);
export const scanTriggerEnum = pgEnum('scan_trigger', ['first-scan', 'push', 'pull-request', 'watch-mode', 'manual']);
export const refereeOutcomeEnum = pgEnum('referee_outcome', ['moved', 'did-not-move', 'error', 'build-failed']);
export const consensusEnum = pgEnum('consensus', ['reproduced', 'fragile', 'not-reproduced', 'inconclusive']);

// ---- Accounts & installations ----
export const accounts = pgTable('accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  githubLogin: text('github_login').notNull().unique(),
  githubId: bigint('github_id', { mode: 'number' }).notNull().unique(),
  email: text('email'),
  stripeCustomerId: text('stripe_customer_id'),
  planTier: text('plan_tier').notNull().default('free'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const installations = pgTable('installations', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: uuid('account_id').notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  githubInstallationId: bigint('github_installation_id', { mode: 'number' }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const repositories = pgTable('repositories', {
  id: uuid('id').defaultRandom().primaryKey(),
  installationId: uuid('installation_id').notNull().references(() => installations.id, { onDelete: 'cascade' }),
  githubRepoId: bigint('github_repo_id', { mode: 'number' }).notNull().unique(),
  fullName: text('full_name').notNull(),       // owner/repo
  defaultBranch: text('default_branch').notNull().default('main'),
  enabled: boolean('enabled').notNull().default(true),
  policyJson: jsonb('policy_json'),             // cached parsed .redline/policy.yml
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ repoIdx: index('repo_full_name_idx').on(t.fullName) }));

// ---- Scans ----
export const scans = pgTable('scans', {
  id: uuid('id').defaultRandom().primaryKey(),
  repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  trigger: scanTriggerEnum('trigger').notNull(),
  status: scanStatusEnum('status').notNull().default('queued'),
  commitSha: text('commit_sha').notNull(),
  baseSha: text('base_sha'),
  prNumber: integer('pr_number'),
  githubCheckRunId: bigint('github_check_run_id', { mode: 'number' }),
  isIncremental: boolean('is_incremental').notNull().default(true),
  changedTargets: jsonb('changed_targets').notNull().default([]),
  budgetCapCents: integer('budget_cap_cents').notNull().default(500),
  spentCents: integer('spent_cents').notNull().default(0),
  candidateCount: integer('candidate_count').notNull().default(0),
  redFindingCount: integer('red_finding_count').notNull().default(0),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ scanRepoIdx: index('scan_repo_idx').on(t.repositoryId, t.createdAt) }));

// ---- Candidates (hypotheses) ----
export const candidates = pgTable('candidates', {
  id: uuid('id').defaultRandom().primaryKey(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  hunterModel: text('hunter_model').notNull(),
  weaknessClass: text('weakness_class').notNull(),
  targetContract: text('target_contract').notNull(),
  contractSource: text('contract_source'),
  targetFunction: text('target_function'),
  summary: text('summary').notNull(),
  forgeTest: text('forge_test').notNull(),
  steps: jsonb('steps').notNull().default([]),
  claimedValueWei: text('claimed_value_wei').notNull().default('0'),
  usedShortcuts: boolean('used_shortcuts').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ candScanIdx: index('cand_scan_idx').on(t.scanId) }));

// ---- Referee runs (facts) ----
export const refereeRuns = pgTable('referee_runs', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  refereeName: text('referee_name').notNull(),
  provider: text('provider').notNull(),
  forkBlock: bigint('fork_block', { mode: 'number' }).notNull(),
  outcome: refereeOutcomeEnum('outcome').notNull(),
  thresholdWei: text('threshold_wei').notNull(),
  deltas: jsonb('deltas').notNull().default([]),
  traceRef: text('trace_ref'),
  logsRef: text('logs_ref'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  error: text('error'),
}, (t) => ({ refCandIdx: index('ref_cand_idx').on(t.candidateId) }));

// ---- Findings (verdicts; red only when reproduced) ----
export const findings = pgTable('findings', {
  id: uuid('id').defaultRandom().primaryKey(),
  scanId: uuid('scan_id').notNull().references(() => scans.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  weaknessClass: text('weakness_class').notNull(),
  title: text('title').notNull(),
  plainSentence: text('plain_sentence').notNull(),
  consensus: consensusEnum('consensus').notNull(),
  isRed: boolean('is_red').notNull().default(false),
  agreementCount: integer('agreement_count').notNull().default(0),
  refereeCount: integer('referee_count').notNull().default(0),
  severity: severityEnum('severity'),
  judgment: jsonb('judgment'),
  regressionTestRef: text('regression_test_ref'),
  replayRef: text('replay_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ findScanIdx: index('find_scan_idx').on(t.scanId) }));

// ---- Fixes ----
export const fixes = pgTable('fixes', {
  id: uuid('id').defaultRandom().primaryKey(),
  findingId: uuid('finding_id').notNull().references(() => findings.id, { onDelete: 'cascade' }),
  branch: text('branch').notNull(),
  prNumber: integer('pr_number'),
  diff: text('diff').notNull(),
  explanation: text('explanation').notNull(),
  regressionTestRef: text('regression_test_ref').notNull(),
  reattackPassed: boolean('reattack_passed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---- Regression tests (the forever-tests) ----
export const regressionTests = pgTable('regression_tests', {
  id: uuid('id').defaultRandom().primaryKey(),
  repositoryId: uuid('repository_id').notNull().references(() => repositories.id, { onDelete: 'cascade' }),
  findingId: uuid('finding_id').references(() => findings.id, { onDelete: 'set null' }),
  weaknessClass: text('weakness_class').notNull(),
  forgeTest: text('forge_test').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ regRepoIdx: index('reg_repo_idx').on(t.repositoryId) }));

// ---- Shared recipe library (public; never holds private code) ----
export const recipes = pgTable('recipes', {
  id: uuid('id').defaultRandom().primaryKey(),
  weaknessClass: text('weakness_class').notNull(),
  chain: text('chain').notNull(),
  severity: severityEnum('severity').notNull(),
  labels: jsonb('labels').notNull().default([]),
  title: text('title').notNull(),
  template: text('template').notNull(),
  ownerWallet: text('owner_wallet'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  source: text('source').notNull().default('seed'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ recipeClassIdx: index('recipe_class_idx').on(t.weaknessClass) }));
