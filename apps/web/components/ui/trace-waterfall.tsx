'use client'

import * as React from 'react'
import { Popover as PopoverPrimitive } from '@base-ui/react/popover'
import { useDirection } from '@base-ui/react/direction-provider'
import { ScrollArea as ScrollAreaPrimitive } from '@base-ui/react/scroll-area'
import { AnimatePresence, motion } from 'motion/react'
import { TextMorph } from 'torph/react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { TextShimmer } from '@/components/ui/text-shimmer'
import {
  Caption,
  createTooltipHandle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipViewport,
} from '@/components/ui/tooltip'
import { useResizeGrip } from '@/hooks/use-resize-grip'
import { joinsLetters } from '@/lib/joined-script'
import { cn } from '@/lib/utils'
import { CornerDownRight, X, Search, Network, SearchX, RotateCw, ChevronDown, TriangleAlert } from "lucide-react"

export type TraceSpanKind = 'agent' | 'llm' | 'tool'

export type TraceSpan = {
  id: string
  name: string

  detail?: string
  icon?: React.ReactNode
  kind: TraceSpanKind

  start: number

  end?: number

  cost?: number
  tokens?: number

  tokensIn?: number
  tokensOut?: number

  input?: string
  output?: string
  error?: boolean

  reason?: string

  retry?: boolean

  color?: string
  children?: Array<TraceSpan>
}

const HEADROOM = 1.22
const LABEL_ROOM = 120
const MARK_ROOM = 72

const LABEL_MIN = 140
const TIMELINE_MIN = 180
const MIN_DOMAIN = 9
const STEPS = [1, 2, 5, 10, 15, 20, 30, 60, 120, 300, 600]
const INDENT = 20

const formatSeconds = (s: number) => (s < 10 ? `${s.toFixed(1)}s` : `${String(Math.round(s))}s`)
const formatCost = (c: number) => `$${c < 0.01 && c > 0 ? c.toFixed(3) : c.toFixed(2)}`
const formatTokens = (t: number) =>
  t >= 1000 ? `${(t / 1000).toFixed(1)}k` : String(Math.round(t))

function walk(spans: Array<TraceSpan>, visit: (span: TraceSpan) => void) {
  for (const span of spans) {
    visit(span)
    if (span.children) walk(span.children, visit)
  }
}

const sumOf = (span: TraceSpan, read: (span: TraceSpan) => number): number =>
  read(span) + (span.children ?? []).reduce((sum, child) => sum + sumOf(child, read), 0)

const spansUnder = (span: TraceSpan): number =>
  (span.children ?? []).reduce((sum, child) => sum + 1 + spansUnder(child), 0)

const spentBy = (span: TraceSpan): number =>
  (span.cost ?? 0) + (span.children ?? []).reduce((sum, child) => sum + spentBy(child), 0)

const stepFor = (domain: number) => STEPS.find((step) => domain / step <= 5) ?? STEPS.at(-1)!

const PALETTE = ['#5b9cf6', '#a35ee8', '#e07b1a', '#2fa868', '#e2559a', '#22b3a6']
const NEUTRAL = 'var(--foreground)'

type Tone = 'llm' | 'tool' | 'gap' | 'wait' | 'error' | 'retry'
type Segment = { key: string; start: number; end: number | 'now'; tone: Tone; running: boolean }

function toneStyle(tone: Tone, tint: string): React.CSSProperties {
  const neutral = tint === NEUTRAL
  const mix = (share: number) =>
    `color-mix(in oklab, ${tint} ${String(neutral ? share * 0.45 : share)}%, var(--card))`
  if (tone === 'error')
    return {
      background: 'var(--destructive)',
    }
  if (tone === 'wait')
    return {
      background:
        'repeating-linear-gradient(-45deg, color-mix(in oklab, var(--foreground) 22%, transparent) 0 1px, transparent 1px 6px)',
      boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--foreground) 22%, transparent)',
      '--trace-glow': 'color-mix(in oklab, var(--foreground) 30%, transparent)',
    } as React.CSSProperties
  const fill = mix(tone === 'llm' || tone === 'retry' ? 100 : tone === 'tool' ? 50 : 24)

  const glow = neutral
    ? `color-mix(in oklab, ${fill} 45%, white)`
    : `color-mix(in oklab, ${tint} 70%, white)`
  return { background: fill, '--trace-glow': glow } as React.CSSProperties
}

const toneOf = (span: TraceSpan): Tone =>
  span.error ? 'error' : span.retry ? 'retry' : span.kind === 'llm' ? 'llm' : 'tool'

function laneOf(agent: TraceSpan, now: number): Array<Segment> {
  const until = agent.end ?? now
  const children = agent.children ?? []
  const calls = children
    .filter((child) => child.kind !== 'agent')
    .toSorted((a, b) => a.start - b.start)
  const waits = children.filter((child) => child.kind === 'agent')
  const segments: Array<Segment> = []
  const fill = (from: number, to: number) => {

    const marks = new Set([from, to])
    for (const wait of waits) {
      const a = Math.max(from, wait.start)
      const b = Math.min(to, wait.end ?? now)
      if (b > a) {
        marks.add(a)
        marks.add(b)
      }
    }
    const points = [...marks].toSorted((a, b) => a - b)
    for (let index = 0; index < points.length - 1; index++) {
      const a = points[index]!
      const b = points[index + 1]!
      if (b - a < 0.15) continue
      const waiting = waits.some((wait) => wait.start <= a && (wait.end ?? now) >= b)
      const last = b === until && agent.end === undefined
      segments.push({
        key: `${String(a)}`,
        start: a,
        end: last ? 'now' : b,
        tone: waiting ? 'wait' : 'gap',
        running: last,
      })
    }
  }
  let cursor = agent.start
  for (const call of calls) {
    const start = Math.max(call.start, cursor)
    if (start > cursor) fill(cursor, start)
    const end = call.end ?? now
    if (end <= start) continue
    segments.push({
      key: call.id,
      start,
      end: call.end ?? 'now',
      tone: toneOf(call),
      running: call.end === undefined,
    })
    cursor = end
  }
  if (until > cursor) fill(cursor, until)
  return segments
}

type Link = { id: string; parent: string; start: number; end: number | undefined; tint: string }

const ELBOW = 6
const LANE_HALF = 10

const at = (seconds: number | string) =>
  `calc((${String(seconds)} - var(--trace-start)) / var(--trace-domain) * 100%)`
const across = (seconds: number | string) => `calc(${String(seconds)} / var(--trace-domain) * 100%)`

type View = { start: number; span: number }

const MIN_SPAN = 1.5
const ZOOM_MS = 260
const WHEEL_CAP = 40
const WHEEL_ZOOM = 0.006

