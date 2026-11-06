import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'

import { TextMorph } from 'torph/react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/flow/ui/collapsible'
import { StatusBadge } from '@/components/flow/ui/spinner'
import { TextShimmer } from '@/components/flow/ui/text-shimmer'
import { cn } from '@/lib/flow/utils'

export type TaskState = 'pending' | 'active' | 'done'

export type Task = {
  id: string
  label: string
  state: TaskState

  progress?: number
}

const MARK_SIZE = { '--check-size': '14px', '--check-pop-scale': '1.2' } as CSSProperties

const CHECK = 'M4.8 8.4 7.04 10.8 11.52 6.0'
const ARROW = 'M5.5 8h5M8.6 6.1 10.5 8 8.6 9.9'

const MARK_LABEL: Record<TaskState, string> = {
  pending: 'Not started',
  active: 'In progress',
  done: 'Done',
}

const RING_R = 8 - 1.25 / 2
const RING_W = 1.25
const CHECK_W = 1.75

const MARK_TONE: Record<TaskState, string> = {
  pending: 'text-muted-foreground/60',
  active: 'text-foreground',
  done: 'text-(--task-done)',
}

const SHIMMER = 1.35

const DONUT_W = 1.75
const DONUT_R = 8 - DONUT_W / 2
const DONUT_C = 2 * Math.PI * DONUT_R

const swapMs = () =>
  Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--text-swap-dur'),
  ) || 150

const COUNT_MS = 220

type Phase = 'rest' | 'exit' | 'enter'

const DONE_LINE = 'All tasks complete'

function TaskDonut({ done, total }: { done: number; total: number }) {
  const filled = total > 0 ? done / total : 0

  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      data-state={total > 0 && done === total ? 'done' : 'pending'}
      className="task-glyph absolute inset-0 size-3.5"
    >

      <circle
        cx="8"
        cy="8"
        r={DONUT_R}
        strokeWidth={DONUT_W}
        className="stroke-muted-foreground/45"
      />

      <circle
        className="task-donut stroke-foreground"
        cx="8"
        cy="8"
        r={DONUT_R}
        strokeWidth={DONUT_W}
        strokeLinecap={filled > 0 ? 'round' : 'butt'}
        strokeDasharray={DONUT_C}
        strokeDashoffset={DONUT_C * (1 - filled)}
        transform="rotate(-90 8 8)"
      />
    </svg>
  )
}

function TaskSpin({ state }: { state: TaskState }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      aria-hidden
      data-state={state}
      className={cn(
        'task-glyph absolute inset-0 size-3.5',
        state === 'active' ? 'text-foreground' : 'text-muted-foreground/60',
      )}
    >
      <circle className="task-spin" cx="8" cy="8" r={RING_R} strokeDasharray="1.2 2" />
    </svg>
  )
}

function TaskMark({ state, className }: { state: TaskState; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={MARK_LABEL[state]}
      data-state={state}
      className={cn('task-mark size-3.5 shrink-0', MARK_TONE[state], className)}
    >

      <circle className="task-ring-open" cx="8" cy="8" r={RING_R} strokeDasharray="1.2 2" />
      <circle className="task-ring" cx="8" cy="8" r={RING_R} />

      <circle
        className="task-fill"
        cx="8"
        cy="8"
        r={RING_R + RING_W / 2}
        fill="currentColor"
        stroke="none"
      />
      <path className="task-check" d={CHECK} strokeWidth={CHECK_W} />
    </svg>
  )
}

type Spot = { x: number; y: number; slide: boolean; gone: boolean }

function TaskCursor({ at }: { at: Spot }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-slide={at.slide || undefined}
      data-gone={at.gone || undefined}

      style={{ translate: `${at.x}px ${at.y}px` }}
      className="task-cursor absolute top-0 left-0 size-3.5 text-foreground"
    >
      <path d={ARROW} />
    </svg>
  )
}

const LINE_DROP = 3

const shareText = (value: number) => `${String(Math.round(Math.min(1, Math.max(0, value)) * 100))}%`

