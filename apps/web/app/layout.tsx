import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono, Newsreader } from 'next/font/google';
import './globals.css';
import './overlay.css';

// Fonts for the ported onboarding flow: Geist for UI, Newsreader (serif) for the
// subject's own words. Exposed as CSS variables; the flow maps them under .kobra-flow.
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });
const newsreader = Newsreader({ variable: '--font-newsreader', subsets: ['latin'], style: ['normal', 'italic'] });
import { AppShell } from '@/components/app-shell';
import { DevFeedback } from '@/components/dev-feedback';
import { issueMutationToken } from '@/lib/auth';
import { listAllFindings } from '@/lib/queries';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

async function openAlarmCount(): Promise<number> {
  try {
    const findings = await listAllFindings();
    return findings.filter((f) => f.finding.isRed && f.finding.status !== 'resolved').length;
  } catch {
    return 0;
  }
}

export const metadata: Metadata = {
  title: 'Redline — proof, not opinion',
  description: 'Continuous security testing for smart contracts. An alarm only when the money provably moves.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0a0a',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const signedIn = Boolean(session?.user);
  const user = session?.user
    ? { name: session.user.name ?? null, image: session.user.image ?? null, email: session.user.email ?? null }
    : null;
  // The dashboard chrome (sidebar, topbar) is only for signed-in users. Signed-out
  // visitors see the public landing page, which brings its own nav and footer.
  const openAlarms = signedIn ? await openAlarmCount() : 0;
  return (
    <html lang="en" className={`dark ${geistSans.variable} ${geistMono.variable} ${newsreader.variable}`} suppressHydrationWarning>
      <head>
        {/* Short-lived token the client attaches to state-changing requests (CSRF defence). */}
        <meta name="x-redline-csrf" content={issueMutationToken()} />
      </head>
      <body suppressHydrationWarning>
        {signedIn ? (
          <AppShell openAlarms={openAlarms} user={user}>{children}</AppShell>
        ) : (
          children
        )}
        <DevFeedback />
      </body>
    </html>
  );
}
