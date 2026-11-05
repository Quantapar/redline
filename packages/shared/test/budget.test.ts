import { describe, it, expect } from 'vitest';
import { BudgetGuard } from '../src/consensus/budget.js';

describe('BudgetGuard — hard spend cap', () => {
  it('charges within cap and reports remaining', () => {
    const g = new BudgetGuard(1000);
    expect(g.charge(400)).toBe(true);
    expect(g.spentCents).toBe(400);
    expect(g.remainingCents).toBe(600);
  });
  it('refuses a charge that would overrun and does not mutate', () => {
    const g = new BudgetGuard(1000);
    g.charge(900);
    expect(g.charge(200)).toBe(false);
    expect(g.spentCents).toBe(900);
  });
  it('allows a charge that exactly hits the cap', () => {
    const g = new BudgetGuard(1000);
    expect(g.charge(1000)).toBe(true);
    expect(g.canAfford(1)).toBe(false);
  });
  it('rejects a non-positive cap', () => {
    expect(() => new BudgetGuard(0)).toThrow();
  });
  it('never overruns across random charge sequences', () => {
    for (let trial = 0; trial < 500; trial++) {
      const cap = 100 + Math.floor(Math.random() * 5000);
      const g = new BudgetGuard(cap);
      for (let i = 0; i < 50; i++) g.charge(Math.floor(Math.random() * 400));
      expect(g.spentCents).toBeLessThanOrEqual(cap);
    }
  });
});