function viewStore() {
  let view: View | null = null
  const listeners = new Set<() => void>()
  return {
    get: () => view,
    set(next: View | null) {
      view = next
      for (const listener of listeners) listener()
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

type ViewStore = ReturnType<typeof viewStore>

function ticksFor(view: View) {
  const step = stepFor(view.span)
  const ticks: Array<number> = []
  for (
    let tick = Math.ceil(view.start / step) * step;
    tick < view.start + view.span * 0.94;
    tick += step
  )
    ticks.push(Math.round(tick * 1000) / 1000)
  return ticks.join(',')
}

type Tick = { at: number; leaving: boolean }

const ticksOf = (key: string) => (key ? key.split(',').map(Number) : [])

function TraceTicks({ store, fit, labels }: { store: ViewStore; fit: View; labels: boolean }) {
  const snapshot = () => ticksFor(store.get() ?? fit)
  const key = React.useSyncExternalStore(store.subscribe, snapshot, snapshot)
  const [seen, setSeen] = React.useState(key)
  const [ticks, setTicks] = React.useState<Array<Tick>>(() =>
    ticksOf(key).map((at) => ({ at, leaving: false })),
  )
  if (seen !== key) {
    setSeen(key)
    const now = new Set(ticksOf(key))
    const kept = ticks.map((tick) => ({ at: tick.at, leaving: !now.has(tick.at) }))
    const known = new Set(kept.map((tick) => tick.at))
    setTicks(
      [
        ...kept,
        ...[...now].filter((at) => !known.has(at)).map((at) => ({ at, leaving: false })),
      ].toSorted((a, b) => a.at - b.at),
    )
  }

  React.useEffect(() => {
    if (!ticks.some((tick) => tick.leaving)) return
    const timer = window.setTimeout(
      () => setTicks((all) => all.filter((tick) => !tick.leaving)),
      240,
    )
    return () => window.clearTimeout(timer)
  }, [ticks])
  return ticks.map((tick) =>
    labels ? (
      <span
        key={tick.at}
        className={cn(
          'absolute top-1/2 -translate-y-1/2 ps-2 text-xs text-muted-foreground transition-[opacity,filter] duration-200 ease-out motion-reduce:transition-[opacity] starting:opacity-0 starting:blur-[2px]',
          tick.leaving && 'opacity-0 blur-[2px]',
        )}
        style={{ left: at(tick.at) }}
      >
        {String(tick.at)}s
      </span>
    ) : (
      <span
        key={tick.at}
        className={cn(
          'absolute inset-y-0 w-px bg-border transition-opacity duration-200 ease-out starting:opacity-0',
          tick.leaving && 'opacity-0',
        )}
        style={{ left: at(tick.at) }}
      />
    ),
  )
}

const TraceScale = React.createContext<{ store: ViewStore; fit: View } | null>(null)

const TraceQuery = React.createContext('')

const TraceHold = React.createContext<(open: boolean, row?: HTMLElement | null) => void>(() => {})

const hit = (text: string | undefined, query: string) =>
  text !== undefined && text.toLocaleLowerCase().includes(query)

const keeps = (span: TraceSpan, query: string): boolean =>
  !query ||
  hit(span.name, query) ||
  hit(span.detail, query) ||
  (span.children ?? []).some((child) => keeps(child, query))

function Marked({ text }: { text: string }) {
  const query = React.useContext(TraceQuery)
  if (!query) return text
  const lower = text.toLocaleLowerCase()
  const parts: Array<React.ReactNode> = []
  let from = 0
  for (let at = lower.indexOf(query); at !== -1; at = lower.indexOf(query, from)) {
    if (at > from) parts.push(text.slice(from, at))
    parts.push(
      <mark
        key={at}
        className="rounded-[3px] bg-(--badge-amber-bg) [box-decoration-break:clone] text-(--badge-amber-fg)"
      >
        {text.slice(at, at + query.length)}
      </mark>,
    )
    from = at + query.length
  }
  parts.push(text.slice(from))
  return parts
}

const FIGURE_PACE_MS = 700

function PacedFigure({ value }: { value: string }) {
  const [figure, setFigure] = React.useState(value)
  const last = React.useRef(0)
  React.useEffect(() => {
    if (value === figure) return
    const timer = window.setTimeout(
      () => {
        last.current = performance.now()
        setFigure(value)
      },
      Math.max(0, last.current + FIGURE_PACE_MS - performance.now()),
    )
    return () => window.clearTimeout(timer)
  }, [value, figure])
  return (
    <TextMorph numbers duration={220} ease="cubic-bezier(0.22, 1, 0.36, 1)" scale={false}>
      {figure}
    </TextMorph>
  )
}

const SPEEDS = [
  { value: '0.5', label: '0.5x' },
  { value: '1', label: '1x' },
  { value: '1.5', label: '1.5x' },
  { value: '2', label: '2x' },
  { value: '4', label: '4x' },
]

const PLAY_PAUSE = {
  left: {
    play: 'M 7.5,4.5 L 13,8.25 L 13,15.75 L 7.5,19.5 Z',
    pause: 'M 6.5,5.5 L 9.5,5.5 L 9.5,18.5 L 6.5,18.5 Z',
  },
  right: {
    play: 'M 13,8.25 L 18.5,12 L 18.5,12 L 13,15.75 Z',
    pause: 'M 14.5,5.5 L 17.5,5.5 L 17.5,18.5 L 14.5,18.5 Z',
  },
}

function PlayPauseIcon({ playing }: { playing: boolean }) {
  const state = playing ? 'pause' : 'play'
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      {[PLAY_PAUSE.left[state], PLAY_PAUSE.right[state]].map((d, index) => (
        <path
          key={index}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinejoin="round"
          className="[transition:d_200ms_cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
          style={{ d: `path("${d}")` }}
        />
      ))}
    </svg>
  )
}

const LEGEND: Array<[string, React.ReactNode]> = [
  ['Model call', <span className="h-2.5 w-4 rounded-[3px]" style={toneStyle('llm', NEUTRAL)} />],
  ['Tool call', <span className="h-2.5 w-4 rounded-[3px]" style={toneStyle('tool', NEUTRAL)} />],
  ['Waiting', <span className="h-2.5 w-4 rounded-[3px]" style={toneStyle('wait', NEUTRAL)} />],
  ['Handoff', <CornerDownRight className="size-3.5 text-muted-foreground" strokeWidth={1.8} />],
  [
    'Failed',
    <span className="flex h-2.5 w-4 items-center justify-center rounded-[3px] bg-destructive">
      <X className="size-2.5 text-destructive-foreground" strokeWidth={3.5} />
    </span>,
  ],
]

function TraceWaterfall({
  spans,
  now,
  playing,
  onPlayingChange,
  onRestart,
  speed = 1,
  onSpeedChange,
  className,
  style,
  ...props
}: React.ComponentProps<'div'> & {
  spans: Array<TraceSpan>

  now: number

  playing?: boolean
  onPlayingChange?: (playing: boolean) => void
  onRestart?: () => void
  speed?: number
  onSpeedChange?: (speed: number) => void
}) {
  const timeline = React.useRef<HTMLSpanElement>(null)
  const [width, setWidth] = React.useState(0)
  React.useLayoutEffect(() => {
    const node = timeline.current
    if (!node) return
    const measure = () => setWidth(node.clientWidth)
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(node)
    return () => watch.disconnect()
  }, [])

  const body = React.useRef<HTMLDivElement>(null)
  const [query, setQuery] = React.useState('')
  const [tip] = React.useState(() => createTooltipHandle<string>())
  const field = React.useRef<HTMLInputElement>(null)
  const needle = query.trim().toLocaleLowerCase()
  const missing = needle !== '' && !spans.some((span) => keeps(span, needle))

  const [missed, setMissed] = React.useState('')
  if (missing && missed !== query.trim()) setMissed(query.trim())

  React.useEffect(() => {
    const press = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'f' || !(event.metaKey || event.ctrlKey) || event.altKey)
        return
      const node = root.current
      if (!node || !(node.matches(':hover') || node.contains(document.activeElement))) return
      event.preventDefault()
      field.current?.focus()
      field.current?.select()
    }
    window.addEventListener('keydown', press)
    return () => window.removeEventListener('keydown', press)
  }, [])
  const scroller = React.useRef<HTMLDivElement>(null)
  const badge = React.useRef<HTMLSpanElement>(null)
  const placed = React.useRef<{ id: string; x: number; y: number } | null>(null)

  let running = false
  let duration = 0
  let tokens = 0
  let cost = 0
  let llm = 0
  let tool = 0
  let errors = 0

  let slowest: TraceSpan | null = null
  let finishedCalls = 0
  walk(spans, (span) => {
    if (span.end === undefined) running = true
    duration = Math.max(duration, span.end ?? now)
    tokens += span.tokens ?? (span.tokensIn ?? 0) + (span.tokensOut ?? 0)
    cost += span.cost ?? 0
    if (span.kind === 'llm') llm += 1
    if (span.kind === 'tool') tool += 1
    if (span.error) errors += 1
    if (span.kind !== 'agent' && span.end !== undefined) {
      finishedCalls += 1
      if (!slowest || span.end - span.start > (slowest.end ?? 0) - slowest.start) slowest = span
    }
  })
  const tints = new Map<string, string>()
  const links: Array<Link> = []
  let hue = 0
  const color = (list: Array<TraceSpan>, parent: TraceSpan | null) => {
    for (const span of list) {
      if (span.kind === 'agent') {
        tints.set(span.id, span.color ?? (parent ? PALETTE[hue++ % PALETTE.length]! : NEUTRAL))
        if (parent)
          links.push({
            id: span.id,
            parent: parent.id,
            start: span.start,
            end: span.end,
            tint: tints.get(span.id)!,
          })
      }
      if (span.children) color(span.children, span.kind === 'agent' ? span : parent)
    }
  }
  color(spans, null)

  const live = running || spans.length === 0
  if (live) duration = Math.max(duration, now)
  const headroom =
    width > 0
      ? Math.min(
          1.55,
          Math.max(HEADROOM, width / Math.max(width - LABEL_ROOM - MARK_ROOM, width * 0.35)),
        )
      : HEADROOM
  const domain = Math.max(MIN_DOMAIN, duration * headroom)
  const fit: View = { start: 0, span: domain }

  const root = React.useRef<HTMLDivElement>(null)
  const fitRef = React.useRef(fit)
  fitRef.current = fit

  const viewRef = React.useRef<View | null>(null)
  const [store] = React.useState(viewStore)
  const [zoomed, setZoomed] = React.useState(false)
  const tween = React.useRef(0)
  const layoutRef = React.useRef<() => void>(() => {})
  React.useEffect(() => () => cancelAnimationFrame(tween.current), [])

  const clampView = React.useCallback((next: View): View | null => {
    const whole = fitRef.current.span
    const span = Math.min(whole, Math.max(MIN_SPAN, next.span))
    if (span >= whole * 0.999) return null
    return { start: Math.min(whole - span, Math.max(0, next.start)), span }
  }, [])

  const nowRef = React.useRef(now)
  nowRef.current = now
  const paintScale = React.useCallback(() => {
    const node = root.current
    if (!node) return
    const view = viewRef.current ?? fitRef.current
    const values = [
      ['--trace-start', String(view.start)],
      ['--trace-domain', String(view.span)],
      ['--trace-whole', String(fitRef.current.span)],
      ['--trace-now', String(nowRef.current)],
    ] as const
    for (const placed of node.querySelectorAll<HTMLElement>('[data-trace-scale]'))
      for (const [name, value] of values) placed.style.setProperty(name, value)
  }, [])

  const apply = React.useCallback(
    (next: View | null) => {
      viewRef.current = next
      const node = root.current
      store.set(next)
      layoutRef.current()

      if (node?.querySelector('.trace-bar-trigger[data-popup-open]'))
        window.dispatchEvent(new Event('resize'))
      setZoomed(next !== null)
    },
    [store],
  )

  const glideTo = React.useCallback(
    (target: View | null) => {
      cancelAnimationFrame(tween.current)
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        apply(target)
        return
      }
      const from = viewRef.current ?? fitRef.current
      const began = performance.now()
      const step = (time: number) => {
        const progress = Math.min(1, (time - began) / ZOOM_MS)
        const eased = 1 - (1 - progress) ** 3
        const to = target ?? fitRef.current
        if (progress >= 1) {
          apply(target)
          return
        }
        apply({
          start: from.start + (to.start - from.start) * eased,
          span: from.span + (to.span - from.span) * eased,
        })
        tween.current = requestAnimationFrame(step)
      }
      tween.current = requestAnimationFrame(step)
    },
    [apply],
  )

  const direction = useDirection()
  const resizeTo = (next: number | null) => {
    const node = body.current
    if (!node) return
    if (next === null) node.style.removeProperty('--trace-label')
    else {
      const most = node.clientWidth - TIMELINE_MIN
      node.style.setProperty(
        '--trace-label',
        `${String(Math.round(Math.max(LABEL_MIN, Math.min(most, next))))}px`,
      )
    }
    layoutRef.current()
  }
  const labelWidth = () =>
    body.current?.querySelector<HTMLElement>('[data-slot="trace-waterfall-label"]')?.offsetWidth ??
    0

  const { ref: labelEdge, ...grip } = useResizeGrip('start')
  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    grip.handlers.onPointerDown(event)
    const node = body.current
    if (event.button !== 0 || !node) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const edge = node.getBoundingClientRect()
    const move = (next: PointerEvent) =>
      resizeTo(direction === 'rtl' ? edge.right - next.clientX : next.clientX - edge.left)
    const target = event.currentTarget
    const end = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', end)
      target.removeEventListener('pointercancel', end)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', end)
    target.addEventListener('pointercancel', end)
  }
  const onResizeKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const grow = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
    const shrink = direction === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
    if (event.key !== grow && event.key !== shrink) return
    event.preventDefault()
    resizeTo(labelWidth() + (event.key === grow ? 16 : -16))
  }

  const onThumbDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const track = event.currentTarget.parentElement
    const from = viewRef.current
    if (event.button !== 0 || !track || !from) return
    event.preventDefault()
    event.stopPropagation()
    cancelAnimationFrame(tween.current)
    const thumb = event.currentTarget
    thumb.setPointerCapture(event.pointerId)
    const x = event.clientX
    const move = (next: PointerEvent) =>
      apply(
        clampView({
          start: from.start + ((next.clientX - x) / track.clientWidth) * fitRef.current.span,
          span: from.span,
        }),
      )
    const end = () => {
      thumb.removeEventListener('pointermove', move)
      thumb.removeEventListener('pointerup', end)
      thumb.removeEventListener('pointercancel', end)
    }
    thumb.addEventListener('pointermove', move)
    thumb.addEventListener('pointerup', end)
    thumb.addEventListener('pointercancel', end)
  }
  const onTrackDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = viewRef.current
    if (event.button !== 0 || !from) return
    const track = event.currentTarget.getBoundingClientRect()
    const moment = ((event.clientX - track.left) / track.width) * fitRef.current.span
    glideTo(clampView({ start: moment - from.span / 2, span: from.span }))
  }

  React.useEffect(() => {
    const node = body.current
    if (!node) return
    let zoom = 0
    let pan = 0
    let ratio = 0
    let frame = 0
    const flush = () => {
      frame = 0
      const axis = timeline.current?.getBoundingClientRect()
      if (!axis) return
      let next = viewRef.current ?? fitRef.current
      if (zoom !== 0) {
        const span = next.span * Math.exp(zoom)
        next = { start: next.start + ratio * (next.span - span), span }
      }
      if (pan !== 0) next = { start: next.start + (pan / axis.width) * next.span, span: next.span }
      zoom = 0
      pan = 0
      apply(clampView(next))
    }
    const onWheel = (event: WheelEvent) => {
      const axis = timeline.current?.getBoundingClientRect()
      if (!axis || event.clientX < axis.left || event.clientX > axis.right) return
      const lines = event.deltaMode === 1 ? 16 : 1
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        cancelAnimationFrame(tween.current)
        const delta = Math.max(-WHEEL_CAP, Math.min(WHEEL_CAP, event.deltaY * lines))
        zoom += delta * WHEEL_ZOOM
        ratio = (event.clientX - axis.left) / axis.width
      } else {
        const sideways =
          Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.shiftKey
              ? event.deltaY
              : 0
        if (viewRef.current === null || sideways === 0) return
        event.preventDefault()
        cancelAnimationFrame(tween.current)
        pan += sideways * lines
      }
      frame ||= requestAnimationFrame(flush)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      node.removeEventListener('wheel', onWheel)
      cancelAnimationFrame(frame)
    }
  }, [apply, clampView])

  const scale = React.useMemo(() => ({ store, fit: { start: 0, span: domain } }), [store, domain])
  const flagged = finishedCalls >= 4 ? (slowest as TraceSpan | null)?.id : undefined

  const flaggedRef = React.useRef(flagged)
  flaggedRef.current = flagged
  const linksRef = React.useRef(links)
  linksRef.current = links
  const wires = React.useRef<SVGSVGElement>(null)
  const drawn = React.useRef(new Map<string, SVGElement>())
  const list = React.useRef<HTMLUListElement>(null)

  const parking = React.useRef(0)
  const glide = React.useRef<{ x: number; y: number; began: number } | null>(null)
  const gliding = React.useRef(0)
  const shown = React.useRef({ x: 0, y: 0 })
  const placeRef = React.useRef<() => void>(() => {})
  const place = React.useCallback(() => {
    const box = scroller.current
    const mark = badge.current
    if (!box || !mark) return
    const hide = () => {
      delete mark.dataset.shown
      if (parking.current) return
      parking.current = window.setTimeout(() => {
        parking.current = 0
        mark.style.translate = '0px 0px'
        placed.current = null
        glide.current = null
        shown.current = { x: 0, y: 0 }
      }, 200)
    }
    const edge = box.getBoundingClientRect()
    const scale = edge.width / box.offsetWidth || 1
    const wide = mark.offsetWidth * scale

    const spot = (id: string | undefined) => {
      const figure = id
        ? box.querySelector<HTMLElement>(`[data-trace-figure="${CSS.escape(id)}"]`)
        : null
      const row = figure?.closest<HTMLElement>('[data-slot="trace-row"]')
      if (!figure || !row || figure.closest('[inert]')) return null
      const left = figure.getBoundingClientRect().right + 8
      const lane = row
        .querySelector<HTMLElement>('[data-slot="trace-timeline"]')
        ?.getBoundingClientRect()
      if (lane && (left < lane.left || left + wide > lane.right)) return null
      return { left, line: row.getBoundingClientRect() }
    }

    let id = flaggedRef.current
    let found = spot(id)
    if (!found && placed.current && placed.current.id !== id && id !== undefined) {
      id = placed.current.id
      found = spot(id)
    }
    if (!id || !found) {
      hide()
      return
    }
    const { left, line } = found
    window.clearTimeout(parking.current)
    parking.current = 0
    const x = (left - edge.left) / scale
    const y = (line.top - edge.top + (line.height - mark.offsetHeight * scale) / 2) / scale
    const was = placed.current
    if (was && was.id !== id && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      glide.current = { x: shown.current.x, y: shown.current.y, began: performance.now() }

    let to = { x, y }
    const from = glide.current
    if (from) {
      const progress = Math.min(1, (performance.now() - from.began) / 420)
      const eased = progress < 0.5 ? 4 * progress ** 3 : 1 - (-2 * progress + 2) ** 3 / 2
      to = { x: from.x + (x - from.x) * eased, y: from.y + (y - from.y) * eased }
      if (progress < 1) {
        cancelAnimationFrame(gliding.current)
        gliding.current = requestAnimationFrame(() => placeRef.current())
      } else glide.current = null
    }
    shown.current = to
    mark.style.translate = `${String(to.x)}px ${String(to.y)}px`
    mark.dataset.shown = ''
    placed.current = { id, x, y }
  }, [])
  placeRef.current = place
  React.useEffect(
    () => () => {
      window.clearTimeout(parking.current)
      cancelAnimationFrame(gliding.current)
    },
    [],
  )

  const unpinned = (row: HTMLElement) => {
    const rect = row.getBoundingClientRect()
    if (row.dataset.pinned === undefined || !row.parentElement) return rect
    return new DOMRect(
      rect.left,
      row.parentElement.getBoundingClientRect().top,
      rect.width,
      rect.height,
    )
  }

  const wire = React.useCallback(() => {
    const box = scroller.current
    const svg = wires.current
    if (!box || !svg) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const edge = box.getBoundingClientRect()
    const scale = edge.width / box.offsetWidth || 1
    const rowOf = (id: string) => {
      const row = box.querySelector<HTMLElement>(`[data-trace-id="${CSS.escape(id)}"]`)
      return row && !row.closest('[inert]') ? row : null
    }
    const seen = new Set<string>()
    const make = (key: string, tag: 'path' | 'circle', tint: string, delay: number) => {
      seen.add(key)
      let node = drawn.current.get(key)
      if (node) return { node, fresh: false }
      node = document.createElementNS('http://www.w3.org/2000/svg', tag)
      if (tag === 'path') {
        node.setAttribute('fill', 'none')
        node.setAttribute('stroke', tint)
        node.setAttribute('stroke-width', '1.5')
        node.setAttribute('stroke-linecap', 'round')
      } else {
        node.setAttribute('r', '3.5')
        node.setAttribute('fill', tint)
        node.setAttribute('stroke', 'var(--card)')
        node.setAttribute('stroke-width', '1.5')
        node.style.transformBox = 'fill-box'
        node.style.transformOrigin = 'center'
      }
      svg.appendChild(node)
      drawn.current.set(key, node)
      if (!still) {
        if (tag === 'circle') {
          node.animate(
            [
              { scale: '0', opacity: 0 },
              { scale: '1', opacity: 1 },
            ],
            {
              duration: 220,
              delay,
              easing: 'cubic-bezier(0.23, 1, 0.32, 1)',
              fill: 'backwards',
            },
          )
        }
      }
      return { node, fresh: !still && tag === 'path' }
    }

    const drawOn = (path: SVGPathElement, delay: number) => {
      const length = path.getTotalLength()
      path.style.strokeDasharray = String(length)
      path
        .animate([{ strokeDashoffset: length }, { strokeDashoffset: 0 }], {
          duration: 420,
          delay,
          easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
          fill: 'backwards',
        })
        .finished.then(
          () => {
            path.style.strokeDasharray = ''
          },
          () => {},
        )
    }

    const column = box
      .querySelector<HTMLElement>('[data-slot="trace-timeline"]')
      ?.getBoundingClientRect()
    const shown = viewRef.current ?? fitRef.current
    const lines = linksRef.current.flatMap((link) => {
      const parent = rowOf(link.parent)
      const child = rowOf(link.id)
      const lane = parent?.querySelector<HTMLElement>('[data-slot="trace-timeline"]')
      if (!parent || !child || !lane) return []
      const area = lane.getBoundingClientRect()
      const left = (area.left - edge.left) / scale
      const width = area.width / scale
      const xOf = (seconds: number) => left + ((seconds - shown.start) / shown.span) * width
      const prect = unpinned(parent)
      const crect = unpinned(child)
      return [
        {
          link,
          top: (prect.top - edge.top) / scale + prect.height / scale / 2 + LANE_HALF,
          middle: (crect.top - edge.top) / scale + crect.height / scale / 2,
          xs: Math.max(2, xOf(link.start) - ELBOW),
          xe: link.end === undefined ? 0 : xOf(link.end) + ELBOW,
        },
      ]
    })
    const wide = String(box.offsetWidth)
    const tall = String(box.offsetHeight)
    if (svg.getAttribute('width') !== wide) svg.setAttribute('width', wide)
    if (svg.getAttribute('height') !== tall) svg.setAttribute('height', tall)

    if (column) {
      const from = (column.left - edge.left) / scale
      svg.style.clipPath = `inset(0 ${String(box.offsetWidth - from - column.width / scale)}px 0 ${String(from)}px)`
    }
    for (const { link, top, middle, xs, xe } of lines) {
      const down = make(`${link.id}:in`, 'path', link.tint, 0)
      down.node.setAttribute(
        'd',
        `M${String(xs)} ${String(top)}V${String(middle - ELBOW)}Q${String(xs)} ${String(middle)} ${String(xs + ELBOW)} ${String(middle)}`,
      )
      if (down.fresh) drawOn(down.node as SVGPathElement, 120)
      const from = make(`${link.id}:in-dot`, 'circle', link.tint, 0)
      from.node.setAttribute('cx', String(xs))
      from.node.setAttribute('cy', String(top))
      if (link.end === undefined) continue
      const up = make(`${link.id}:out`, 'path', link.tint, 0)
      up.node.setAttribute(
        'd',
        `M${String(xe - ELBOW)} ${String(middle)}Q${String(xe)} ${String(middle)} ${String(xe)} ${String(middle - ELBOW)}V${String(top)}`,
      )
      if (up.fresh) drawOn(up.node as SVGPathElement, 0)
      const to = make(`${link.id}:out-dot`, 'circle', link.tint, 380)
      to.node.setAttribute('cx', String(xe))
      to.node.setAttribute('cy', String(top))
    }

    for (const [key, node] of drawn.current) node.style.display = seen.has(key) ? '' : 'none'
  }, [])

  const layout = React.useCallback(() => {
    paintScale()
    place()
    wire()
  }, [paintScale, place, wire])

  layoutRef.current = layout
  React.useLayoutEffect(layout)

  React.useLayoutEffect(() => {
    const node = list.current
    if (!node) return
    const watch = new ResizeObserver(layout)
    watch.observe(node)
    return () => watch.disconnect()
  }, [layout])

  const viewport = React.useRef<HTMLDivElement>(null)
  const following = React.useRef(true)
  if (spans.length === 0) following.current = true
  const held = React.useRef(0)

  const pinned = React.useRef<{ row: HTMLElement; top: number } | null>(null)

  const hold = React.useCallback((open: boolean, row?: HTMLElement | null) => {
    held.current = Math.max(0, held.current + (open ? 1 : -1))
    const port = viewport.current
    if (open && row && port)
      pinned.current = {
        row,
        top: row.getBoundingClientRect().top - port.getBoundingClientRect().top,
      }
    if (held.current === 0) pinned.current = null
    if (open || held.current > 0 || !following.current || !port) return
    port.scrollTo({
      top: port.scrollHeight,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    })
  }, [])
  React.useLayoutEffect(() => {
    const node = list.current
    const port = viewport.current
    if (!node || !port) return

    let tall = port.offsetHeight
    const follow = () => {
      const now = port.offsetHeight
      if (tall - now > 72 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        port.animate([{ height: `${String(tall)}px` }, { height: 'auto' }], {
          duration: 360,
          easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
        })
      tall = now

      const pin = pinned.current
      if (pin?.row.isConnected) {
        const drift =
          pin.row.getBoundingClientRect().top - port.getBoundingClientRect().top - pin.top
        if (Math.abs(drift) > 0.5) port.scrollTop += drift

        pin.top = pin.row.getBoundingClientRect().top - port.getBoundingClientRect().top
        return
      }
      if (following.current && held.current === 0) port.scrollTop = port.scrollHeight
    }
    const stop = () => {
      following.current = false
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey) return
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) stop()
    }
    const onKey = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
        stop()
    }
    const bar = port.parentElement?.querySelector('[data-slot="trace-waterfall-scrollbar"]')
    const watch = new ResizeObserver(follow)
    watch.observe(node)
    port.addEventListener('wheel', onWheel, { passive: true })
    port.addEventListener('touchmove', stop, { passive: true })
    port.addEventListener('keydown', onKey)
    bar?.addEventListener('pointerdown', stop)
    return () => {
      watch.disconnect()
      port.removeEventListener('wheel', onWheel)
      port.removeEventListener('touchmove', stop)
      port.removeEventListener('keydown', onKey)
      bar?.removeEventListener('pointerdown', stop)
    }
  }, [])

  React.useLayoutEffect(() => {
    const port = viewport.current
    if (!port) return
    const pin = () => {
      for (const row of port.querySelectorAll<HTMLElement>('[data-pinned]')) {
        const from = row.parentElement?.getBoundingClientRect().top ?? 0
        if (row.getBoundingClientRect().top - from > 0.5) row.dataset.stuck = ''
        else delete row.dataset.stuck
      }
    }
    pin()
    port.addEventListener('scroll', pin, { passive: true })
    return () => port.removeEventListener('scroll', pin)
  }, [])

  const stats = [
    ['Duration', formatSeconds(duration)],
    ['Cost', formatCost(cost)],
    ['Tokens', formatTokens(tokens)],
    ['LLM calls', String(llm)],
    ['Tool calls', String(tool)],
    ['Errors', String(errors)],
  ] as const

  return (
    <div
      ref={root}
      data-slot="trace-waterfall"
      data-live={live || undefined}
      className={cn(
        '@container/trace w-full overflow-hidden rounded-xl border bg-card text-sm text-card-foreground',
        className,
      )}
      style={style}
      {...props}
    >
      <div className="flex items-center gap-4 border-b px-4 py-3">
        <span className="font-semibold">Trace</span>

        <label className="ms-auto flex h-8 w-1/3 min-w-44 cursor-text items-center gap-2 rounded-lg border border-foreground/10 bg-foreground/[0.03] ps-2.5 pe-1.5 text-muted-foreground transition-[border-color,background-color] duration-150 ease-out focus-within:border-foreground/25 hover:border-foreground/20 hover:bg-foreground/6 motion-reduce:transition-none dark:bg-foreground/[0.045] dark:hover:bg-foreground/8">
          <Search aria-hidden className="size-4 shrink-0" strokeWidth={1.8} />
          <input
            ref={field}
            type="search"
            aria-label="Search steps"
            placeholder="Search"
            spellCheck={false}
            autoComplete="off"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Escape') return
              if (query) setQuery('')
              else event.currentTarget.blur()
            }}
            className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground max-sm:text-base [&::-webkit-search-cancel-button]:appearance-none"
          />
          <KbdGroup aria-hidden className="shrink-0">
            {query ? <Kbd>Esc</Kbd> : <Kbd>⌘F</Kbd>}
          </KbdGroup>
        </label>
      </div>

      <dl className="grid grid-cols-2 gap-px border-b bg-border bg-clip-padding @xl/trace:grid-cols-6">
        {stats.map(([label, value]) => (
          <div
            key={label}
            className="flex min-w-0 flex-col gap-1 bg-card px-4 py-3 @xl/trace:px-3 @3xl/trace:px-4"
          >
            <dt className="truncate text-xs text-muted-foreground">{label}</dt>

            <dd dir="ltr" className="text-start text-lg leading-6">
              <PacedFigure value={value} />
            </dd>
          </div>
        ))}
      </dl>

      <div
        ref={body}
        data-empty={missing || undefined}
        className="group/body relative [--trace-label:calc((100%-1px)/2)] @xl/trace:[--trace-label:calc((100%-5px)/2+2px)] @3xl/trace:[--trace-label:calc((100%-5px)/3+1px)]"
      >

        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-(--trace-label) end-0 z-20 border-s transition-opacity duration-200 ease-out group-data-empty/body:opacity-0 motion-reduce:transition-none"
        >

          <div data-trace-scale dir="ltr" className="absolute inset-0 overflow-hidden">
            <TraceTicks store={store} fit={fit} labels={false} />
          </div>
        </div>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-(--trace-label) end-0 z-40 transition-opacity duration-200 ease-out group-data-empty/body:opacity-0 motion-reduce:transition-none"
        >
          <div dir="ltr" className="absolute inset-0 overflow-hidden">
            <span
              data-trace-scale
              className={cn(
                'absolute inset-y-0 w-px bg-foreground/70 transition-opacity duration-300 ease-out',
                !live && 'opacity-0',
              )}
              style={{ left: at('var(--trace-now)') }}
            >
              <span className="absolute top-9 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground shadow-[0_0_0_2px_var(--card)]" />
            </span>
          </div>
        </div>

        <div className="grid grid-rows-[1fr] transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-data-empty/body:grid-rows-[0fr] group-data-empty/body:opacity-0 motion-reduce:transition-none">
          <div className="min-h-0 overflow-hidden">
            <div className="flex h-9 items-center border-b">
              <span
                data-slot="trace-waterfall-label"
                className="flex w-(--trace-label) shrink-0 items-center gap-1.5 ps-4 text-xs text-muted-foreground"
              >
                <Network aria-hidden className="size-3.5 shrink-0" />
                Steps
              </span>
              <span ref={timeline} className="relative h-full flex-1">
                <span data-trace-scale dir="ltr" className="absolute inset-0 overflow-hidden">
                  <TraceTicks store={store} fit={fit} labels />
                </span>
              </span>
            </div>
          </div>
        </div>

        <ScrollAreaPrimitive.Root data-slot="trace-waterfall-scroll-area">
          <ScrollAreaPrimitive.Viewport
            ref={viewport}
            className="max-h-112 overscroll-contain outline-none [interpolate-size:allow-keywords]"
          >
            <div ref={scroller} className="relative">

              <span
                ref={badge}
                aria-hidden={flagged === undefined}

                className="pointer-events-none absolute top-0 z-30 hidden origin-left scale-90 opacity-0 blur-[2px] transition-[opacity,scale,filter] duration-150 ease-out data-shown:scale-100 data-shown:opacity-100 data-shown:blur-none data-shown:duration-200 data-shown:ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:scale-100 motion-reduce:blur-none motion-reduce:transition-[opacity] @md/trace:block"
                style={{ left: 0 }}
              >
                <Badge variant="amber" size="sm">
                  Slowest
                </Badge>
              </span>

              <svg
                ref={wires}
                aria-hidden
                className="pointer-events-none absolute top-0 z-0 overflow-visible"
                style={{ left: 0 }}
              />

              <TraceScale value={scale}>
                <TraceQuery value={needle}>
                  <TraceHold value={hold}>
                    <ul ref={list}>
                      {spans.map((span) => (
                        <TraceRow
                          key={span.id}
                          span={span}
                          depth={0}
                          flagged={flagged}
                          now={now}
                          tints={tints}
                          tint={tints.get(span.id) ?? NEUTRAL}
                        />
                      ))}
                    </ul>
                  </TraceHold>
                </TraceQuery>
              </TraceScale>

              <div
                inert={!missing}
                className={cn(
                  'grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                  missing ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    role="status"
                    className={cn(
                      'relative z-[41] flex flex-col items-center gap-1 bg-card px-6 py-10 text-center transition-[translate,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none',
                      !missing && 'translate-y-1 blur-[2px]',
                    )}
                  >
                    <span className="mb-2 flex size-9 items-center justify-center rounded-lg border bg-background text-muted-foreground">
                      <SearchX aria-hidden className="size-4" strokeWidth={1.8} />
                    </span>
                    <span className="font-medium">No matching steps</span>
                    <span dir="auto" className="max-w-full truncate text-muted-foreground">
                      {`Nothing in this trace matches “${missed}”`}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollAreaPrimitive.Viewport>
          <ScrollAreaPrimitive.Scrollbar
            data-slot="trace-waterfall-scrollbar"
            className="z-50 m-0.5 flex w-1.5 touch-none opacity-0 transition-opacity delay-300 duration-200 select-none data-hovering:opacity-100 data-hovering:delay-0 data-scrolling:opacity-100 data-scrolling:delay-0 motion-reduce:transition-none"
          >
            <ScrollAreaPrimitive.Thumb className="flex-1 rounded-full bg-foreground/25 hover:bg-foreground/35" />
          </ScrollAreaPrimitive.Scrollbar>
        </ScrollAreaPrimitive.Root>

        <div
          aria-hidden={!zoomed}
          className={cn(
            'absolute start-(--trace-label) end-2 bottom-0 z-50 h-2.5 p-0.5 transition-opacity duration-200 ease-out motion-reduce:transition-none',
            !zoomed && 'pointer-events-none opacity-0',
          )}
        >
          <div dir="ltr" className="relative size-full" onPointerDown={onTrackDown}>
            <div
              data-slot="trace-waterfall-thumb"
              onPointerDown={onThumbDown}
              data-trace-scale
              className="absolute inset-y-0 min-w-6 touch-none rounded-full bg-foreground/25 hover:bg-foreground/35"
              style={{
                left: 'calc(var(--trace-start) / var(--trace-whole) * 100%)',
                width: 'calc(var(--trace-domain) / var(--trace-whole) * 100%)',
              }}
            />
          </div>
        </div>

        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the span column"
          tabIndex={0}
          ref={labelEdge}
          {...grip.handlers}
          onPointerDown={onResizeStart}
          onKeyDown={onResizeKey}
          onDoubleClick={() => resizeTo(null)}
          className="absolute inset-y-0 start-(--trace-label) z-50 -ms-1.5 w-3 cursor-col-resize touch-none outline-none group-data-empty/body:hidden after:absolute after:inset-y-0 after:start-1.5 after:w-px after:bg-ring after:opacity-0 after:transition-opacity after:duration-150 hover:after:opacity-100 focus-visible:after:opacity-100 active:after:opacity-100"
        >
          <AnimatePresence>
            {grip.shown ? <motion.span key="grip" {...grip.props()} /> : null}
          </AnimatePresence>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t px-3 py-2">
        {onPlayingChange ? (
          <>
            <TooltipTrigger
              handle={tip}
              payload={playing ? 'Pause' : 'Play'}

              closeOnClick={false}
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  rounded
                  aria-label={playing ? 'Pause' : 'Play'}
                  onClick={() => onPlayingChange(!playing)}
                >
                  <PlayPauseIcon playing={playing ?? false} />
                </Button>
              }
            />
            {onRestart ? (
              <TooltipTrigger
                handle={tip}
                payload="Replay"
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Replay from the start"
                    onClick={(event) => {

                      const icon = event.currentTarget.querySelector<HTMLElement>(
                        '[data-slot=trace-replay-icon]',
                      )
                      if (icon && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                        const from = Number.parseFloat(getComputedStyle(icon).rotate) || 0
                        icon.animate(
                          [
                            { rotate: `${String(from)}deg` },
                            { rotate: `${String(from - 360)}deg` },
                          ],
                          { duration: 420, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
                        )
                      }
                      onRestart()
                    }}
                  >

                    <span
                      data-slot="trace-replay-icon"
                      className="flex transition-[rotate] duration-200 ease-out will-change-transform group-hover/button:-rotate-[25deg] motion-reduce:transition-none"
                    >

                      <RotateCw aria-hidden className="rotate-180" />
                    </span>
                  </Button>
                }
              />
            ) : null}
            <Tooltip handle={tip}>
              {({ payload }) => (
                <TooltipContent>
                  <TooltipViewport>
                    <Caption>{payload ?? ''}</Caption>
                  </TooltipViewport>
                </TooltipContent>
              )}
            </Tooltip>
            {onSpeedChange ? (
              <NativeSelect
                size="sm"
                aria-label="Speed"
                value={String(speed)}
                onChange={(event) => onSpeedChange(Number(event.target.value))}
              >
                {SPEEDS.map(({ value, label }) => (
                  <NativeSelectOption key={value} value={value}>
                    {label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            ) : null}
          </>
        ) : null}
        <ul className="ms-auto hidden h-8 items-center gap-4 text-xs text-muted-foreground @xl/trace:flex">
          {LEGEND.map(([label, mark]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span aria-hidden className="flex">
                {mark}
              </span>
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

type TraceCardHandle = PopoverPrimitive.Handle<string>

function TraceTrigger({
  handle,
  span,
  start,
  end,
  scope,
  onPress,
}: {
  handle: TraceCardHandle
  span: TraceSpan
  start: number
  end: number | string
  scope: 'lane' | 'step'
  onPress: (trigger: HTMLElement, offset: number) => void
}) {
  return (
    <PopoverPrimitive.Trigger
      handle={handle}
      payload={span.id}
      data-scope={scope}
      aria-label={`Details for ${span.name}`}

      onPointerDown={(event) =>
        onPress(
          event.currentTarget,
          event.clientX - event.currentTarget.getBoundingClientRect().left,
        )
      }
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onPress(event.currentTarget, 0)
      }}
      data-trace-scale
      className={cn(
        'trace-bar-trigger absolute inset-y-1 cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring',
        scope === 'step' ? 'z-[32]' : 'z-[31]',
      )}
      style={{
        left: scope === 'step' ? `calc(${at(start)} + 1px)` : at(start),
        width:
          scope === 'step'
            ? `calc(${across(`(${String(end)} - ${String(start)})`)} - 2px)`
            : across(`(${String(end)} - ${String(start)})`),
      }}
    />
  )
}

function anchorOf(press: TracePress) {
  return {
    get contextElement() {
      return press.current.trigger ?? undefined
    },
    getBoundingClientRect() {
      const { trigger, offset } = press.current
      const bar = trigger?.getBoundingClientRect() ?? new DOMRect()
      const lane = trigger?.closest('[data-slot="trace-timeline"]')?.getBoundingClientRect()
      if (!lane) return bar
      const left = Math.min(Math.max(bar.left + offset, lane.left + 8), lane.right)

      const right = Math.max(left + 32, Math.min(bar.right, lane.right))
      return new DOMRect(left, lane.top, right - left, lane.height)
    },
  }
}

function TraceCard({
  handle,
  spans,
  now,
  press,
  side,
}: {
  handle: TraceCardHandle
  spans: Array<TraceSpan>
  now: number
  press: TracePress
  side: 'top' | 'bottom'
}) {
  const hold = React.use(TraceHold)

  const opened = React.useRef(false)
  React.useEffect(
    () => () => {
      if (opened.current) hold(false)
    },
    [hold],
  )
  return (
    <PopoverPrimitive.Root
      handle={handle}
      onOpenChange={(open) => {
        if (open === opened.current) return
        opened.current = open
        hold(open, press.current.trigger)
      }}
    >
      {({ payload }) => (
        <TraceCardPanel
          span={spans.find((each) => each.id === payload)}
          now={now}
          press={press}
          side={side}
        />
      )}
    </PopoverPrimitive.Root>
  )
}

function TraceCardPanel({
  span,
  now,
  press,
  side,
}: {
  span: TraceSpan | undefined
  now: number
  press: TracePress
  side: 'top' | 'bottom'
}) {

  const id = span?.id
  const anchor = React.useMemo(() => anchorOf(press), [press, id])

  const popup = React.useRef<HTMLDivElement>(null)
  const was = React.useRef(id)
  React.useLayoutEffect(() => {
    const positioner = popup.current?.parentElement
    const moved = was.current !== undefined && id !== undefined && was.current !== id
    was.current = id
    if (!positioner || !moved) return
    positioner.dataset.gliding = ''
    const settled = window.setTimeout(() => delete positioner.dataset.gliding, GLIDE_MS + 40)
    return () => window.clearTimeout(settled)
  }, [id])
  return (

    <PopoverContent
      ref={popup}
      side={side}
      align="start"
      sideOffset={0}
      anchor={anchor}
      collisionAvoidance={{ side: 'none', align: 'none', fallbackAxisSide: 'none' }}

      positionMethod="fixed"
      positionerClassName="data-gliding:transition-[top,left] data-gliding:duration-280 data-gliding:ease-[cubic-bezier(0.16,1,0.3,1)] data-instant:transition-none motion-reduce:transition-none"
      className="h-[var(--popup-height,auto)] w-80 origin-top-left gap-3 rounded-xl p-3.5 transition-[height] duration-280 ease-[cubic-bezier(0.16,1,0.3,1)] data-closed:animate-out! data-closed:fade-out-0 data-closed:zoom-out-95 data-instant:transition-none data-open:animate-in! data-open:fade-in-0 data-open:zoom-in-95 data-[side=top]:origin-bottom-left motion-reduce:transition-none rtl:origin-top-right rtl:data-[side=top]:origin-bottom-right [&>[data-slot=popover-arrow]]:hidden"
    >
      <PopoverPrimitive.Viewport className="trace-card-viewport relative -m-3.5 overflow-clip p-3.5">

        {span ? (
          <div className="flex flex-col gap-3">
            <TraceDetails span={span} now={now} />
          </div>
        ) : null}
      </PopoverPrimitive.Viewport>
    </PopoverContent>
  )
}

type TracePress = React.RefObject<{ trigger: HTMLElement | null; offset: number }>

const GLIDE_MS = 280

const CARD_ROOM = 320

function PinnedTicks() {
  const scale = React.useContext(TraceScale)
  if (!scale) return null
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0 start-(--trace-label) end-0 z-20 border-s opacity-0 group-data-stuck/row:opacity-100"
    >
      <div data-trace-scale dir="ltr" className="absolute inset-0 overflow-hidden">
        <TraceTicks store={scale.store} fit={scale.fit} labels={false} />
      </div>
    </div>
  )
}

const live = (span: TraceSpan): boolean =>
  span.end === undefined || (span.children?.some(live) ?? false)

const sameSpan = (a: TraceSpan, b: TraceSpan): boolean => {
  if (a === b) return true
  for (const key of Object.keys(b) as Array<keyof TraceSpan>)
    if (key !== 'children' && a[key] !== b[key]) return false
  if (Object.keys(a).length !== Object.keys(b).length) return false
  const was = a.children ?? []
  const now = b.children ?? []
  return was.length === now.length && now.every((child, index) => sameSpan(was[index]!, child))
}

const sameTints = (a: Map<string, string>, b: Map<string, string>) =>
  a === b || (a.size === b.size && [...b].every(([id, tint]) => a.get(id) === tint))

const TraceRow = React.memo(
  TraceRowBody,
  (was, next) =>
    was.depth === next.depth &&
    was.flagged === next.flagged &&
    was.tint === next.tint &&
    sameTints(was.tints, next.tints) &&
    sameSpan(was.span, next.span) &&
    (was.now === next.now || !live(next.span)),
)

function TraceRowBody({
  span,
  depth,
  flagged,
  now,
  tints,
  tint,
}: {
  span: TraceSpan
  depth: number
  flagged: string | undefined
  now: number
  tints: Map<string, string>

  tint: string
}) {
  const [open, setOpen] = React.useState(true)
  const [handle] = React.useState(() => PopoverPrimitive.createHandle<string>())
  const press: TracePress = React.useRef({ trigger: null, offset: 0 })

  const [side, setSide] = React.useState<'top' | 'bottom'>('bottom')
  const onPress = (trigger: HTMLElement, offset: number) => {
    press.current = { trigger, offset }
    setSide(
      window.innerHeight - trigger.getBoundingClientRect().bottom >= CARD_ROOM ? 'bottom' : 'top',
    )
  }
  const children = span.children ?? []
  const nested = span.kind === 'agent' && children.length > 0

  const query = React.useContext(TraceQuery)
  const kept = keeps(span, query)
  const unfolded = open || (query !== '' && children.some((child) => keeps(child, query)))
  const running = span.end === undefined
  const spent = spentBy(span)
  const end = span.end ?? 'var(--trace-now)'
  const label = [
    formatSeconds(Math.max(0, (span.end ?? now) - span.start)),
    spent > 0 ? formatCost(spent) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const offset = 16 + depth * INDENT

  return (

    <li
      inert={!kept}
      className={cn(
        'grid transition-[grid-template-rows,opacity] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none starting:grid-rows-[0fr] starting:opacity-0',
        kept ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] opacity-0',
      )}
    >

      <div className="min-h-0 overflow-clip">
        <div
          data-slot="trace-row"
          data-trace-id={span.id}
          className={cn(

            'trace-row group/row relative flex h-9 items-center transition-[translate,filter] duration-400 ease-[cubic-bezier(0.22,1,0.36,1)] before:pointer-events-none before:absolute before:inset-0 before:z-[1] before:bg-foreground/5 before:opacity-0 hover:before:opacity-100 has-data-popup-open:before:opacity-100 motion-reduce:transition-none starting:-translate-y-2 starting:blur-[2px]',

            nested &&
              'sticky select-none data-stuck:bg-card data-stuck:shadow-[0_1px_0_var(--border)]',
          )}
          data-pinned={nested || undefined}

          style={nested ? { top: depth * 36, zIndex: 39 - depth } : undefined}
        >
          {nested ? <PinnedTicks /> : null}
          <div
            onClick={nested ? () => setOpen((was) => !was) : undefined}
            className={cn(
              'relative z-[2] flex h-full w-(--trace-label) shrink-0 items-center gap-2 pe-3',
              nested && 'cursor-pointer',
            )}
            style={{ paddingInlineStart: offset - (span.kind === 'agent' ? 6 : 0) }}
          >

            {span.kind === 'agent' ? (
              <button
                type="button"
                inert={!nested}
                aria-hidden={!nested}
                aria-expanded={nested ? unfolded : undefined}
                aria-label={`${unfolded ? 'Collapse' : 'Expand'} ${span.name}`}
                className={cn(
                  'relative flex size-4 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground transition-[color,box-shadow,scale,opacity] duration-150 ease-out outline-none after:absolute after:-inset-2.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-96 motion-reduce:active:scale-100',
                  !nested && 'opacity-0',
                )}
              >
                <ChevronDown aria-hidden className={cn(
                                                  'size-3.5 transition-[rotate] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
                                                  !unfolded && '-rotate-90 rtl:rotate-90',
                                                )} />
              </button>
            ) : null}
            {span.icon ? (
              <span
                aria-hidden
                className="flex size-5.5 shrink-0 items-center justify-center rounded-[5px] border bg-background [&_svg]:size-3"
              >
                {span.icon}
              </span>
            ) : null}
            <span className="flex min-w-0 flex-1 items-center gap-1.5">
              {span.kind === 'agent' ? (
                <span dir="auto" className="truncate font-semibold">
                  <Marked text={span.name} />
                </span>
              ) : (
                <StepName name={span.name} running={running} failed={span.error === true} />
              )}
              {span.detail ? (
                <span
                  dir="auto"
                  className="hidden min-w-0 truncate text-muted-foreground @lg/trace:inline"
                >
                  <Marked text={span.detail} />
                </span>
              ) : null}
            </span>
          </div>

          <div data-slot="trace-timeline" className="relative h-full flex-1">
            <div dir="ltr" className="absolute inset-0 overflow-hidden">
              {(span.kind === 'agent'
                ? laneOf(span, now)
                : [
                    {
                      key: span.id,
                      start: span.start,
                      end: running ? ('now' as const) : (span.end ?? 0),
                      tone: toneOf(span),
                      running,
                    },
                  ]
              ).map((segment) => {
                const step =
                  span.kind === 'agent'
                    ? children.find((child) => child.id === segment.key)
                    : undefined
                const bar = (
                  <TraceSegment segment={segment} tint={tint} tall={span.kind === 'agent'} />
                )
                return step ? (

                  <span key={segment.key} className="trace-step contents">
                    <TraceTrigger
                      handle={handle}
                      span={step}
                      start={segment.start}
                      end={segment.end === 'now' ? 'var(--trace-now)' : segment.end}
                      scope="step"
                      onPress={onPress}
                    />
                    {bar}
                  </span>
                ) : (
                  <React.Fragment key={segment.key}>{bar}</React.Fragment>
                )
              })}

              <TraceTrigger
                handle={handle}
                span={span}
                start={span.start}
                end={end}
                scope="lane"
                onPress={onPress}
              />
              <TraceCard
                handle={handle}
                spans={[span, ...children]}
                now={now}
                press={press}
                side={side}
              />

              <span
                data-trace-scale
                className="absolute top-1/2 z-30 flex -translate-y-1/2 items-center gap-2 ps-2 text-xs whitespace-nowrap text-muted-foreground"
                style={{ left: at(end) }}
              >
                {label ? (
                  <span
                    data-trace-figure={span.id}
                    className="transition-opacity duration-200 starting:opacity-0"
                  >
                    {label}
                  </span>
                ) : null}
              </span>
            </div>
          </div>
        </div>

        {nested ? (

          <div
            className={cn(
              'relative grid transition-[grid-template-rows] ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
              unfolded ? 'grid-rows-[1fr] duration-260' : 'grid-rows-[0fr] duration-200',
            )}
          >
            <ul inert={!unfolded} className="relative min-h-0 overflow-clip">

              <span
                aria-hidden
                className="absolute top-0 bottom-3 z-[2] w-px bg-border"
                style={{ insetInlineStart: offset + 2 }}
              />
              {children.map((child) => (
                <TraceRow
                  key={child.id}
                  span={child}
                  depth={depth + 1}
                  flagged={flagged}
                  now={now}
                  tints={tints}
                  tint={child.kind === 'agent' ? (tints.get(child.id) ?? tint) : tint}
                />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </li>
  )
}

function TraceDetails({ span, now }: { span: TraceSpan; now: number }) {
  const status = span.error ? 'Failed' : span.end === undefined ? 'Running' : 'Done'
  const running = span.end === undefined
  const agent = span.kind === 'agent'
  const tokensIn = agent ? sumOf(span, (each) => each.tokensIn ?? 0) : (span.tokensIn ?? 0)
  const tokensOut = agent ? sumOf(span, (each) => each.tokensOut ?? 0) : (span.tokensOut ?? 0)
  const figures: Array<[string, string]> = [
    ['Duration', formatSeconds(Math.max(0, (span.end ?? now) - span.start))],
    ['Started', `+${formatSeconds(span.start)}`],
    ['Cost', formatCost(spentBy(span))],
  ]
  if (agent || span.kind === 'llm')
    figures.push(['Tokens in', formatTokens(tokensIn)], ['Tokens out', formatTokens(tokensOut)])
  if (agent) figures.push(['Spans', String(spansUnder(span))])

  return (
    <>
      <div className="flex items-center gap-2">
        {span.icon ? (
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background [&_svg]:size-4"
          >
            {span.icon}
          </span>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-w-0 items-center gap-1.5">
            <PopoverPrimitive.Title className="truncate leading-5 font-semibold">
              {span.name}
            </PopoverPrimitive.Title>

            <Badge
              variant={span.error ? 'destructive' : running ? 'blue' : 'green'}
              size="sm"
              className="trace-status shrink-0"
            >
              {joinsLetters(status) ? (
                status
              ) : (
                <TextMorph duration={300} ease="cubic-bezier(0.22, 1, 0.36, 1)" scale={false}>
                  {status}
                </TextMorph>
              )}
            </Badge>
          </div>
        </div>

        <PopoverPrimitive.Close className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-foreground/5 text-muted-foreground transition-[background-color,color,scale,box-shadow] duration-150 ease-out hover:bg-foreground/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100">
          <X aria-hidden className="size-4" />
          <span className="sr-only">Close</span>
        </PopoverPrimitive.Close>
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-3 rounded-lg bg-muted/60 p-3">
        {figures.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-0.5">
            <dt className="truncate text-xs text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {span.error && span.reason && span.end !== undefined ? (
        <p
          dir="auto"
          className="flex gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-pretty text-destructive"
        >
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {span.reason}
        </p>
      ) : null}
      {(['input', 'output'] as const).map((field) =>
        span[field] ? (
          <div key={field} className="flex flex-col gap-0.5">
            <span className="text-xs text-muted-foreground">
              {field === 'input' ? 'Input' : 'Output'}
            </span>
            <p dir="auto" className="text-pretty">
              {span[field]}
            </p>
          </div>
        ) : null,
      )}
    </>
  )
}

const SETTLE_MS = 300
const SETTLE_EASE = 'ease-[cubic-bezier(0.23,1,0.32,1)]'

const SLOT_FACE = cn(
  'col-start-1 row-start-1 flex size-3.5 items-center justify-center transition-[opacity,scale,filter] duration-300 motion-reduce:transition-[opacity]',
  SETTLE_EASE,
)
const SLOT_AWAY = 'scale-25 opacity-0 blur-xs'

function StepName({ name, running, failed }: { name: string; running: boolean; failed: boolean }) {

  const [was, setWas] = React.useState(running)
  const [lingering, setLingering] = React.useState(false)
  const [shaking, setShaking] = React.useState(false)
  if (was !== running) {
    setWas(running)
    setLingering(!running)
    setShaking(!running && failed)
  }
  React.useEffect(() => {
    if (!lingering) return
    const timer = window.setTimeout(() => setLingering(false), SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [lingering])
  const shown = running || lingering
  const warning = failed && !running
  const open = running || warning

  return (

    <span
      onAnimationEnd={(event) => {
        if (event.animationName === 'trace-name-shake') setShaking(false)
      }}
      className={cn(
        'flex min-w-0 items-center gap-1.5 transition-[color] duration-300',
        SETTLE_EASE,
        warning && 'text-destructive',
        shaking && 'trace-name-shake',
      )}
    >
      <span
        aria-hidden={!open}
        className={cn(
          'grid shrink-0 justify-items-start overflow-hidden transition-[width,margin,opacity,scale,filter] duration-300 motion-reduce:transition-[opacity]',
          SETTLE_EASE,
          open ? 'w-3.5 opacity-100' : '-me-1.5 w-0 scale-50 opacity-0 blur-[2px]',
        )}
      >
        <span className={cn(SLOT_FACE, !running && SLOT_AWAY)}>

          {shown ? (
            <Spinner
              variant="gradient"
              aria-label={`${name} running`}
              className="size-3.5 shrink-0 motion-reduce:animate-none"
            />
          ) : null}
        </span>
        <span className={cn(SLOT_FACE, !warning && SLOT_AWAY)}>
          <TriangleAlert role="img" aria-label={`${name} failed`} className="size-3.5 text-destructive" />
        </span>
      </span>

      <span dir="auto" className="grid min-w-0 *:col-start-1 *:row-start-1">
        <span
          className={cn(
            'truncate transition-opacity duration-300',
            SETTLE_EASE,
            running ? 'opacity-0' : 'opacity-100',
          )}
        >
          <Marked text={name} />
        </span>
        {shown ? (
          <span
            aria-hidden
            className={cn(
              'truncate transition-opacity duration-300',
              SETTLE_EASE,
              running ? 'opacity-100' : 'opacity-0',
            )}
          >
            <TextShimmer duration={1.35}>{name}</TextShimmer>
          </span>
        ) : null}
      </span>
    </span>
  )
}

function TraceSegment({ segment, tint, tall }: { segment: Segment; tint: string; tall: boolean }) {
  const end = segment.end === 'now' ? 'var(--trace-now)' : segment.end
  return (
    <span
      data-trace-scale
      data-running={segment.running || undefined}
      className={cn(
        'trace-bar absolute top-1/2 z-30 flex min-w-1 -translate-y-1/2 items-center justify-center overflow-hidden text-(--card)',
        tall ? 'h-5 rounded-[6px]' : 'h-4 rounded-[5px]',
      )}
      style={{
        left: `calc(${at(segment.start)} + 1px)`,
        width: `calc(${across(`(${String(end)} - ${String(segment.start)})`)} - 2px)`,
        ...toneStyle(segment.tone, tint),
      }}
    >
      {segment.tone === 'error' ? (
        <X aria-hidden className={cn('shrink-0 text-white', tall ? 'size-3.5' : 'size-3')} strokeWidth={2.5} />
      ) : segment.tone === 'retry' ? (

        <RotateCw aria-hidden className={cn('shrink-0 rotate-180 text-white', tall ? 'size-3.5' : 'size-3')} strokeWidth={2.5} />
      ) : null}
    </span>
  )
}

export { TraceWaterfall }
