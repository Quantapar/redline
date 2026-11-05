import { HugeiconsIcon } from '@hugeicons/react';
import type { ComponentProps } from 'react';

type IconDef = ComponentProps<typeof HugeiconsIcon>['icon'];

export function Icon({
  icon,
  size = 18,
  className,
  strokeWidth = 1.8,
}: {
  icon: IconDef;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return <HugeiconsIcon icon={icon} size={size} className={className} strokeWidth={strokeWidth} />;
}
