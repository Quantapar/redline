# Friction

Honest notes from integrating `@arkiv-network/sdk` 1.0.1 in about two hours during ETHGlobal
Mumbai.

**What was smooth**
- The README is excellent. Schema definition, create, query and the "footgun" notes were enough
  to write the whole integration without opening the docs site.
- Typed schemas catching `where` on a non-indexed column at compile time is the right design.
- Idempotent writes were easy to build on top: query by an indexed id, then create.

**What cost time**
- **`MAX_STRING_BYTES = 128`** is not mentioned next to `str()` in the README. We found it by
  grepping the dist. Recipe templates and titles had to move to `bytes`, and we clip every `str`
  defensively. A one-line note at `str()` would save everyone the hunt.
- **TS4023 on exported schemas.** `export const Recipes = defineSchema(...)` fails under
  `declaration: true` because `ColumnProperties` is not exported from the package. Workaround:
  do not export the schema objects, or turn declarations off. Exporting the type would fix it.
- **Faucet needs a browser wallet.** There is no address field or API; you connect a wallet. For
  a backend writer with a generated key that means importing a throwaway key into a browser
  extension first. An address-only claim (with a captcha) would unblock server-side projects.
- **Explorer entity URL** is not documented. We guessed `/entity/<key>`; please confirm or expose
  it on the chain object (`blockExplorers.default.url` plus a path).
- **Public RPC warning** prints on every client construction. Fine once, noisy from a worker that
  creates a client per scan.

**Nice to have**
- `select().from(Schema)` with no `where` works, but a `count()` example in the README would help
  dashboards.
- A `getEntityOrNull` that does not throw `NoEntityFoundError`.
