import type { Metadata, Viewport } from 'next';
import './globals.css';
import './overlay.css';
import { AppShell } from '@/components/app-shell';
import { issueMutationToken } from '@/lib/auth';
import { listAllFindings } from '@/lib/queries';

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
  const openAlarms = await openAlarmCount();
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* Short-lived token the client attaches to state-changing requests (CSRF defence). */}
        <meta name="x-redline-csrf" content={issueMutationToken()} />
      </head>
      <body suppressHydrationWarning>
        <AppShell openAlarms={openAlarms}>{children}</AppShell>
      </body>
    </html>
  );
}
