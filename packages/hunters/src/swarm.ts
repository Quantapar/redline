import { WeaknessClass, BudgetGuard, type Candidate, type Policy } from '@redline/shared';
import type { RouterClient } from './router-client.js';
import { buildHuntMessages, type HuntTarget, type RecipeHint } from './prompts.js';
import { parseCandidates, estimateCostCents } from './hunter.js';
import { SWARM, TIER_ORDER, modelsByTier } from './models.js';

export interface SwarmInput {
  client: RouterClient;
  scanId: string;
  targets: HuntTarget[];
  policy: Policy;
  budget: BudgetGuard;
  /** stop hunting a target once it has this many candidates (default 1) */
  stopAfter?: number;
  privateMode?: boolean;
  onCandidate?: (c: Candidate) => void;
  onProgress?: (msg: string) => void;
  recipes?: RecipeHint[];
}

const ALL_CLASSES = WeaknessClass.options;

/**
 * Run the swarm: cheap models across all targets first, then escalate to stronger
 * tiers only on targets that produced nothing, always under the budget cap. The
 * moment a target has enough candidates, it is dropped from later tiers.
 */
export async function huntSwarm(input: SwarmInput): Promise<Candidate[]> {
  const stopAfter = input.stopAfter ?? 1;
  const found = new Map<string, Candidate[]>();
  const all: Candidate[] = [];

  for (const tier of TIER_ORDER) {
    const models = modelsByTier(tier);
    if (models.length === 0) continue;

    const remaining = input.targets.filter((t) => (found.get(t.contractName)?.length ?? 0) < stopAfter);
    if (remaining.length === 0) break;

    for (const target of remaining) {
      for (const model of models) {
        if ((found.get(target.contractName)?.length ?? 0) >= stopAfter) break;
        // Reserve the estimated cost BEFORE spending real money. If the reservation
        // does not fit under the cap, the budget is spent — stop the swarm. This makes
        // the cap hard: we never make a paid call we have not already charged for.
        if (!input.budget.charge(model.estCentsPerAttempt)) {
          input.onProgress?.(`budget cap reached; stopping swarm (spent ${input.budget.spentCents}c)`);
          return all;
        }
        input.onProgress?.(`[${tier}] ${model.id} -> ${target.contractName}`);
        let resp;
        try {
          resp = await input.client.chat({
            model: model.id,
            messages: buildHuntMessages(target, ALL_CLASSES, input.policy, input.recipes ?? []),
            jsonMode: true,
          });
        } catch (err) {
          input.onProgress?.(`${model.id} error: ${String(err).slice(0, 120)}`);
          continue; // the estimate was already reserved above
        }
        // Reconcile the estimate with the actual token-derived cost. If the real cost
        // overruns the cap, we have already overspent on THIS call — stop before making
        // any more paid calls.
        const overage = estimateCostCents(resp, model.estCentsPerAttempt) - model.estCentsPerAttempt;
        if (overage > 0 && !input.budget.charge(overage)) {
          input.onProgress?.(`budget cap exceeded by actual cost; stopping swarm (spent ${input.budget.spentCents}c)`);
          return all;
        }
        const cands = parseCandidates(resp, input.scanId, target.contractName).map((c) => ({
          ...c,
          targetContract: target.contractName,
        }));
        for (const c of cands) {
          const bucket = found.get(target.contractName) ?? [];
          bucket.push(c);
          found.set(target.contractName, bucket);
          all.push(c);
          input.onCandidate?.(c);
          if (bucket.length >= stopAfter) break;
        }
      }
    }
  }
  return all;
}

export { SWARM };
