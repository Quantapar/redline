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
const PUBLIC = [/^\/login(?:\/|$)/];

const SESSION_COOKIES = [
  'authjs.session-token',
  '__Secure-authjs.session-token',
];

export function middleware(req: NextRequest) {
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
