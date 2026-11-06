import type { CSSProperties } from 'react'

export function TextShimmer({
  children,
  duration = 2,
  spread = 2,
}: {
  children: string
  duration?: number
  spread?: number
}) {
  return (
    <span

      className="relative inline-block rtl:[animation-direction:reverse]"
      style={
        {
          '--spread': `${children.length * spread}px`,
          backgroundImage:
            'linear-gradient(90deg, transparent calc(50% - var(--spread)), currentColor, transparent calc(50% + var(--spread))), linear-gradient(color-mix(in oklab, currentColor var(--shimmer-dim), transparent), color-mix(in oklab, currentColor var(--shimmer-dim), transparent))',
          backgroundSize: '250% 100%, auto',
          backgroundRepeat: 'no-repeat',
          backgroundClip: 'text',
          WebkitBackgroundClip: 'text',

          WebkitTextFillColor: 'transparent',
          animationName: 'text-shimmer',
          animationDuration: `${duration}s`,
          animationTimingFunction: 'linear',
          animationIterationCount: 'infinite',
        } as CSSProperties
      }
    >
      {children}
    </span>
  )
}
