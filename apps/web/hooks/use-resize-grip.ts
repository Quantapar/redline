import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
} from 'react'
import {
  useSpring,
  type HTMLMotionProps,
  type TargetAndTransition,
  type Transition,
} from 'motion/react'

export type GripSide = 'start' | 'end' | 'center' | 'above' | 'below' | 'middle'

type Point = { clientX: number; clientY: number }

export const GRIP = 32
export const GRIP_HELD = 48

const FOLLOW = { stiffness: 700, damping: 50, mass: 0.6 }
const GROW: Transition = { type: 'spring', duration: 0.25, bounce: 0 }

const PLACE: Record<GripSide, string> = {
  start: 'end-1/2 top-0 me-0.75 w-1',
  end: 'start-1/2 top-0 ms-0.75 w-1',
  center: 'start-1/2 top-0 -ms-0.5 w-1',
  above: 'bottom-1/2 left-0 mb-0.75 h-1',
  below: 'top-1/2 left-0 mt-0.75 h-1',
  middle: 'top-1/2 left-0 -mt-0.5 h-1',
}

const still = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
const subscribeNever = () => () => {}

const last: Point = { clientX: 0, clientY: 0 }
let tracking = false
function track() {
  if (tracking) return
  tracking = true
  window.addEventListener(
    'pointermove',
    (event) => {
      last.clientX = event.clientX
      last.clientY = event.clientY
    },
    { capture: true, passive: true },
  )
}

export function useResizeGrip<T extends HTMLElement = HTMLDivElement>(
  side: GripSide,
  { rest = false }: { rest?: boolean } = {},
) {
  const ref = useRef<T>(null)
  const along = side === 'start' || side === 'end' || side === 'center' ? 'y' : 'x'
  const offset = useSpring(0, FOLLOW)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [held, setHeld] = useState(false)
  const size = held ? GRIP_HELD : GRIP
  const half = useRef(GRIP / 2)
  useLayoutEffect(() => {
    half.current = size / 2
  }, [size])

  const length = useCallback(() => {
    const line = ref.current
    if (!line) return 0
    return along === 'y' ? line.offsetHeight : line.offsetWidth
  }, [along])

  const place = useCallback(
    (point: Point, jump: boolean) => {
      const line = ref.current
      if (!line) return
      const rect = line.getBoundingClientRect()
      const full = length()

      const scale = (along === 'y' ? rect.height : rect.width) / full || 1
      const from = along === 'y' ? point.clientY - rect.top : point.clientX - rect.left

      const at =
        full < half.current * 2
          ? full / 2
          : Math.min(Math.max(from / scale, half.current), full - half.current)
      if (jump || still()) offset.jump(at)
      else offset.set(at)
    },
    [along, length, offset],
  )

  const center = useCallback(
    (jump: boolean) => {
      if (jump || still()) offset.jump(length() / 2)
      else offset.set(length() / 2)
    },
    [length, offset],
  )

  useEffect(track, [])

  useEffect(() => {
    if (!hovered && !held) return
    const move = (event: PointerEvent) => {
      place(event, false)
    }
    window.addEventListener('pointermove', move, { passive: true })
    return () => window.removeEventListener('pointermove', move)
  }, [hovered, held, place])

  useEffect(() => {
    if (!held) return
    const end = () => setHeld(false)
    window.addEventListener('pointerup', end, true)
    window.addEventListener('pointercancel', end, true)
    return () => {
      window.removeEventListener('pointerup', end, true)
      window.removeEventListener('pointercancel', end, true)
    }
  }, [held])

  const idle = !hovered && !held && !focused

  const client = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  )
  const first = useRef(true)
  useLayoutEffect(() => {
    if (!rest || !idle) return
    center(first.current)
    first.current = false
    const line = ref.current
    if (!line) return
    const sizes = new ResizeObserver(() => center(true))
    sizes.observe(line)
    return () => sizes.disconnect()
  }, [rest, idle, center])

  const handlers = {
    onPointerEnter: (event: Point & { pointerType: string }) => {
      if (event.pointerType === 'touch') return

      place(event, !rest)
      setHovered(true)
    },
    onPointerLeave: () => setHovered(false),
    onPointerDown: (event: Point & { button: number }) => {
      if (event.button !== 0) return
      if (!hovered) place(event, !rest)
      setHeld(true)
    },
    onFocus: (event: FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.matches(':focus-visible')) return
      center(!rest)
      setFocused(true)
    },
    onBlur: () => setFocused(false),
  }

  const was = useRef({ hovered, held, focused })
  useLayoutEffect(() => {
    was.current = { hovered, held, focused }
  }, [hovered, held, focused])
  const sync = useCallback(
    (next: { hovered: boolean; held: boolean; focused: boolean }) => {
      const before = was.current
      if ((next.hovered || next.held) && !before.hovered && !before.held) place(last, !rest)
      else if (next.focused && !next.hovered && !next.held && !before.focused) center(!rest)
      setHovered(next.hovered)
      setHeld(next.held)
      setFocused(next.focused)
    },
    [place, center, rest],
  )

  const props = (): HTMLMotionProps<'span'> => {
    const quiet = still()

    const [initial, animate, exit]: Array<TargetAndTransition> =
      along === 'y'
        ? [
            { opacity: 0, scaleY: quiet ? 1 : 0.6, height: GRIP, marginTop: -GRIP / 2 },
            { opacity: 1, scaleY: 1, height: size, marginTop: -size / 2 },
            { opacity: 0, scaleY: quiet ? 1 : 0.8, transition: { duration: 0.12 } },
          ]
        : [
            { opacity: 0, scaleX: quiet ? 1 : 0.6, width: GRIP, marginLeft: -GRIP / 2 },
            { opacity: 1, scaleX: 1, width: size, marginLeft: -size / 2 },
            { opacity: 0, scaleX: quiet ? 1 : 0.8, transition: { duration: 0.12 } },
          ]
    return {
      'aria-hidden': true,
      style: along === 'y' ? { y: offset } : { x: offset },

      initial: rest && idle ? false : initial,
      animate,
      exit,
      transition: GROW,
      className: `pointer-events-none absolute rounded-full bg-foreground/40 ${PLACE[side]}`,
    }
  }

  return { ref, shown: (rest && client) || !idle, held, handlers, sync, props }
}
