import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Gate the whole dashboard behind a session.
 *
 * Auth.js uses database sessions, whose adapter is not edge-safe, so we do not
 * validate the session in middleware — we only check that a session cookie is
 * present and redirect to /login when it is not. The pages themselves still call
 * auth() for the real user, so a forged cookie buys nothing but a login screen.
 * /login and the /api/auth/* handlers are excluded (see PUBLIC and the matcher),
 * and all other /api routes are skipped entirely — they enforce their own auth
 * and must never receive a 307 redirect in place of a real response.
 */
// `/` is the public landing page; /login is the sign-in card; /connect/github
// signs in from the onboarding's new tab. Everything else requires a session.
const PUBLIC = [/^\/$/, /^\/login(?:\/|$)/, /^\/connect\/github$/];

const SESSION_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
];

const LOOPBACK = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

/**
 * Where a production build opened directly on localhost should send people:
 * the public origin in AUTH_URL. GitHub sign-in always returns to AUTH_URL, so
 * a sign-in started on localhost stores its state cookie on the wrong site and
 * fails the check on the way back (`error=Configuration`). Only bare local
 * requests move: tunnel traffic arrives under the public host (forwarded by
 * Cloudflare, with a cf-ray header), and dev servers are left alone.
 */
function canonicalRedirect(req: NextRequest): NextResponse | null {
  if (process.env.NODE_ENV !== 'production' || !process.env.AUTH_URL) return null;
  let canonical: URL;
  try {
    canonical = new URL(process.env.AUTH_URL);
  } catch {
    return null;
  }
  if (LOOPBACK.test(canonical.host)) return null;
  if (req.headers.has('cf-ray')) return null;
  const host = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? '').split(',')[0]!.trim();
  if (!LOOPBACK.test(host)) return null;
  const url = new URL(req.nextUrl.pathname + req.nextUrl.search, canonical.origin);
  return NextResponse.redirect(url);
}

export function middleware(req: NextRequest) {
  const moved = canonicalRedirect(req);
  if (moved) return moved;

  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname))) return NextResponse.next();

  const signedIn = SESSION_COOKIES.some((name) => req.cookies.has(name));
  if (signedIn) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  url.searchParams.set('callbackUrl', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Every path except Next internals, the auth API, and static files.
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf)$).*)',
  ],
};
