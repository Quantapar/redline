import type { CSSProperties } from 'react'

import { CYCLE, type OrbVariant, schedule } from '@/lib/orb-lattice'
import { cn } from '@/lib/utils'

const STAGE = 28

const PITCH = 6

function Orb({
  variant,
  size = 20,
  label = 'Loading',
  className,
}: {
  variant: OrbVariant

  size?: number
  label?: string
  className?: string
}) {
  return (
    <span
      data-slot="orb"
      role="status"
      aria-label={label}
      className={cn('orb', className)}
      style={{ width: size, height: size, '--orb-k': size / STAGE } as CSSProperties}
    >
      <span className="orb-lattice" data-variant={variant}>
        {schedule(variant).map((cell) => (
          <span
            key={`${String(cell.x)},${String(cell.y)}`}
            className="orb-cell"
            data-still={cell.still ? '' : undefined}
            data-mid={cell.mid ? '' : undefined}
            style={{

              left: cell.x * PITCH,
              top: cell.y * PITCH,
              animationDelay: `${String(Math.round(cell.delay))}ms`,
              animationDuration: `${String(CYCLE[variant])}ms`,
            }}
          />
        ))}
      </span>
    </span>
  )
}

export { Orb, type OrbVariant }
