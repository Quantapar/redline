import {
  BudgetGuard, WeaknessClass, Policy, ExploitPlan, extractContractName, type Candidate, type Finding,
} from '@redline/shared';
import {
  type Database, setScanStatus, getScan, getRepository, insertCandidate, insertRefereeRuns,
  insertFinding, insertRegressionTest, listActiveRegressionTests, listRecipes, encrypt, decrypt, schema,
} from '@redline/db';
import { runCouncil, prepareRefereeProject, type RefereeEngine, type CouncilDispatch } from '@redline/engine';
import { huntSwarm, type RouterClient, type HuntTarget } from '@redline/hunters';
import { arkivReadEnabled, listRecipes as listArkivRecipes } from '@redline/arkiv';
import { judge } from './judge.js';
import { noopEmit, type EmitFn } from './events.js';
import { publishFindingProof, withTimeout } from './public-proof.js';

export interface PrepareResult {
  targets: HuntTarget[];
  policy: Policy;
}

export interface PipelineDeps {
  db: Database;
  client: RouterClient;
  engine: RefereeEngine;
  /** Resolve the scan into hunt targets + policy (clone/detect/diff/static-analysis). */
  prepare: (scan: typeof schema.scans.$inferSelect) => Promise<PrepareResult>;
  council?: { providers: string[]; blocks: number[]; thresholdWei: string; forkUrlFor?: (p: string) => string | undefined };
  emit?: EmitFn;
}

// Each referee forks from a configured archive RPC. Set ARCHIVE_RPC_URLS to a
// comma-separated list of independent providers for true independence; with one
// URL the rooms share an upstream (distinct moments, same source).
function forkUrls(): (string | undefined)[] {
  const list = (process.env.ARCHIVE_RPC_URLS ?? process.env.ARCHIVE_RPC_URL ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);
  return list.length ? list : [undefined];
}

const DEFAULT_COUNCIL_DISPATCH = {
  providers: ['room-a', 'room-b', 'room-c'],
  blocks: [0, 0, 0],
  thresholdWei: '1000000000000000', // 0.001 ETH
  forkUrlFor: (provider: string) => {
    const urls = forkUrls();
    const idx = ['room-a', 'room-b', 'room-c'].indexOf(provider);
    return urls[idx % urls.length] ?? urls[0];
  },
};

export interface ScanResult {
  scanId: string;
  candidateCount: number;
  findings: Finding[];
  redCount: number;
}

/**
 * Run one scan end to end: prepare -> hunt (swarm) -> verify (council) -> judge,
 * persisting candidates, referee runs, and findings, and emitting live events.
 */
