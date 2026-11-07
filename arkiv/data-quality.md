# Data quality

- **No secrets, no customer code.** Recipes are generic templates. Proofs hold votes and balance
  deltas, never the attack test. The pipeline that writes proofs is the same code that serves the
  public `/api/findings/:id/proof` route, which has always excluded the runnable attack.
- **Idempotent.** Every write is keyed on a Redline id in an indexed column; re-running the
  publisher creates nothing new.
- **Bounded.** Strings are clipped to Arkiv's 128-byte limit; large text lives in `bytes`.
- **Time-scoped.** 90-day lifetimes, extended only on re-publish.
