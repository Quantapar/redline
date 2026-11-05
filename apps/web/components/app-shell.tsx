'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wordmark } from '@/components/brand';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import {
  DashboardSquare01Icon,
  Bug01Icon,
  FolderLibraryIcon,
  JusticeScale01Icon,
  Target01Icon as RecipeIcon,
  Shield01Icon,
  LockedIcon,
  Menu01Icon,
  Target01Icon,
} from '@hugeicons/core-free-icons';

const NAV = [
  { href: '/', label: 'Overview', icon: DashboardSquare01Icon },
  { href: '/repositories', label: 'Repositories', icon: FolderLibraryIcon },
  { href: '/findings', label: 'Findings', icon: Bug01Icon },
  { href: '/council', label: 'Referee council', icon: JusticeScale01Icon },
  { href: '/recipes', label: 'Attack recipes', icon: RecipeIcon },
  { href: '/policy', label: 'Security policy', icon: Shield01Icon },
  { href: '/going-live', label: 'Going live', icon: LockedIcon },
];

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={cn(
            'group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
            isActive(item.href)
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground',
          )}
        >
          <Icon icon={item.icon} size={17} />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-[100dvh] bg-background">
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-border bg-sidebar md:flex">
        <div className="flex h-14 items-center px-4">
          <Link href="/" className="rounded-md px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
            <Wordmark />
          </Link>
        </div>
        <div className="flex-1 px-2 py-2">
          <NavLinks />
        </div>
        <div className="border-t border-border p-3">
          <div className="flex items-center gap-2.5 rounded-md px-1 py-1">
            <div className="flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-semibold">AD</div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium">acme-defi</div>
              <div className="truncate text-[11px] text-muted-foreground">Pro plan</div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur-md md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                render={
                  <Button variant="ghost" size="icon-sm" aria-label="Open navigation">
                    <Icon icon={Menu01Icon} size={18} />
                  </Button>
                }
              />
              <SheetContent side="left" className="w-64 p-0">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <div className="flex h-14 items-center px-4">
                  <Wordmark />
                </div>
                <div className="px-2 py-2">
                  <NavLinks onNavigate={() => setOpen(false)} />
                </div>
              </SheetContent>
            </Sheet>
            <Wordmark />
          </div>
          <div className="ml-auto flex items-center gap-2 text-[12px] text-muted-foreground">
            <Icon icon={Target01Icon} size={15} />
            <span className="hidden sm:inline">Proof, not opinion</span>
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
