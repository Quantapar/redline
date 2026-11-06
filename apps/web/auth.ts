import NextAuth from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { schema } from '@redline/db';
import { db } from '@/lib/db';

/**
 * Auth.js (NextAuth v5) — "Sign in with GitHub" and "Sign in with Google".
 * Sessions are database-backed (the auth_* tables) so the profile and connected
 * accounts persist. GitHub login requests the `repo` scope so the dashboard can
 * list the user's repositories without them leaving the app. Google is wired only
 * when its credentials are present, so the app runs with GitHub alone until then.
 * `trustHost` is required because we run behind a tunnel/reverse proxy, not Vercel.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db(), {
    usersTable: schema.authUsers,
    accountsTable: schema.authAccounts,
    sessionsTable: schema.authSessions,
    verificationTokensTable: schema.authVerificationTokens,
  }),
  providers: [
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      authorization: { params: { scope: 'read:user user:email repo' } },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  session: { strategy: 'database' },
  trustHost: true,
  pages: { signIn: '/login' },
});
