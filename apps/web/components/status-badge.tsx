import { Badge } from '@/components/ui/badge';
import type { StatusHue } from '@/lib/format';
import type { ComponentProps } from 'react';

const HUE_TO_VARIANT: Record<StatusHue, ComponentProps<typeof Badge>['variant']> = {
  error: 'destructive',
  warning: 'amber',
  success: 'green',
  info: 'blue',
  neutral: 'neutral',
};

export function StatusBadge({
  hue,
  children,
  size,
}: {
  hue: StatusHue;
  children: React.ReactNode;
  size?: ComponentProps<typeof Badge>['size'];
}) {
  return (
    <Badge variant={HUE_TO_VARIANT[hue]} size={size}>
      {children}
    </Badge>
  );
}
