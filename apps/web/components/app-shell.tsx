'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { RedlineMark } from '@/components/brand';
import { Icon } from '@/components/icon';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DashboardSquare01Icon,
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
  { href: '/', label: 'Overview', icon: DashboardSquare01Icon },
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
      <span className="ov-wordmark__mark">
        <RedlineMark size={16} />
      </span>
      <span className="ov-wordmark__name">Redline</span>
    </Link>
  );
}

function Sidebar({ openAlarms }: { openAlarms: number }) {
  return (
    <div className="ov-side">
      <Brand />
      <ShellSearch />
      <NavList openAlarms={openAlarms} />
      <div className="ov-me">
        <span className="ov-avatar" aria-hidden style={{ ['--hue' as string]: 52, width: 28, height: 28, fontSize: 11 }}>AD</span>
        <div className="ov-me__text">
          <span className="ov-me__name">acme-defi</span>
          <span className="ov-me__role">Pro plan</span>
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children, openAlarms = 0 }: { children: React.ReactNode; openAlarms?: number }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="ov-stage ov-stage--app">
      <div className="ov-app">
        <Sidebar openAlarms={openAlarms} />
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
