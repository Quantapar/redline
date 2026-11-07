/**
 * Publish Redline's public data to Arkiv (Rabdi testnet). Re-runnable: every write is
 * idempotent on the Redline id, so running it twice adds nothing.
 *
 *   - every recipe in the local library  -> `redline.recipes`
 *   - every red (reproduced) finding's public proof -> `redline.proofs`
 *
 *   pnpm arkiv:publish
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createDb, listRecipes, schema, eq } from '@redline/db';
import { arkivWriteConfigured, publishRecipe, writerAddress } from '@redline/arkiv';
import { publishFindingProof } from '@redline/worker';

const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(here, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && m[1] && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

if (!arkivWriteConfigured()) {
  console.error('ARKIV_PRIVATE_KEY is not set; nothing to do.');
  process.exit(1);
}
const { db, close } = createDb(process.env.DATABASE_URL ?? 'postgresql://manu@localhost:5432/redline');
console.log(`writer ${writerAddress()}`);

const recipes = await listRecipes(db);
for (const r of recipes) {
  const ref = await publishRecipe({
    id: r.id, weaknessClass: r.weaknessClass, chain: r.chain, severity: r.severity,
    labels: (r.labels as string[]) ?? [], title: r.title, template: r.template, source: r.source,
  });
  console.log(`recipe  ${r.weaknessClass.padEnd(18)} ${ref.entityKey} ${ref.txHash !== '0x' ? 'created' : 'exists'}`);
}

const red = await db.select({ id: schema.findings.id }).from(schema.findings).where(eq(schema.findings.isRed, true));
for (const f of red) {
  const ref = await publishFindingProof(db, f.id);
  if (ref) console.log(`proof   ${f.id} ${ref.entityKey} ${ref.txHash !== '0x' ? 'created' : 'exists'}`);
}

console.log(`done: ${recipes.length} recipe(s), ${red.length} proof(s)`);
await close();
