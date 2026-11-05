/**
 * The swarm roster. Different models are good at different things, so we spread
 * across providers. Cheap, fast models go first; strong models come in only
 * where the cheap ones get stuck. Model ids match the 0G router catalog.
 */
export type Tier = 'cheap' | 'strong' | 'reasoning';

export interface SwarmModel {
  id: string;
  tier: Tier;
  /** rough cost estimate in cents per candidate attempt, for the budget guard */
  estCentsPerAttempt: number;
}

export const SWARM: SwarmModel[] = [
  // cheap & fast — run first, wide coverage
  { id: 'qwen3-coder-flash', tier: 'cheap', estCentsPerAttempt: 1 },
  { id: 'glm-5.3-flash', tier: 'cheap', estCentsPerAttempt: 1 },
  { id: 'deepseek-v4-flash', tier: 'cheap', estCentsPerAttempt: 1 },
  // strong open coders — escalate where cheap ones stall
  { id: 'deepseek-v4-pro', tier: 'strong', estCentsPerAttempt: 5 },
  { id: 'kimi-k2.7-code', tier: 'strong', estCentsPerAttempt: 5 },
  { id: 'glm-5.3', tier: 'strong', estCentsPerAttempt: 4 },
  // deep reasoning — last resort on the hardest targets
  { id: 'qwen3.5-397b-a17b', tier: 'reasoning', estCentsPerAttempt: 10 },
];

/** Models reserved for explaining and writing fixes (mainstream, rarely refuse here). */
export const FIXER_MODELS = ['gpt-5.5', 'gemini-3.5-flash', 'gpt-5.4'] as const;

export function modelsByTier(tier: Tier): SwarmModel[] {
  return SWARM.filter((m) => m.tier === tier);
}

export const TIER_ORDER: Tier[] = ['cheap', 'strong', 'reasoning'];
