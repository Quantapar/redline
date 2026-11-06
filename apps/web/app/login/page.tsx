import { redirect } from 'next/navigation';
import { auth, signIn } from '@/auth';
import { RedlineMark } from '@/components/brand';
import { Icon } from '@/components/icon';
import { GithubIcon, GoogleIcon } from '@hugeicons/core-free-icons';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ callbackUrl?: string }> }) {
  const session = await auth();
  if (session?.user) redirect('/');
  const { callbackUrl } = await searchParams;
  const redirectTo = callbackUrl && callbackUrl.startsWith('/') ? callbackUrl : '/';
  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

  return (
    <div className="login-screen">
      <div className="login-card ov-card">
        <span className="login-mark">
          <RedlineMark size={26} />
        </span>
        <h1 className="login-title">Sign in to Redline</h1>
        <p className="login-sub">Proof, not opinion. Connect a repository and let the council attack every change.</p>

        <form
          action={async () => {
            'use server';
            await signIn('github', { redirectTo });
          }}
        >
          <button type="submit" className="login-provider login-provider--github">
            <Icon icon={GithubIcon} size={18} strokeWidth={1.6} />
            Continue with GitHub
          </button>
        </form>

        {googleEnabled ? (
          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo });
            }}
          >
            <button type="submit" className="login-provider login-provider--google">
              <Icon icon={GoogleIcon} size={18} strokeWidth={1.6} />
              Continue with Google
            </button>
          </form>
        ) : null}

        <p className="login-fineprint">
          By continuing you agree to let Redline read the repositories you choose to connect.
        </p>
      </div>
    </div>
  );
}
