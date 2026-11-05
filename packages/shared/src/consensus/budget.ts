/**
 * Hard spend cap per scan. Cheap models run first; the council runs only on
 * candidates. Every model call must pass through here so a scan can never
 * overrun its cap.
 */
export class BudgetGuard {
  private spent = 0;
  constructor(
    public readonly capCents: number,
    initialSpentCents = 0,
  ) {
    if (capCents <= 0) throw new Error('budget cap must be positive');
    this.spent = initialSpentCents;
  }
  get spentCents(): number {
    return this.spent;
  }
  get remainingCents(): number {
    return Math.max(0, this.capCents - this.spent);
  }
  canAfford(cents: number): boolean {
    return this.spent + cents <= this.capCents;
  }
  /** Charge the budget. Returns false (and does not charge) if it would overrun. */
  charge(cents: number): boolean {
    if (cents < 0) throw new Error('charge must be non-negative');
    if (!this.canAfford(cents)) return false;
    this.spent += cents;
    return true;
  }
}
