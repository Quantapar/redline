import { NextResponse } from 'next/server';
import { and, eq, schema } from '@redline/db';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { parseGithubTarget } from '@/lib/github-target';
import { rateLimit, clientKey } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/github/lookup?q=<username | owner/repo | GitHub URL>
 *
 * Resolves what someone typed on the onboarding screen to a real GitHub account
 * (and repository), and returns the GitHub App install link that connects it.
 * Connecting = installing the Redline App: from then on its push / pull_request
 * webhooks register the repo and queue scans (apps/github-app).
 *
 * Public (the onboarding runs signed out), so it is rate limited and only ever
 * calls the two read-only GitHub endpoints below with a validated owner/repo.
 */

type GhUser = { id: number; login: string; type: string; name: string | null; avatar_url: string; public_repos: number };
type GhRepo = {
  id: number; full_name: string; description: string | null; private: boolean;
  language: string | null; default_branch: string; owner: { id: number };
};

// The signed-in viewer's GitHub OAuth token, when there is one: it lifts the API
// rate limit and lets their own private repositories resolve.
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

async function gh<T>(path: string, token: string | null): Promise<{ status: number; data: T | null }> {
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

function installUrl(ownerId: number, repoId: number | null): string | null {
  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) return null;
  const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  // Pre-selects the account (and repository) on GitHub's install screen.
  url.searchParams.set('suggested_target_id', String(ownerId));
  if (repoId != null) url.searchParams.append('repository_ids[]', String(repoId));
  return url.toString();
}

export async function GET(req: Request) {
  const rl = rateLimit(`gh-lookup:${clientKey(req)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const q = new URL(req.url).searchParams.get('q') ?? '';
  const target = parseGithubTarget(q.slice(0, 300));
  if (!target) return NextResponse.json({ error: 'invalid' }, { status: 400 });

  const token = process.env.GITHUB_TOKEN || (await viewerToken());
  try {
    const owner = await gh<GhUser>(`/users/${encodeURIComponent(target.owner)}`, token);
    if (owner.status === 404) return NextResponse.json({ error: 'not_found', what: 'owner' }, { status: 404 });
    if (owner.status === 403 || owner.status === 429) return NextResponse.json({ error: 'github_rate_limited' }, { status: 503 });
    if (!owner.data) return NextResponse.json({ error: 'github_error' }, { status: 502 });

    let repo: GhRepo | null = null;
    if (target.repo) {
      const r = await gh<GhRepo>(`/repos/${encodeURIComponent(owner.data.login)}/${encodeURIComponent(target.repo)}`, token);
      // A private repo the caller can't see also comes back 404.
      if (r.status === 404) return NextResponse.json({ error: 'not_found', what: 'repo' }, { status: 404 });
      if (r.status === 403 || r.status === 429) return NextResponse.json({ error: 'github_rate_limited' }, { status: 503 });
      if (!r.data) return NextResponse.json({ error: 'github_error' }, { status: 502 });
      repo = r.data;
    }

    const o = owner.data;
    return NextResponse.json({
      owner: {
        id: o.id,
        login: o.login,
        name: o.name,
        type: o.type === 'Organization' ? 'organization' : 'user',
        avatarUrl: o.avatar_url,
        publicRepos: o.public_repos,
      },
      repo: repo && {
        id: repo.id,
        fullName: repo.full_name,
        description: repo.description,
        private: repo.private,
        language: repo.language,
        defaultBranch: repo.default_branch,
      },
      installUrl: installUrl(o.id, repo?.id ?? null),
    });
  } catch {
    return NextResponse.json({ error: 'github_unreachable' }, { status: 502 });
  }
}
