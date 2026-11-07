/**
 * Redline on Arkiv.
 *
 * Two public, queryable collections live on the Arkiv testnet (Rabdi):
 *   - `redline.recipes`: the shared attack-recipe library the swarm reads on every scan.
 *   - `redline.proofs`:  the council's public proof of every reproduced theft (votes and
 *     balance receipts). Never the runnable attack.
 *
 * Writes need ARKIV_PRIVATE_KEY (a funded Rabdi wallet). Reads need nothing; an optional
 * ARKIV_ACCESS_KEY lifts the public RPC's rate limit. Unset = everything stays local.
 */
import { createPublicClient, createWalletClient, ExpirationTime } from '@arkiv-network/sdk';
import { rabdi } from '@arkiv-network/sdk/chains';
import { and, asc, eq } from '@arkiv-network/sdk/query';
import { bytes, defineSchema, str } from '@arkiv-network/sdk/schema';
import { http, hexToString, isHex, stringToBytes, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const ARKIV_EXPLORER = 'https://rabdi.explorer.arkiv.network';

/** Arkiv strings are capped at 128 bytes; longer text goes in a bytes column. */
const STR_MAX = 120;
const clip = (s: string) => (Buffer.byteLength(s) <= STR_MAX ? s : Buffer.from(s).subarray(0, STR_MAX).toString().replace(/�$/, ''));

const Recipes = defineSchema('redline.recipes', {
  redlineId: str().indexed(),
  weaknessClass: str().indexed(),
  severity: str().indexed(),
  source: str().indexed(),
  chain: str(),
  title: str(),
  labels: bytes(),
  template: bytes(),
});

const Proofs = defineSchema('redline.proofs', {
  findingId: str().indexed(),
  verdict: str().indexed(),
  weaknessClass: str().indexed(),
  severity: str(),
  agreement: str(),
  title: str(),
  proof: bytes(),
});

export interface ArkivRecipe {
  id: string;
  weaknessClass: string;
  chain: string;
  severity: string;
  labels: string[];
  title: string;
  template: string;
  source: string;
}

export interface ArkivRef {
  entityKey: Hex;
  txHash: Hex;
  explorerUrl: string;
}

export function arkivWriteConfigured(): boolean {
  const k = process.env.ARKIV_PRIVATE_KEY;
  return !!k && isHex(k) && k.length === 66;
}

/**
 * Reads are public and need no key, but they are a network call, so they are only
 * made when Arkiv is switched on: a writer key, an access key, or ARKIV_READ=1
 * (for a read-only deployment such as the dashboard).
 */
export function arkivReadEnabled(): boolean {
  return arkivWriteConfigured() || !!process.env.ARKIV_ACCESS_KEY || process.env.ARKIV_READ === '1';
}

export function entityUrl(entityKey: string): string {
  return `${ARKIV_EXPLORER}/entity/${entityKey}`;
}

export function txUrl(txHash: string): string {
  return `${ARKIV_EXPLORER}/tx/${txHash}`;
}

function chain() {
  return rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? '' });
}

export function publicClient() {
  return createPublicClient({ chain: chain(), transport: http() });
}

export function walletClient() {
  const key = process.env.ARKIV_PRIVATE_KEY;
  if (!key || !isHex(key)) throw new Error('ARKIV_PRIVATE_KEY is not set to a hex private key');
  const account = privateKeyToAccount(key);
  return { client: createWalletClient({ chain: chain(), transport: http(), account }), account };
}

export function writerAddress(): string | null {
  const key = process.env.ARKIV_PRIVATE_KEY;
  if (!key || !isHex(key)) return null;
  return privateKeyToAccount(key).address;
}

/** Recipes live for 90 days (the testnet's max lifetime); re-publishing extends them. */
const RECIPE_LIFETIME = ExpirationTime.fromDays(90);
const PROOF_LIFETIME = ExpirationTime.fromDays(90);

/** Publish one recipe. Idempotent on `redlineId`: an existing entity is returned, not duplicated. */
export async function publishRecipe(r: ArkivRecipe): Promise<ArkivRef> {
  const existing = await findRecipeByRedlineId(r.id);
  if (existing) return existing;
  const { client } = walletClient();
  const { entityKey, txHash } = await client.createEntity(
    Recipes,
    {
      redlineId: r.id,
      weaknessClass: clip(r.weaknessClass),
      severity: clip(r.severity),
      source: clip(r.source),
      chain: clip(r.chain),
      title: clip(r.title),
      labels: stringToBytes(JSON.stringify(r.labels)),
      template: stringToBytes(r.template),
    },
    { expiration: RECIPE_LIFETIME },
  );
  return { entityKey, txHash, explorerUrl: entityUrl(entityKey) };
}

