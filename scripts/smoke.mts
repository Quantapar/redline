// One-command health check of Redline's external dependencies.
// Usage: pnpm exec tsx scripts/smoke.mts   (loads .env)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(join(here, '..', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && m[1] && !(m[1] in process.env)) process.env[m[1]] = m[2];
}

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = async (name: string, fn: () => Promise<string>) => {
  try { results.push({ name, ok: true, detail: await fn() }); }
  catch (e) { results.push({ name, ok: false, detail: String(e).slice(0, 120) }); }
};

await check('Postgres', async () => {
  const { createDb, sql } = await import('../packages/db/src/index.ts');
  const h = createDb(process.env.DATABASE_URL ?? 'postgresql://manu@localhost:5432/redline');
  await h.db.execute(sql`select 1`); await h.close(); return 'reachable';
});

await check('Redis', async () => {
  const { createRedis } = await import('../packages/worker/src/connection.ts');
  const r = createRedis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  const pong = await r.ping(); r.disconnect(); return pong;
});

await check('0G router', async () => {
  if (!process.env.OG_ROUTER_API_KEY) return 'skipped (no key)';
  const res = await fetch((process.env.OG_ROUTER_BASE_URL ?? 'https://router-api.0g.ai/v1') + '/models', {
    headers: { authorization: `Bearer ${process.env.OG_ROUTER_API_KEY}` },
  });
  const j = await res.json() as { data?: unknown[] };
  return `${j.data?.length ?? 0} models`;
});

await check('Archive RPC', async () => {
  if (!process.env.ARCHIVE_RPC_URL) return 'skipped (no url)';
  const res = await fetch(process.env.ARCHIVE_RPC_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_blockNumber' }),
  });
  const j = await res.json() as { result?: string };
  return `block ${j.result ? parseInt(j.result, 16) : '?'}`;
});

const { detectFoundry } = await import('../packages/engine/src/index.ts');
await check('Foundry', async () => {
  const f = await detectFoundry();
  return f.available ? (f.forgeVersion ?? 'installed') : 'not installed (simulation used)';
});

let allOk = true;
console.log('\nRedline dependency smoke:\n');
for (const r of results) {
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(14)} ${r.detail}`);
  if (!r.ok) allOk = false;
}
console.log('');
process.exit(allOk ? 0 : 1);