function TaskShare({ at, value }: { at: Spot; value: number }) {
  const text = shareText(value)
  const sizer = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState<number>()

  useLayoutEffect(() => {
    const box = sizer.current?.getBoundingClientRect().width
    if (box !== undefined) setWidth(box)
  }, [text])

  return (
    <span
      aria-hidden
      data-slide={at.slide || undefined}
      data-gone={at.gone || undefined}
      style={{ translate: `0 ${at.y - LINE_DROP}px` }}
      className="task-share absolute end-3.5 top-0 rounded-full bg-muted px-1.5 text-xs leading-5 text-muted-foreground tabular-nums"
    >

      <span dir="ltr" className="task-share-box relative block" style={{ width }}>
        <span ref={sizer} className="invisible absolute">
          {text}
        </span>
        <TextMorph>{text}</TextMorph>
      </span>
    </span>
  )
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

function subscribeToMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches
const noMotionPreference = () => false

const useReducedMotion = () =>
  useSyncExternalStore(subscribeToMotion, prefersReducedMotion, noMotionPreference)

export function TaskList({
  tasks,
  title = 'Tasks',
  defaultOpen = true,
  strike = true,
  className,
}: {
  tasks: readonly Task[]
  title?: string
  defaultOpen?: boolean
  /** Draw a line through finished tasks. Off when a finished task is still worth reading. */
  strike?: boolean
  className?: string
}) {
  const still = useReducedMotion()
  const [open, setOpen] = useState(defaultOpen)

  const done = tasks.filter((task) => task.state === 'done').length
  const activeAt = tasks.findIndex((task) => task.state === 'active')
  const active = activeAt === -1 ? undefined : tasks[activeAt]

  const complete = tasks.length > 0 && done === tasks.length

  const headline = open ? title : complete ? DONE_LINE : (active?.label ?? title)

  const line = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(headline)
  const [phase, setPhase] = useState<Phase>('rest')

  useEffect(() => {
    if (shown === headline) return
    if (still) {
      setShown(headline)
      return
    }
    setPhase('exit')
    const timer = window.setTimeout(() => {
      setShown(headline)
      setPhase('enter')
    }, swapMs())
    return () => window.clearTimeout(timer)
  }, [headline, shown, still])

  useLayoutEffect(() => {
    if (phase !== 'enter') return
    void line.current?.offsetHeight
    setPhase('rest')
  }, [phase])

  const shimmering = !still && shown !== title && shown !== DONE_LINE

  const rows = useRef<HTMLUListElement>(null)
  const [cursor, setCursor] = useState<Spot | null>(null)
  const activeShare = tasks[activeAt]?.progress
  const reports = tasks.some((task) => task.progress !== undefined)

  useLayoutEffect(() => {
    const list = rows.current
    const mark = list?.children[activeAt]?.firstElementChild
    if (!list || !mark) {

      setCursor((was) => (was === null ? null : { ...was, gone: true }))
      return
    }
    const measure = () => {
      const box = list.getBoundingClientRect()
      const at = mark.getBoundingClientRect()
      return {
        x: at.left - box.left - list.clientLeft,
        y: at.top - box.top - list.clientTop,
      }
    }

    setCursor((was) => ({ ...measure(), slide: was !== null && !was.gone, gone: false }))

    const watch = new ResizeObserver(() =>
      setCursor((was) => {
        if (was === null) return null
        const to = measure()
        return was.x === to.x && was.y === to.y ? was : { ...was, ...to }
      }),
    )
    watch.observe(list)
    return () => watch.disconnect()
  }, [activeAt, open, tasks.length])

  return (
    <Collapsible
      data-slot="task-list"
      open={open}
      onOpenChange={setOpen}
      className={cn('w-full rounded-xl border bg-card text-card-foreground', className)}
    >

      <CollapsibleTrigger className="group/task-header flex w-full cursor-pointer items-start gap-3 rounded-xl px-3.5 py-3 text-start transition-ring outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="relative mt-[3px] block size-3.5 shrink-0" style={MARK_SIZE}>

          {open ? (
            <TaskDonut done={done} total={tasks.length} />
          ) : (
            <TaskSpin state={complete ? 'done' : active ? 'active' : 'pending'} />
          )}

          {tasks.length === 0 ? null : (
            <span
              data-state={complete ? 'done' : 'loading'}
              className="task-badge absolute inset-0 flex"
            >
              <StatusBadge state={complete ? 'done' : 'loading'} />
            </span>
          )}
        </span>

        <span className="block h-5 min-w-0 flex-1">
          <span
            ref={line}
            className={cn(
              't-text-swap max-w-full truncate align-top text-sm leading-5 font-semibold text-foreground',
              phase === 'exit' && 'is-exit',
              phase === 'enter' && 'is-enter-start',
            )}
          >
            {shimmering ? <TextShimmer duration={SHIMMER}>{shown}</TextShimmer> : shown}
          </span>
        </span>

        <span
          className={cn(
            'flex shrink-0 items-center gap-1 text-sm leading-5 tabular-nums transition-colors',
            complete ? 'text-foreground' : 'text-muted-foreground',
          )}
        >

          <span dir="ltr">
            <TextMorph
              numbers
              duration={COUNT_MS}
              ease="cubic-bezier(0.22, 1, 0.36, 1)"

              scale={false}
            >
              {done}
            </TextMorph>
            /{tasks.length}
          </span>

          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            data-open={open || undefined}
            className="task-chevron size-3.5"
          >
            <path d="m4.5 6.25 3.5 3.5 3.5-3.5" />
          </svg>
        </span>
      </CollapsibleTrigger>

      <CollapsibleContent className="collapsible-resize overflow-hidden">

        <ul ref={rows} className={cn('relative -mt-1 px-3.5 pb-2', reports && 'pe-14')}>
          {tasks.map((task) => (
            <li key={task.id} className="flex items-start gap-3 py-[3px]">

              <TaskMark state={task.state} className="mt-[3px]" />

              <span
                data-state={task.state}
                className={cn(
                  'task-label relative w-fit text-sm leading-5',
                  task.state === 'active'
                    ? 'text-foreground'
                    : task.state === 'done'
                      ? 'text-(--task-done)'
                      : 'text-muted-foreground',
                )}
              >
                {task.state === 'active' && !still ? (
                  <TextShimmer duration={SHIMMER}>{task.label}</TextShimmer>
                ) : (
                  task.label
                )}

                {strike ? <span aria-hidden className="task-strike" /> : null}
              </span>

              {task.state === 'active' && task.progress !== undefined ? (
                <span className="sr-only">{shareText(task.progress)} complete</span>
              ) : null}
            </li>
          ))}
          {cursor === null ? null : <TaskCursor at={cursor} />}
          {cursor === null || activeShare === undefined ? null : (
            <TaskShare at={cursor} value={activeShare} />
          )}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