async function findRecipeByRedlineId(id: string): Promise<ArkivRef | null> {
  const { entities } = await publicClient()
    .select({ $key: true })
    .from(Recipes)
    .where(eq('redlineId', id))
    .limit(1)
    .fetch();
  const row = entities[0];
  return row ? { entityKey: row.$key, txHash: '0x' as Hex, explorerUrl: entityUrl(row.$key) } : null;
}

export interface ArkivRecipeRow extends ArkivRecipe {
  entityKey: Hex;
  owner: Hex;
  explorerUrl: string;
}

/** The whole public library, straight from Arkiv (no Postgres involved). */
export async function listRecipes(opts: { weaknessClass?: string } = {}): Promise<ArkivRecipeRow[]> {
  let q = publicClient().select().from(Recipes).orderBy(asc('$key')).limit(100);
  if (opts.weaknessClass) q = q.where(eq('weaknessClass', opts.weaknessClass));
  const { entities } = await q.fetch();
  return entities.map((e) => ({
    id: e.redlineId.value,
    weaknessClass: e.weaknessClass.value,
    severity: e.severity.value,
    source: e.source.value,
    chain: e.chain.value,
    title: e.title.value,
    labels: safeJson(hexToString(e.labels.value)) ?? [],
    template: hexToString(e.template.value),
    entityKey: e.$key,
    owner: e.$owner,
    explorerUrl: entityUrl(e.$key),
  }));
}

export interface ArkivProofInput {
  findingId: string;
  isRed: boolean;
  weaknessClass: string;
  severity: string | null;
  agreement: string;
  title: string;
  /** the votes-and-receipts JSON; must never contain the runnable attack */
  proof: unknown;
}

/** Publish the council's public proof of a finding. Idempotent on `findingId`. */
export async function publishProof(p: ArkivProofInput): Promise<ArkivRef> {
  const existing = await getProofRef(p.findingId);
  if (existing) return existing;
  const { client } = walletClient();
  const { entityKey, txHash } = await client.createEntity(
    Proofs,
    {
      findingId: p.findingId,
      verdict: p.isRed ? 'red' : 'neutral',
      weaknessClass: clip(p.weaknessClass),
      severity: clip(p.severity ?? 'unrated'),
      agreement: clip(p.agreement),
      title: clip(p.title),
      proof: stringToBytes(JSON.stringify(p.proof)),
    },
    { expiration: PROOF_LIFETIME },
  );
  return { entityKey, txHash, explorerUrl: entityUrl(entityKey) };
}

export async function getProofRef(findingId: string): Promise<ArkivRef | null> {
  const { entities } = await publicClient()
    .select({ $key: true })
    .from(Proofs)
    .where(eq('findingId', findingId))
    .limit(1)
    .fetch();
  const row = entities[0];
  return row ? { entityKey: row.$key, txHash: '0x' as Hex, explorerUrl: entityUrl(row.$key) } : null;
}

export interface ArkivProofRow {
  entityKey: Hex;
  owner: Hex;
  findingId: string;
  verdict: string;
  weaknessClass: string;
  severity: string;
  agreement: string;
  title: string;
  proof: unknown;
  explorerUrl: string;
}

/** Every reproduced theft the council has published, newest key last. */
export async function listProofs(opts: { verdict?: 'red' | 'neutral' } = {}): Promise<ArkivProofRow[]> {
  let q = publicClient().select().from(Proofs).orderBy(asc('$key')).limit(100);
  if (opts.verdict) q = q.where(eq('verdict', opts.verdict));
  const { entities } = await q.fetch();
  return entities.map((e) => ({
    entityKey: e.$key,
    owner: e.$owner,
    findingId: e.findingId.value,
    verdict: e.verdict.value,
    weaknessClass: e.weaknessClass.value,
    severity: e.severity.value,
    agreement: e.agreement.value,
    title: e.title.value,
    proof: safeJson(hexToString(e.proof.value)),
    explorerUrl: entityUrl(e.$key),
  }));
}

function safeJson(s: string): any {
  try { return JSON.parse(s); } catch { return null; }
}

export { and, eq };
