import { cache } from 'react';
import { and, eq, schema } from '@redline/db';
import { auth } from '@/auth';
import { db } from './db';

/**
 * The signed-in viewer's GitHub numeric id, or null when nobody is signed in
 * (or the session isn't a GitHub login). This id is the tenant key: a viewer
 * owns the `accounts` row whose `githubId` equals it, and may only see data
 * under that account's installations and repositories.
 *
 * Wrapped in React's per-request cache so a page that runs several scoped
 * queries resolves the viewer once, not once per query.
 */
export const viewerGithubId = cache(async (): Promise<number | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const [row] = await db()
    .select({ providerAccountId: schema.authAccounts.providerAccountId })
    .from(schema.authAccounts)
    .where(and(eq(schema.authAccounts.userId, userId), eq(schema.authAccounts.provider, 'github')))
    .limit(1);

  if (!row?.providerAccountId) return null;
  const n = Number(row.providerAccountId);
  return Number.isFinite(n) ? n : null;
});

/**
 * The repository ids the viewer owns, following
 * repositories → installations → accounts and matching the account's GitHub id
 * to the viewer. Returns an empty array for signed-out or unconnected viewers,
 * so callers that filter on it naturally return nothing.
 */
export const viewerRepoIds = cache(async (): Promise<string[]> => {
  const gid = await viewerGithubId();
  if (gid == null) return [];

  const rows = await db()
    .select({ id: schema.repositories.id })
    .from(schema.repositories)
    .innerJoin(schema.installations, eq(schema.repositories.installationId, schema.installations.id))
    .innerJoin(schema.accounts, eq(schema.installations.accountId, schema.accounts.id))
    .where(eq(schema.accounts.githubId, gid));

  return rows.map((r) => r.id);
});
