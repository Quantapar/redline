'use client';

import { useEffect, useId, useRef, useState } from 'react'
import { LazyMotion, useReducedMotion, type Transition } from 'motion/react'
import * as m from 'motion/react-m'

const loadFeatures = () => import('@/lib/motion-features').then((mod) => mod.default)

import { DASH, DISC_POSE, SEAM, TICK, sheetPose } from '@/lib/copy-check-glyph'

const EASE_OUT = [0.22, 1, 0.36, 1] as const

export const COPIED_HOLD = 1500

export function useReceipt() {
  const [shown, setShown] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const show = () => {
    setShown(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setShown(false), COPIED_HOLD)
  }
  return [shown, show] as const
}

export function CopyCheck({
  copied,
  size = 15,
  strokeWidth = 1.8,
  className,
}: {
  copied: boolean
  size?: number
  strokeWidth?: number
  className?: string
}) {
  const still = useReducedMotion()
  const seam = useId()

  const morph: Transition = still
    ? { duration: 0 }
    : {
        type: 'spring',
        duration: 0.34,
        bounce: 0,
        delay: copied ? 0 : 0.07,
      }
  const draw: Transition = still
    ? { duration: 0 }
    : copied
      ? { duration: 0.22, delay: 0.13, ease: EASE_OUT }
      : { duration: 0.12, ease: 'linear' }

  const dissolve: Transition = still
    ? { duration: 0 }
    : copied
      ? { duration: 0.08, delay: 0.04 }
      : { duration: 0.1, delay: 0.12 }

  const pose = (dir: 1 | -1) => (copied ? DISC_POSE : sheetPose(dir))

  return (
    <LazyMotion features={loadFeatures} strict>
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden
        data-slot="copy-check"

        data-copied={copied || undefined}
      >

        <mask id={seam} maskUnits="userSpaceOnUse">
          <rect width="24" height="24" fill="#fff" />
          <m.rect
            initial={false}
            animate={pose(1)}
            transition={morph}
            fill="#000"
            stroke="#000"
            strokeWidth={strokeWidth + SEAM}
          />
        </mask>

        <m.rect
          data-copy-sheet="back"
          initial={false}
          animate={{ ...pose(-1), opacity: copied ? 0 : 1 }}
          transition={{ ...morph, opacity: dissolve }}
          mask={`url(#${seam})`}
        />
        <m.rect initial={false} animate={pose(1)} transition={morph} />

        <m.path
          d={TICK}
          pathLength={1}
          strokeDasharray={DASH}
          initial={false}
          animate={{ strokeDashoffset: copied ? 0 : 1 }}
          transition={draw}
        />
      </svg>
    </LazyMotion>
  )
}