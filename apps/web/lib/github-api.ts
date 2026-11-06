import { and, eq, schema } from '@redline/db';
import { auth } from '@/auth';
import { db } from './db';

/**
 * Read-only calls to GitHub's public REST API for the onboarding screens. Paths
 * are built only from values that passed parseGithubTarget, never raw input.
 */

/** The signed-in viewer's GitHub OAuth token, if any: lifts the rate limit. */
async function viewerToken(): Promise<string | null> {
  const session = await auth().catch(() => null);
  const userId = session?.user?.id;
  if (!userId) return null;
  const [row] = await db()
    .select({ token: schema.authAccounts.access_token })
    .from(schema.authAccounts)
    .where(and(eq(schema.authAccounts.userId, userId), eq(schema.authAccounts.provider, 'github')))
    .limit(1);
  return row?.token ?? null;
}

export async function githubToken(): Promise<string | null> {
  return process.env.GITHUB_TOKEN || (await viewerToken());
}

export async function gh<T>(path: string, token: string | null): Promise<{ status: number; data: T | null }> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'redline-onboarding',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  return { status: res.status, data: res.ok ? ((await res.json()) as T) : null };
}

/** GitHub answers 403 or 429 when its rate limit is spent. */
export const isRateLimited = (status: number) => status === 403 || status === 429;

/**
 * The Redline GitHub App's install page with the account (and repository)
 * preselected, or null when GITHUB_APP_SLUG isn't configured.
 */
export function installUrl(ownerId: number, repoId: number | null = null): string | null {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) return null;
  const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  url.searchParams.set('suggested_target_id', String(ownerId));
  if (repoId != null) url.searchParams.append('repository_ids[]', String(repoId));
  return url.toString();
}
