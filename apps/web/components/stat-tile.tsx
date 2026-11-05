import { Card } from '@/components/ui/card';
import { Icon } from '@/components/icon';
import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';
import type { HugeiconsIcon } from '@hugeicons/react';

type IconDef = ComponentProps<typeof HugeiconsIcon>['icon'];

export function StatTile({
  label,
  value,
  icon,
  accent,
  hint,
}: {
  label: string;
  value: number | string;
  icon: IconDef;
  accent?: 'error' | 'neutral';
  hint?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="flex size-8 items-center justify-center rounded-md border border-border bg-muted/50">
          <Icon icon={icon} size={16} className={cn(accent === 'error' && 'text-destructive')} />
        </div>
      </div>
      <div className="mt-3 text-[26px] font-semibold leading-none tabular-nums tracking-tight">{value}</div>
      <div className="mt-1.5 text-[13px] text-muted-foreground">{label}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</div> : null}
    </Card>
  );
}
