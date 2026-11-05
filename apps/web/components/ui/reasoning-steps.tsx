'use client'

import { useDirection } from '@base-ui/react/direction-provider'
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, MotionConfig, useReducedMotion } from 'motion/react'

import { Orb, type OrbVariant } from '@/components/ui/orb'
import { TextShimmer } from '@/components/ui/text-shimmer'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight } from "lucide-react"

const EASE = [0.16, 1, 0.3, 1] as const

const STAGE_MS = 1750

const SOURCES_MS = 1000

const REASON_MS = 650

const REASON_MAX = 192
const REASON_FADE = 32

const reasonMask = (top: boolean, bottom: boolean) =>
  top || bottom
    ? `linear-gradient(to bottom, ${
        top ? `transparent 0, #000 ${String(REASON_FADE)}px` : '#000 0'
      }, ${bottom ? `#000 calc(100% - ${String(REASON_FADE)}px), transparent 100%` : '#000 100%'})`
    : undefined

type ReasoningStepsSource = { icon: string; label: string }

function ReasoningSteps({
  stages,
  sources = [],
  reasoning = [],
  stageMs = STAGE_MS,
  reasonMs = REASON_MS,
  onDone,
  className,
}: {

  stages: ReadonlyArray<string>

  sources?: ReadonlyArray<ReasoningStepsSource>

  reasoning?: ReadonlyArray<string>
  stageMs?: number
  reasonMs?: number

  onDone?: () => void
  className?: string
}) {
  const [step, setStep] = useState(0)
  const [showSources, setShowSources] = useState(false)

  const [shown, setShown] = useState(0)
  const [open, setOpen] = useState(true)

  const [took, setTook] = useState(1)
  const started = useRef(0)
  const scroller = useRef<HTMLDivElement>(null)

  const [scrolls, setScrolls] = useState(false)

  const [past, setPast] = useState({ above: false, below: false })
  const still = useReducedMotion()
  const side = useDirection() === 'rtl' ? -1 : 1

  const mask = reasonMask(past.above, past.below)

  const settled = step >= stages.length
  const label = stages[step] ?? ''

  const variant: OrbVariant = step === 0 ? 'S3' : 'S2'

  const streaming = step === stages.length - 1 && shown < reasoning.length

  useEffect(() => {
    started.current = performance.now()
  }, [])

  useEffect(() => {
    if (settled) {
      onDone?.()
      return
    }
    const timer = window.setTimeout(
      () => {
        if (streaming) setShown((count) => count + 1)
        else setStep((current) => current + 1)
      },
      streaming ? reasonMs : stageMs,
    )
    return () => window.clearTimeout(timer)
  }, [step, shown, streaming, settled, stageMs, reasonMs, onDone])

  useEffect(() => {
    if (!settled) return
    setTook(Math.max(1, Math.round((performance.now() - started.current) / 1000)))
    setOpen(false)
  }, [settled])

  useEffect(() => {
    if (sources.length === 0) return
    const timer = window.setTimeout(() => setShowSources(true), SOURCES_MS)
    return () => window.clearTimeout(timer)
  }, [sources.length])

  useEffect(() => {
    const el = scroller.current
    if (!el || shown === 0) return
    setScrolls(el.scrollHeight > REASON_MAX)
    el.scrollTo({ top: el.scrollHeight, behavior: still ? 'auto' : 'smooth' })
  }, [shown, still])

  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const read = () => {
      const room = el.scrollHeight - el.clientHeight
      setPast({ above: el.scrollTop > 1, below: room > 1 })
    }
    read()
    el.addEventListener('scroll', read, { passive: true })
    return () => el.removeEventListener('scroll', read)
  }, [shown, open])

  return (

    <MotionConfig reducedMotion="user">
      <div data-slot="reasoning-steps" className={cn('py-1', className)}>

        <div className="flex items-center gap-1">

          <AnimatePresence>
            {!settled && (
              <motion.span
                key="loader"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15, ease: EASE }}
                className="flex size-5 shrink-0 items-center justify-center"
              >

                <Orb
                  key={variant}
                  variant={variant}
                  label={label}
                  className="text-muted-foreground"
                />
              </motion.span>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 6, filter: 'blur(2px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -6, filter: 'blur(2px)' }}
              transition={{ duration: 0.15, ease: EASE }}
              className="text-sm font-medium"
            >
              {settled ? (
                reasoning.length > 0 ? (

                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setOpen((was) => !was)}
                    className="-mx-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 text-foreground transition-ring outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Thought
                    <span className="font-normal text-muted-foreground">for {took}s</span>
                    <ChevronDown className={cn(
                                                              'size-4 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none',
                                                              open && 'rotate-180',
                                                            )} />
                  </button>
                ) : (

                  <span className="inline-flex items-center gap-0.5 text-foreground">
                    Thought
                    <span className="font-normal text-muted-foreground">for {took}s</span>
                    <ChevronRight className="size-4 text-muted-foreground rtl:-scale-x-100" />
                  </span>
                )
              ) : (

                <TextShimmer duration={0.7}>{label}</TextShimmer>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <AnimatePresence mode="wait">
          {showSources && !settled && shown === 0 ? (
            <motion.ul
              key="sources"
              variants={LIST}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="mt-2 flex flex-wrap gap-2"
            >
              {sources.map((source) => (
                <motion.li
                  key={source.label}
                  variants={PILL}
                  custom={side}

                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] text-foreground"
                >
                  <img src={source.icon} alt="" className="h-3.5 w-auto" />
                  {source.label}
                </motion.li>
              ))}
            </motion.ul>
          ) : shown > 0 && open ? (

            <motion.div
              key="reasoning"
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="overflow-hidden"
            >
              <div
                ref={scroller}

                tabIndex={scrolls ? 0 : undefined}
                role={scrolls ? 'region' : undefined}
                aria-label={scrolls ? 'Reasoning' : undefined}
                style={{
                  maxHeight: REASON_MAX,
                  ...(mask && { maskImage: mask, WebkitMaskImage: mask }),
                }}
                className={cn(

                  'mt-2 scrollbar-none space-y-2 overflow-y-auto rounded-md pb-4 text-sm leading-relaxed text-muted-foreground transition-ring outline-none focus-visible:ring-2 focus-visible:ring-ring',
                )}
              >
                {reasoning.slice(0, shown).map((line, index) => (

                  <motion.p
                    key={index}

                    dir="auto"
                    initial={{ opacity: 0, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.35, ease: EASE }}
                  >
                    {line}
                  </motion.p>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MotionConfig>
  )
}

const LIST = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
  exit: { transition: { staggerChildren: 0.04, staggerDirection: -1 } },
}

const PILL = {
  hidden: (side: number) => ({ opacity: 0, filter: 'blur(4px)', x: -10 * side }),
  visible: {
    opacity: 1,
    filter: 'blur(0px)',
    x: 0,
    transition: { duration: 0.35, ease: EASE },
  },
  exit: { opacity: 0, filter: 'blur(4px)', transition: { duration: 0.25, ease: EASE } },
}

export { ReasoningSteps, type ReasoningStepsSource }
