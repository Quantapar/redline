"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_EXIT, EASE_IN_OUT, EASE_OUT } from "@/lib/flow/motion";
import { cn } from "@/lib/flow/utils";

// The radar's rings, in px from the origin at the top centre, before scaling to
// the room there is. The outer ones only show as arcs out to the page's edges.
const RINGS = [64, 112, 160, 208, 256, 304, 352, 400, 448, 496, 544];
// Ring fills, lifted at the centre and fading out into the dark page (--paper,
// 0.145): one neutral ramp, no hue. Recolored for Redline's dark theme.
const RING_FILLS = [
  "oklch(0.235 0 0)",
  "oklch(0.222 0 0)",
  "oklch(0.210 0 0)",
  "oklch(0.199 0 0)",
  "oklch(0.189 0 0)",
  "oklch(0.180 0 0)",
  "oklch(0.172 0 0)",
  "oklch(0.165 0 0)",
  "oklch(0.158 0 0)",
  "oklch(0.152 0 0)",
  "oklch(0.147 0 0)",
];
// Room kept at the bottom for the caption, above the prototype bar
const CAPTION = 176;

const onRing = (r: number, deg: number) => ({
  x: Math.round(r * Math.sin((deg * Math.PI) / 180)),
  y: Math.round(r * Math.cos((deg * Math.PI) / 180)),
});

// The mainnet protocols an exploit routes through, sitting on rings. Order is the
// sweep order. Each tag names what an attacker takes from that protocol. Marks are
// the protocols' own, from their official repos (public/protocols/); the Uniswap
// file drops only its light app-icon tile so the unicorn sits on our dark chip.
const PROTOCOLS = [
  { name: "Aave flash loans", src: "/protocols/aave.svg" },
  { name: "Uniswap pools", src: "/protocols/uniswap.svg" },
  { name: "Chainlink price feeds", src: "/protocols/chainlink.svg" },
  { name: "Curve pools", src: "/protocols/curve.svg" },
  { name: "Lido stETH", src: "/protocols/lido.svg" },
];
// On a wide card they fan out to both sides; on a narrow one they stay near the middle.
const WIDE_SPOTS = [onRing(112, -8), onRing(208, 40), onRing(256, -46), onRing(352, 62), onRing(400, -66)];
const NARROW_SPOTS = [onRing(112, -8), onRing(160, 36), onRing(160, -42), onRing(208, 58), onRing(208, -60)];
const SOURCES_WIDE = PROTOCOLS.map((p, i) => ({ ...p, ...WIDE_SPOTS[i] }));
const SOURCES_NARROW = PROTOCOLS.map((p, i) => ({ ...p, ...NARROW_SPOTS[i] }));
// The wide fan needs room for the outermost logo, 365px left of centre
const WIDE_MIN = 800;
// How far down each layout's lowest logo reaches, with its name tag, at scale 1
const REACH = { wide: 214, narrow: 165 };

// Quiet texture between the logos: other things on the map, not read
const DOTS = [
  onRing(64, 22),
  onRing(112, 52),
  onRing(112, -50),
  onRing(160, 4),
  onRing(160, -24),
  onRing(208, -14),
  onRing(256, 18),
  onRing(304, 52),
  onRing(304, -58),
  onRing(400, 68),
  onRing(448, -70),
  onRing(496, 72),
  onRing(496, -74),
];

/** How long the crosshair rests on each source, and how long it takes to travel. */
const DWELL_MS = 1900;
const TRAVEL_S = 0.7;

/**
 * A radar sweeping the sources the scan reads: a spotlight swings from the
 * origin to each logo in turn and a crosshair locks onto it, in an endless
 * loop. Under reduced motion it rests on the first source.
 */
