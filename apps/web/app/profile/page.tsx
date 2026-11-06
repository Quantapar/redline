import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth, signOut } from '@/auth';
import { Head } from '@/components/overlay/ui';
import { Icon } from '@/components/icon';
import { Logout01Icon, FolderLibraryIcon, ArrowRight01Icon } from '@hugeicons/core-free-icons';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  const u = session.user;
  const label = u.name || u.email || 'Account';
  const initials = (u.name || u.email || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';

  return (
    <>
      <Head
        title="Profile"
        meta="Your account and the repositories you've connected to Redline."
        actions={
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/' }); }}>
            <button type="submit" className="ov-button">
              <Icon icon={Logout01Icon} size={16} strokeWidth={1.6} /> Sign out
            </button>
          </form>
        }
      />

      <section className="ov-card ov-panel profile-id">
        {u.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={u.image} alt="" className="profile-id__avatar" width={56} height={56} referrerPolicy="no-referrer" />
        ) : (
          <span className="ov-avatar" aria-hidden style={{ ['--hue' as string]: 52, width: 56, height: 56, fontSize: 20 }}>{initials}</span>
        )}
        <div className="profile-id__text">
          <span className="profile-id__name">{label}</span>
          {u.email ? <span className="profile-id__email ov-num">{u.email}</span> : null}
        </div>
      </section>

      <Link href="/repositories" className="ov-card ov-panel profile-connect">
        <span className="profile-connect__icon">
          <Icon icon={FolderLibraryIcon} size={20} strokeWidth={1.5} />
        </span>
        <div className="profile-connect__text">
          <span className="profile-connect__title">Connect a repository</span>
          <span className="profile-connect__sub">Pick a repo to watch and Redline attacks every change to it.</span>
        </div>
        <Icon icon={ArrowRight01Icon} size={18} className="ov-muted" />
      </Link>
    </>
  );
}