export async function runScan(deps: PipelineDeps, scanId: string): Promise<ScanResult> {
  const { db, emit = noopEmit } = deps;
  const now = () => new Date().toISOString();
  const setStatus = async (status: Parameters<typeof setScanStatus>[2], patch = {}) => {
    await setScanStatus(db, scanId, status, patch);
    emit({ type: 'status', scanId, status, at: now() });
  };

  const scan = await getScan(db, scanId);
  if (!scan) throw new Error(`scan ${scanId} not found`);

  // Re-read the scan's status to see if it was cancelled mid-run.
  const isCancelled = async (): Promise<boolean> => {
    const cur = await getScan(db, scanId);
    return cur?.status === 'cancelled';
  };
  const findings: Finding[] = [];
  let redCount = 0;
  let candidates: Candidate[] = [];
  const stopCancelled = async (): Promise<ScanResult> => {
    await setScanStatus(db, scanId, 'cancelled', { finishedAt: new Date(), candidateCount: candidates.length });
    emit({ type: 'done', scanId, redCount, at: now() });
    return { scanId, candidateCount: candidates.length, findings, redCount };
  };

  await setStatus('preparing', { startedAt: new Date() });
  const { targets, policy: preparedPolicy } = await deps.prepare(scan);
  // Apply the repository's own .redline/policy.yml (cached as policyJson) when it has
  // a valid one; otherwise fall back to what prepare resolved. This is what makes the
  // per-repo plain-English rules actually guide the hunt and the judge, not just the CLI.
  const repo = await getRepository(db, scan.repositoryId);
  const repoPolicy = repo?.policyJson ? Policy.safeParse(repo.policyJson) : null;
  const policy = repoPolicy?.success ? repoPolicy.data : preparedPolicy;
  const sourceByContract = new Map(targets.map((t) => [t.contractName, t.source]));
  emit({ type: 'log', scanId, message: `prepared ${targets.length} target(s)`, at: now() });

  // Build a throwaway Foundry project (changed contracts + forge-std) the real
  // referee compiles the stripped attack against. Cheap once forge-std is cached;
  // the simulation engine ignores it. A failure here must not sink the scan. It is
  // built before the hunt because the council also runs during the hunt (below).
  const budget = new BudgetGuard(scan.budgetCapCents, scan.spentCents);
  const refProject = await prepareRefereeProject(
    targets.filter((t) => t.source).map((t) => ({ file: t.filePath, source: t.source })),
  ).catch(() => null);
  try {
  const baseDispatch = deps.council ?? DEFAULT_COUNCIL_DISPATCH;
  const dispatch: CouncilDispatch = refProject
    ? { ...baseDispatch, projectDir: refProject.projectDir }
    : baseDispatch;

  // ---- Hunt ----
  await setStatus('hunting');
  // The council runs on each candidate as soon as it is proposed, so the swarm
  // escalates to a stronger model when the referees do not see money move, instead
  // of stopping at the first guess. The verdicts are kept and reused by Verify.
  const councilByCandidate = new Map<string, Awaited<ReturnType<typeof runCouncil>>>();
  const verifyDuringHunt = async (c: Candidate): Promise<boolean> => {
    const council = await runCouncil(deps.engine, c, dispatch);
    councilByCandidate.set(c.id, council);
    const { result } = council;
    emit({
      type: 'log', scanId, at: now(),
      message: result.isRed
        ? `referees reproduced ${c.hunterModel}'s ${c.weaknessClass} attack (${result.agreementCount}/${result.validCount})`
        : `referees did not see money move for ${c.hunterModel}'s ${c.weaknessClass} attack; escalating`,
    });
    return result.isRed;
  };
  // The recipe library is read from Arkiv, the public database it is published to, so
  // every scan hunts with the latest recipes anyone has published. Postgres is the
  // fallback when Arkiv is off or unreachable.
  const recipes = await loadRecipes(db, (m) => emit({ type: 'log', scanId, message: m, at: now() }));
  candidates = await huntSwarm({
    client: deps.client,
    scanId,
    targets,
    policy,
    budget,
    recipes,
    onProgress: (message) => emit({ type: 'log', scanId, message, at: now() }),
    onCandidate: (c) =>
      emit({ type: 'candidate', scanId, contract: c.targetContract, weaknessClass: c.weaknessClass, model: c.hunterModel, at: now() }),
    verify: verifyDuringHunt,
  });

  // Persist candidates, keep db ids.
  const dbCandidates: { domain: Candidate; dbId: string; isRegression?: boolean }[] = [];
  for (const c of candidates) {
    const row = await insertCandidate(db, {
      scanId,
      hunterModel: c.hunterModel,
      modelReceipt: c.modelReceipt ?? null,
      weaknessClass: c.weaknessClass,
      targetContract: c.targetContract,
      contractSource: sourceByContract.get(c.targetContract) ?? null,
      targetFunction: c.targetFunction,
      summary: c.summary,
      forgeTest: encrypt(c.forgeTest), // encrypted at rest
      plan: (c.plan ?? null) as object | null,
      steps: c.steps as object,
      claimedValueWei: c.claimedValueWei,
      usedShortcuts: c.usedShortcuts,
    });
    dbCandidates.push({ domain: c, dbId: row.id });
  }

  // Re-run the forever-tests: every attack saved from a past red finding on this
  // repo, verified again so a fixed bug cannot quietly come back.
  const regTests = await listActiveRegressionTests(db, scan.repositoryId);
  if (regTests.length) emit({ type: 'log', scanId, message: `re-running ${regTests.length} forever-test(s)`, at: now() });
  for (const rt of regTests) {
    const forgeTest = decrypt(rt.forgeTest);
    const wc = WeaknessClass.safeParse(rt.weaknessClass);
    const contract = rt.targetContract ?? extractContractName(forgeTest, 'the contract');
    const regPlan = ExploitPlan.safeParse(rt.plan);
    const regCand: Candidate = {
      id: `reg_${rt.id}`, scanId, hunterModel: 'forever-test', modelReceipt: null,
      weaknessClass: wc.success ? wc.data : 'other', targetContract: contract, targetFunction: null,
      summary: 'A saved attack from a past finding, re-run to catch a regression.',
      forgeTest, plan: regPlan.success ? regPlan.data : null, steps: [], claimedValueWei: '0', usedShortcuts: false, createdAt: now(),
    };
    const row = await insertCandidate(db, {
      scanId, hunterModel: 'forever-test', modelReceipt: null, weaknessClass: regCand.weaknessClass,
      targetContract: contract, contractSource: null, targetFunction: null, summary: regCand.summary,
      forgeTest: encrypt(forgeTest), plan: (regCand.plan ?? null) as object | null, steps: [], claimedValueWei: '0', usedShortcuts: false,
    });
    dbCandidates.push({ domain: regCand, dbId: row.id, isRegression: true });
  }

  if (await isCancelled()) return await stopCancelled();
  await setScanStatus(db, scanId, 'hunting', { candidateCount: candidates.length, spentCents: budget.spentCents });

  // ---- Verify (council) ----
  await setStatus('verifying');
  const priorKeys = new Set<string>();

  for (const { domain: c, dbId, isRegression } of dbCandidates) {
    try {
    const { runs, result } = councilByCandidate.get(c.id) ?? (await runCouncil(deps.engine, c, dispatch));
    for (const r of runs) {
      emit({ type: 'referee', scanId, candidate: c.targetContract, referee: r.refereeName, outcome: r.outcome, at: now() });
    }
    await insertRefereeRuns(
      db,
      runs.map((r) => ({
        candidateId: dbId,
        refereeName: r.refereeName,
        provider: r.provider,
        forkBlock: r.forkBlock,
        outcome: r.outcome,
        thresholdWei: r.thresholdWei,
        deltas: r.deltas as object,
        traceRef: r.traceRef,
        logsRef: r.logsRef,
        startedAt: new Date(r.startedAt),
        finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
        error: r.error,
      })),
    );

    const isRed = result.isRed;
    const judgment = isRed ? judge({ candidate: c, policy, priorFindingKeys: priorKeys }) : null;

    const findingRow = await insertFinding(db, {
      scanId,
      candidateId: dbId,
      weaknessClass: c.weaknessClass,
      title: isRegression ? `Regression: ${c.weaknessClass} in ${c.targetContract}` : `${c.weaknessClass} in ${c.targetContract}`,
      plainSentence: c.summary,
      consensus: result.consensus,
      isRed,
      agreementCount: result.agreementCount,
      refereeCount: result.validCount,
      severity: judgment?.severity ?? null,
      judgment: judgment as object | null,
      regressionTestRef: null,
      replayRef: runs.find((r) => r.traceRef)?.traceRef ?? null,
    });

    emit({ type: 'finding', scanId, findingId: findingRow.id, isRed, consensus: result.consensus, title: findingRow.title, at: now() });

    if (isRed) {
      redCount += 1;
      // Publish the council's proof (votes and receipts, never the attack) to Arkiv,
      // where anyone can query it. Best-effort: a failed publish never fails the scan.
      try {
        const ref = await publishFindingProof(db, findingRow.id);
        if (ref) emit({ type: 'log', scanId, message: `public proof published to Arkiv: ${ref.explorerUrl}`, at: now() });
      } catch (err) {
        emit({ type: 'log', scanId, message: `arkiv publish skipped: ${String(err).slice(0, 120)}`, at: now() });
      }
      priorKeys.add(`${c.weaknessClass}:${c.targetContract}:${c.targetFunction ?? ''}`);
      // Save the attack as a forever-test — but only on first discovery, never when a
      // forever-test re-reproduces (it is already saved), so they don't accumulate.
      if (!isRegression) await insertRegressionTest(db, {
        repositoryId: scan.repositoryId,
        findingId: findingRow.id,
        weaknessClass: c.weaknessClass,
        targetContract: c.targetContract,
        forgeTest: encrypt(c.forgeTest), // the saved attack is encrypted at rest
        plan: (c.plan ?? null) as object | null,
        active: true,
      });
    }

    findings.push({
      id: findingRow.id,
      scanId,
      candidateId: dbId,
      weaknessClass: c.weaknessClass,
      title: findingRow.title,
      plainSentence: c.summary,
      consensus: result.consensus,
      isRed,
      status: findingRow.status,
      refereeRunIds: [],
      agreementCount: result.agreementCount,
      refereeCount: result.validCount,
      regressionTestRef: null,
      replayRef: findingRow.replayRef,
      judgment,
      createdAt: findingRow.createdAt.toISOString(),
    });
    } catch (err) {
      // One bad candidate must not sink the whole scan; record and move on.
      emit({ type: 'log', scanId, message: `candidate verification failed: ${String(err).slice(0, 160)}`, at: now() });
    }
  }

  } finally {
    // The prepared project is throwaway; always drop it, even on an early throw.
    if (refProject) await refProject.cleanup().catch(() => undefined);
  }

  // ---- Judge + complete ----
  if (await isCancelled()) return await stopCancelled();
  await setStatus('judging');
  await setScanStatus(db, scanId, 'complete', {
    finishedAt: new Date(),
    redFindingCount: redCount,
    candidateCount: candidates.length,
    spentCents: budget.spentCents,
  });
  emit({ type: 'done', scanId, redCount, at: now() });

  return { scanId, candidateCount: candidates.length, findings, redCount };
}

type RecipeHint = { weaknessClass: string; title: string; template: string };

async function loadRecipes(db: Database, log: (m: string) => void): Promise<RecipeHint[]> {
  if (arkivReadEnabled()) {
    try {
      const rows = await withTimeout(listArkivRecipes(), 6000);
      if (rows.length) {
        log(`loaded ${rows.length} recipe(s) from the Arkiv library`);
        return rows.map((r) => ({ weaknessClass: r.weaknessClass, title: r.title, template: r.template }));
      }
    } catch (err) {
      log(`arkiv library unreachable, using the local copy: ${String(err).slice(0, 100)}`);
    }
  }
  return (await listRecipes(db)).map((r) => ({ weaknessClass: r.weaknessClass, title: r.title, template: r.template }));
}
