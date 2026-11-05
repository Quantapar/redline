import { describe, it, expect } from 'vitest';
import { SWARM, FIXER_MODELS, modelsByTier, TIER_ORDER } from '../src/models.js';

describe('swarm roster', () => {
  it('has cheap models before strong before reasoning in the tier order', () => {
    expect(TIER_ORDER).toEqual(['cheap', 'strong', 'reasoning']);
  });
  it('every model has a known tier and a positive cost estimate', () => {
    for (const m of SWARM) {
      expect(TIER_ORDER).toContain(m.tier);
      expect(m.estCentsPerAttempt).toBeGreaterThan(0);
      expect(m.id.length).toBeGreaterThan(0);
    }
  });
  it('cheap models cost no more than strong, strong no more than reasoning', () => {
    const maxOf = (t: 'cheap' | 'strong' | 'reasoning') => Math.max(...modelsByTier(t).map((m) => m.estCentsPerAttempt));
    expect(maxOf('cheap')).toBeLessThanOrEqual(maxOf('strong'));
    expect(maxOf('strong')).toBeLessThanOrEqual(maxOf('reasoning'));
  });
  it('has at least one model in every tier', () => {
    for (const t of TIER_ORDER) expect(modelsByTier(t).length).toBeGreaterThan(0);
  });
  it('keeps mainstream (non-refusing) models for fixing, distinct from the hunters', () => {
    expect(FIXER_MODELS.length).toBeGreaterThan(0);
    // fixer models must not include any uncensored hunter id
    const hunterIds = new Set(SWARM.map((m) => m.id));
    for (const f of FIXER_MODELS) expect(hunterIds.has(f)).toBe(false);
  });
});
