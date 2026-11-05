import { HugeiconsIcon } from '@hugeicons/react';
import type { ComponentProps } from 'react';

type IconDef = ComponentProps<typeof HugeiconsIcon>['icon'];

export function Icon({
  icon,
  size = 18,
  className,
  strokeWidth = 1.8,
  label,
}: {
  icon: IconDef;
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Provide only when the icon conveys meaning on its own (no adjacent text). */
  label?: string;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      className={className}
      strokeWidth={strokeWidth}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? 'img' : undefined}
    />
  );
}
