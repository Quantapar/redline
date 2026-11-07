'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { RedlineMark } from '@/components/brand';
import { Icon } from '@/components/icon';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  PlusSignIcon,
  Bug01Icon,
  FolderLibraryIcon,
  JusticeScale01Icon,
  Target01Icon,
  Shield01Icon,
  LockedIcon,
  Menu01Icon,
  Search01Icon,
  Cancel01Icon,
} from '@hugeicons/core-free-icons';

type NavItem = { href: string; label: string; icon: Parameters<typeof Icon>[0]['icon'] };

const PRIMARY: NavItem[] = [
  // Home is the onboarding: pick a repository and watch it get attacked
  { href: '/', label: 'New attack', icon: PlusSignIcon },
  { href: '/repositories', label: 'Repositories', icon: FolderLibraryIcon },
  { href: '/findings', label: 'Findings', icon: Bug01Icon },
];

const VERIFY: NavItem[] = [
  { href: '/council', label: 'Referee council', icon: JusticeScale01Icon },
  { href: '/recipes', label: 'Attack recipes', icon: Target01Icon },
  { href: '/policy', label: 'Security policy', icon: Shield01Icon },
  { href: '/going-live', label: 'Going live', icon: LockedIcon },
];

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
}

/** The nav list, shared by the desktop rail and the mobile sheet. A sliding pill
 *  sits under the active row (desktop only — the sheet passes withPill=false). */
function NavList({
  openAlarms,
  withPill = true,
  onNavigate,
}: {
  openAlarms: number;
  withPill?: boolean;
  onNavigate?: () => void;
}) {
  const isActive = useActive();
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!withPill) return;
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const place = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (active) {
        pill.style.transform = `translateY(${active.offsetTop}px)`;
        pill.dataset.hidden = '';
      } else {
        pill.dataset.hidden = 'true';
      }
    };
    place();
    const sizes = new ResizeObserver(place);
    sizes.observe(nav);
    return () => sizes.disconnect();
  }, [pathname, withPill]);

  const row = (item: NavItem) => {
    const active = isActive(item.href);
    const alarms = item.href === '/findings' && openAlarms > 0 ? openAlarms : null;
    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        className="ov-nav__item"
      >
        <Icon icon={item.icon} size={20} strokeWidth={1.5} className="ov-nav__icon" />
        <span className="ov-nav__label">{item.label}</span>
        {alarms ? (
          <span className="ov-nav__count">
            {alarms}
            <span className="ov-sr"> open alarms</span>
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <nav ref={navRef} className={withPill ? 'ov-nav' : 'ov-sheet-nav'} aria-label="Sections">
      {withPill ? <span ref={pillRef} className="ov-nav__pill" aria-hidden data-hidden="true" /> : null}
      {PRIMARY.map(row)}
      <div className="ov-nav__group" role="group" aria-label="Verification">
        <h3 className="ov-nav__heading">Verification</h3>
        {VERIFY.map(row)}
      </div>
    </nav>
  );
}

function ShellSearch() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable='true']")) return;
      if (e.key === '/') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const submit = () => {
    const term = q.trim();
    router.push(term ? `/findings?q=${encodeURIComponent(term)}` : '/findings');
  };

  return (
    <label className="ov-search">
      <Icon icon={Search01Icon} size={16} strokeWidth={1.5} className="ov-search__icon" />
      <input
        ref={ref}
        type="search"
        placeholder="Search findings"
        aria-label="Search findings"
        aria-keyshortcuts="/"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            setQ('');
            e.currentTarget.blur();
          }
        }}
      />
      {q ? (
        <button type="button" className="ov-search__clear" aria-label="Clear search" onClick={() => { setQ(''); ref.current?.focus(); }}>
          <Icon icon={Cancel01Icon} size={13} strokeWidth={1.8} />
        </button>
      ) : (
        <kbd className="ov-search__key" aria-hidden>/</kbd>
      )}
    </label>
  );
}

function Brand() {
  return (
    <Link href="/" className="ov-wordmark" aria-label="Redline home">
      <RedlineMark size={26} className="ov-wordmark__mark" />
      <span className="ov-wordmark__name">Redline</span>
    </Link>
  );
}

type ShellUser = { name: string | null; image: string | null; email: string | null } | null;

function UserBox({ user }: { user: ShellUser }) {
  if (!user) {
    return (
      <Link href="/login" className="ov-me ov-me--link">
        <span className="ov-avatar" aria-hidden style={{ ['--hue' as string]: 52, width: 28, height: 28, fontSize: 12 }}>→</span>
        <div className="ov-me__text">
          <span className="ov-me__name">Sign in</span>
          <span className="ov-me__role">GitHub or Google</span>
        </div>
      </Link>
    );
  }
  const label = user.name || user.email || 'Account';
  const initials = (user.name || user.email || '?').replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
  return (
    <Link href="/profile" className="ov-me ov-me--link" title="View profile">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="ov-me__avatar" width={28} height={28} referrerPolicy="no-referrer" />
      ) : (
        <span className="ov-avatar" aria-hidden style={{ ['--hue' as string]: 52, width: 28, height: 28, fontSize: 11 }}>{initials}</span>
      )}
      <div className="ov-me__text">
        <span className="ov-me__name">{label}</span>
        <span className="ov-me__role">{user.email ?? 'View profile'}</span>
      </div>
    </Link>
  );
}

function Sidebar({ openAlarms, user }: { openAlarms: number; user: ShellUser }) {
  return (
    <div className="ov-side">
      <Brand />
      <ShellSearch />
      <NavList openAlarms={openAlarms} />
      <UserBox user={user} />
    </div>
  );
}

export function AppShell({ children, openAlarms = 0, user = null }: { children: React.ReactNode; openAlarms?: number; user?: ShellUser }) {
  const [open, setOpen] = useState(false);
  // The home page is the onboarding for everyone, signed in or not: it brings its
  // own header and never sits inside the dashboard's sidebar and topbar
  if (usePathname() === '/') return <>{children}</>;

  return (
    <div className="ov-stage ov-stage--app">
      <div className="ov-app">
        <Sidebar openAlarms={openAlarms} user={user} />
        <div className="ov-main">
          <div className="ov-topbar">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                render={
                  <button type="button" className="ov-topbar__menu" aria-label="Open navigation">
                    <Icon icon={Menu01Icon} size={18} strokeWidth={1.6} />
                  </button>
                }
              />
              <SheetContent side="left" className="w-72 border-0 bg-sidebar p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="p-2 pt-3">
                  <Brand />
                </div>
                <NavList openAlarms={openAlarms} withPill={false} onNavigate={() => setOpen(false)} />
                <div className="px-2 pb-2">
                  <UserBox user={user} />
                </div>
              </SheetContent>
            </Sheet>
            <Brand />
          </div>
          <div className="ov-view">
            <div className="ov-view__inner">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