export function SourceRadar({ business }: { business: string | null }) {
  const reduce = useReducedMotion();
  const gradient = useId();
  const [at, setAt] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setSize({ width: entry.contentRect.width, height: entry.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Grow the whole radar into the height it's given, logos staying clear of the caption
  const wide = size.width >= WIDE_MIN;
  const k = Math.min(1.4, Math.max(0.6, (size.height - CAPTION) / REACH[wide ? "wide" : "narrow"]));
  const SOURCES = (wide ? SOURCES_WIDE : SOURCES_NARROW).map((s) => ({ ...s, x: s.x * k, y: s.y * k }));
  const rings = RINGS.map((r) => r * k);
  const span = rings.at(-1)! * 2 + 16;

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setAt((i) => (i + 1) % SOURCES_WIDE.length), DWELL_MS);
    return () => window.clearInterval(id);
  }, [reduce]);

  const target = SOURCES[at];
  // Rotate the cone (pointing straight down at rest) towards the target
  const angle = -Math.atan2(target.x, target.y);
  const travel = { duration: reduce ? 0 : TRAVEL_S, ease: EASE_IN_OUT };

  return (
    <div
      ref={ref}
      data-component="SourceRadar"
      className="relative h-full w-full overflow-hidden"
    >
      {/* Sits on the page itself: the rings soften in at the top and out at the sides */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 isolate select-none"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 12%, black 88%, transparent), linear-gradient(to bottom, transparent, black 32px)",
          maskComposite: "intersect",
        }}
      >
        {/* Rings, filled and darkest at the centre */}
        {[...rings].reverse().map((r, i) => (
          <div
            key={i}
            className="absolute top-0 left-1/2 aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ width: r * 2, background: RING_FILLS[rings.length - 1 - i], zIndex: i + 1 }}
          />
        ))}
        {/* Fine dotted lines on each ring */}
        <svg
          viewBox={`0 0 ${span} ${span / 2}`}
          className="absolute top-0 left-1/2 z-10 -translate-x-1/2"
          style={{ width: span }}
          fill="none"
          stroke="black"
          strokeOpacity="0.16"
          strokeLinecap="round"
          strokeDasharray="0.25 4"
        >
          {rings.map((r, i) => (
            <circle key={i} cx={span / 2} cy="0" r={r} />
          ))}
        </svg>

        {/* The spotlight: a soft cone from the origin, swinging to the target */}
        <motion.svg
          viewBox="0 0 232 168"
          className="absolute top-0 left-1/2 z-10 w-[232px] -translate-x-1/2 blur-lg"
          style={{ transformOrigin: "50% 0%" }}
          initial={false}
          animate={{ rotate: (angle * 180) / Math.PI }}
          transition={travel}
        >
          <path fill={`url(#${gradient})`} d="M98 0h36l98 168H0L98 0Z" />
          <defs>
            <linearGradient id={gradient} x1="116" x2="116" y1="0" y2="168" gradientUnits="userSpaceOnUse">
              <stop stopColor="black" stopOpacity="0.09" />
              <stop offset="1" stopColor="black" stopOpacity="0" />
            </linearGradient>
          </defs>
        </motion.svg>

        {/* Texture dots */}
        {DOTS.map((d, i) => (
          <span
            key={i}
            className="absolute z-20 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink/25"
            style={{ left: `calc(50% + ${d.x * k}px)`, top: d.y * k }}
          />
        ))}

        {/* The sources */}
        {SOURCES.map(({ name, src, x, y }, i) => (
          <span
            key={name}
            className={cn(
              // Kobra's raised surface, the same edge and shadow as its secondary button.
              // The source being read is selected the way Kobra lifts a control: it turns
              // to the white raised surface, takes the lifted shadow and grows a little
              "t-raise absolute isolate z-20 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full transition-[scale] duration-300 ease-[var(--ease-out)] before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:transition-[background-color,box-shadow] before:duration-300",
              i === at ? "t-raise-outline scale-110 before:shadow-[var(--raise-lifted)]!" : "t-raise-secondary",
            )}
            style={{ left: `calc(50% + ${x}px)`, top: y }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVGs, no optimisation to gain */}
            <img src={src} alt="" width={18} height={18} className="size-[18px] object-contain" draggable={false} />
          </span>
        ))}

        {/* Crosshair: travels to the target, then pulses once and names it */}
        <motion.div
          className="absolute top-0 left-1/2 z-30 -mt-6 -ml-6 size-12"
          initial={false}
          animate={{ x: target.x, y: target.y }}
          transition={travel}
        >
          <svg viewBox="0 0 48 48" className="size-12 text-ink">
            <circle
              cx="24"
              cy="24"
              r="21"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="25 8"
              strokeDashoffset="-4"
            />
          </svg>
          <motion.span
            key={at}
            className="absolute inset-0 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.25),0_0_12px_2px_rgb(0_0_0/0.08)]"
            initial={{ opacity: 0, scale: 0.75 }}
            animate={reduce ? { opacity: 0 } : { opacity: [0, 1, 0], scale: [0.75, 1, 1.35] }}
            transition={{ duration: 0.9, delay: TRAVEL_S, ease: EASE_OUT }}
          />
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={target.name}
              className="absolute top-full left-1/2 mt-1 -translate-x-1/2 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-background"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.2, delay: reduce ? 0 : TRAVEL_S, ease: EASE_OUT } }}
              exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_EXIT } }}
            >
              {target.name}
            </motion.span>
          </AnimatePresence>
        </motion.div>

        {/* Fade the rings into the page behind the caption */}
        <div
          className="absolute inset-0 z-[25]"
          style={{
            backgroundImage: `linear-gradient(to bottom, transparent calc(100% - ${CAPTION + 60}px), var(--paper) calc(100% - ${CAPTION - 40}px))`,
          }}
        />
      </div>

      {/* Pinned to the bottom, clear of the prototype bar */}
      <div className="absolute inset-x-0 bottom-0 z-30 px-6 pb-[calc(max(16px,env(safe-area-inset-bottom))+80px)] text-center">
        <h3 className="text-[15px] font-medium text-ink">
          {business ? `Ready to attack ${business}` : "Every path an attacker would take"}
        </h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-ink-2 text-pretty">
          Flash loans, pools and price feeds on a mainnet fork, used the way an attacker
          would.
        </p>
      </div>
    </div>
  );
}
