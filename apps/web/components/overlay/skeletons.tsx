import { Skeleton } from '@/components/ui/skeleton';

/** Page header placeholder matching .ov-head. */
export function HeadSkeleton({ actions = false }: { actions?: boolean }) {
  return (
    <div className="ov-head">
      <div className="ov-head__text" style={{ width: '100%' }}>
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2.5 h-3.5 w-80 max-w-full" />
      </div>
      {actions ? <Skeleton className="h-8 w-28 rounded-[9px]" /> : null}
    </div>
  );
}

/** Four stat tiles. */
export function StatsSkeleton() {
  return (
    <div className="ov-stats">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="ov-stat">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="my-1 h-7 w-10" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/** A titled panel with N placeholder rows. */
export function PanelSkeleton({ rows = 4, title = 120 }: { rows?: number; title?: number }) {
  return (
    <section className="ov-card ov-panel">
      <header className="ov-panel__head">
        <Skeleton className="h-4" style={{ width: title }} />
        <Skeleton className="h-3 w-12" />
      </header>
      <div className="flex flex-col gap-3 py-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-2 rounded-full" />
            <Skeleton className="h-3.5 flex-1" style={{ maxWidth: `${60 + ((i * 7) % 30)}%` }} />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </section>
  );
}

/** The dashboard two-column layout: a tall left panel and a right stack. */
export function ColumnsSkeleton() {
  return (
    <div className="ov-columns">
      <PanelSkeleton rows={6} />
      <div className="ov-stack">
        <PanelSkeleton rows={4} />
        <PanelSkeleton rows={3} />
      </div>
    </div>
  );
}

/** A stack of card rows (repositories, recipes, findings list). */
export function CardListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="ov-card flex items-center gap-4 p-4">
          <Skeleton className="size-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-48 max-w-[60%]" />
            <Skeleton className="h-3 w-32 max-w-[40%]" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}
