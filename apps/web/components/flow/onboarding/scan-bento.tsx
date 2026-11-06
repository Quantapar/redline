"use client";

/* eslint-disable @next/next/no-img-element */
// What the Live Read shows while the scan runs: a 2×2 bento, one card per thing
// the scan is doing, each driven by the scan's clock. Three are rebuilt from
// cards on todesktop.com and clerk.com, from their running pages' own markup
// and motion, in our colours; their image assets are redrawn in CSS.
//   Finding you everywhere       ← ToDesktop "Distribution. Sorted!"
//   Reading your website         ← a magnifier over Fleet's homepage
//   Checking what customers see  ← ToDesktop "Performance. Benchmarked!"
//   Watching your marketing      ← Clerk "Email and SMS one-time passcodes"
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Lock } from "lucide-react";
import { business, steps, websiteLines } from "@/lib/flow/fleet";
import { BusinessMark } from "@/components/flow/brand";
import { GoogleAdsLogo, GoogleLogo, GoogleMapsLogo, InstagramLogo, MetaLogo } from "@/components/flow/logos";
import { cn } from "@/lib/flow/utils";
import "./scan-bento.css";

const step = (id: string) => steps.find((s) => s.id === id)!;
// The score the report opens with
const SCORE = 51;

// Each card plays on its own loop for as long as the scan runs, like the cards
// it's borrowed from: the scan's clock, wrapped to the card's cycle
const loop = (elapsed: number, period: number) => elapsed % period;

export function ScanBento({ elapsed, finished }: { elapsed: number; finished: boolean }) {
  return (
    // Two columns of two, in the order the scan runs them
    <div data-component="ScanBento" className="mx-auto grid h-full w-full max-w-[760px] grid-cols-1 gap-4 max-md:auto-rows-[340px] md:grid-flow-col md:grid-cols-2 md:grid-rows-2">
      <BentoCard title="Scanning every contract" copy="On a throwaway mainnet fork" size={{ w: 434, h: 214 }}>
        <Distribution elapsed={elapsed} />
      </BentoCard>

      <BentoCard title="Reading the Solidity" copy="Every external call and state write" size={{ w: PAGE.w, h: PAGE.h }}>
        <Magnifier elapsed={elapsed} />
      </BentoCard>

      <BentoCard title="Refereeing the attacks" copy="Five models replay each exploit" size={{ w: 434, h: 236 }}>
        <Performance finished={finished} />
      </BentoCard>

      <BentoCard title="Measuring the theft" copy="Value read from chain state" size={{ w: 330, h: 206 }}>
        <Passcode elapsed={elapsed} />
      </BentoCard>
    </div>
  );
}

/** One bento card: its visual, scaled to fit, over a title and one short line. */
function BentoCard({
  title,
  copy,
  size,
  className,
  children,
}: {
  title: string;
  copy: string;
  size: { w: number; h: number };
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("b2-card flex min-h-0 flex-col overflow-hidden rounded-[24px]", className)}>
      <Fit size={size}>{children}</Fit>
      <div className="shrink-0 px-6 pt-1 pb-5 text-center">
        <h3 className="text-[15px] font-medium text-ink">{title}</h3>
        <p className="mt-0.5 truncate text-[13px] text-ink-3">{copy}</p>
      </div>
    </section>
  );
}

/** Draws its child at its own size, then scales it down (never up) to fit the space it's given. */
function Fit({ size, children }: { size: { w: number; h: number }; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(1, width / size.w, height / size.h));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.w, size.h]);

  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-hidden p-5 pb-2" aria-hidden>
      <div className="absolute top-1/2 left-1/2 select-none" style={{ width: size.w, height: size.h, transform: `translate(-50%, -50%) scale(${scale})` }}>
        {children}
      </div>
    </div>
  );
}

/* --------------------------------- Magnifier -------------------------------- */

// Fleet's homepage, redrawn at 392×280 so the lens can find each line
const PAGE = { w: 392, h: 280 };
const LENS = 92;
const ZOOM = 1.6;
const at = (id: string) => websiteLines.find((l) => l.id === id)?.at ?? Infinity;

// Where the lens rests for each line it reads, in page coordinates, in reading order
const READ_LOOP = 12_000;
const STOPS = [
  { at: 0, x: 196, y: 140 },
  { at: at("banner"), x: 196, y: 40 },
  { at: 6_800, x: 52, y: 82 },
  { at: at("headline"), x: 120, y: 118 },
  { at: at("sub"), x: 150, y: 168 },
  { at: at("order"), x: 76, y: 204 },
  { at: at("hours"), x: 96, y: 246 },
  { at: at("congress"), x: 280, y: 246 },
  { at: step("website").end, x: 196, y: 140 },
];

function Magnifier({ elapsed }: { elapsed: number }) {
  const reduce = useReducedMotion();
  // Read the page top to bottom, glide back, and read it again
  const first = STOPS[1].at;
  const t = first + loop(elapsed, READ_LOOP);
  const stop = STOPS.findLast((s) => t >= s.at) ?? STOPS[0];
  const glide = reduce ? { duration: 0 } : { type: "spring" as const, duration: 0.9, bounce: 0.15 };
  const r = LENS / 2;

  return (
    <div className="relative" style={{ width: PAGE.w, height: PAGE.h }}>
      <div className="absolute inset-0 overflow-hidden rounded-[20px] bg-card shadow-[0_0_0_1px_rgb(255_255_255/0.08),0_12px_24px_-6px_rgb(0_0_0/0.5)]">
        <MiniSite />
      </div>

      {/* The lens: a magnified copy of the page, clipped to a circle, sliding with it */}
      <motion.div
        className="absolute top-0 left-0"
        initial={false}
        animate={{ x: stop.x - r, y: stop.y - r }}
        transition={glide}
        style={{ width: LENS, height: LENS }}
      >
        <span className="absolute top-[70px] left-[70px] h-11 w-3 origin-top-left -rotate-45 rounded-full bg-[linear-gradient(to_bottom,#6e6e70,#3a3a3c)] shadow-[0_4px_8px_rgb(0_0_0/0.5)]" />
        <div className="relative size-full overflow-hidden rounded-full bg-card shadow-[0_0_0_4px_#3a3a3c,0_0_0_5px_rgb(255_255_255/0.1),0_10px_24px_rgb(0_0_0/0.55)]">
          <motion.div
            className="absolute top-0 left-0 origin-top-left"
            initial={false}
            animate={{ x: r - stop.x * ZOOM, y: r - stop.y * ZOOM }}
            transition={glide}
            style={{ width: PAGE.w, height: PAGE.h, scale: ZOOM }}
          >
            <MiniSite />
          </motion.div>
          <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgb(255_255_255/0.12),transparent_45%)]" />
        </div>
      </motion.div>
    </div>
  );
}

function MiniSite() {
  return (
    <div className="relative size-full bg-card">
      <div className="flex h-7 items-center gap-1.5 px-3 shadow-[inset_0_-1px_0_rgb(255_255_255/0.06)]">
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="size-2 rounded-full bg-white/15" />
        <span className="ml-3 flex-1 rounded bg-white/[0.05] py-0.5 text-center font-mono text-[9px] text-ink-3">{business.website}</span>
      </div>
      <p className="bg-secondary py-1.5 text-center text-[8px] font-semibold tracking-[0.08em] text-ink uppercase">
        Pull request #42 changes withdraw()
      </p>
      <div className="px-6 pt-4">
        <span className="inline-flex h-[29px] w-[44px] items-center justify-center rounded bg-secondary font-mono text-[10px] font-semibold text-ink outline-none">{"</>"}</span>
        <p className="mt-2.5 font-serif text-[21px] leading-[1.12] text-ink">
          contract VaultCore is ReentrancyGuard
        </p>
        <p className="mt-2 font-serif text-[11px] leading-snug text-ink-2">
          function withdraw(uint256 amount) external
        </p>
        <p className="mt-3 inline-block rounded bg-ink px-2 py-1 text-[7px] font-semibold tracking-[0.08em] text-paper uppercase">
          External call before state write
        </p>
        <div className="mt-3.5 grid grid-cols-2 gap-3 text-[8px] leading-snug text-ink-2">
          <p>
            <span className="font-medium text-ink">msg.sender.call</span>, sends the balance
          </p>
          <p>
            <span className="font-medium text-ink">balances = 0</span>, only after the call
          </p>
        </div>
      </div>
    </div>
  );
}

/* ============================ ToDesktop: Distribution ======================= */
// A little room, a laptop whose lid opens, and the places we find Fleet flying
// in as tiles. Sizes, delays, keyframes and curves are ToDesktop's.

// The places we find Fleet, one at a time in the middle of the laptop: each
// flies up on ToDesktop's curve and replaces the last, round and round
const TILES = [
  { name: "Google Maps", Logo: GoogleMapsLogo },
  { name: "Google", Logo: GoogleLogo },
  { name: "Instagram", Logo: InstagramLogo },
];
const TILE_EVERY = 2_600;

function Distribution({ elapsed }: { elapsed: number }) {
  const reduce = useReducedMotion();
  // A beat for the lid to open first, then a new tile every couple of seconds
  const turn = Math.floor((elapsed - 1_800) / TILE_EVERY);
  const tile = turn >= 0 ? TILES[turn % TILES.length] : null;

  return (
    <div className="relative size-full overflow-hidden">
      {/* The room: a wall either side of a floor */}
      <div className="absolute top-0 left-0 flex w-full">
        <div className="b2-wall h-[154px] w-[30px]" />
        <div className="b2-ground h-[140px] flex-1" />
        <div className="b2-wall h-[154px] w-[30px]" />
      </div>

      {/* The laptop: its lid swings open once, then the tiles take turns in front of it */}
      <div className="absolute top-[88px] left-1/2 z-10 w-[200px] -translate-x-1/2">
        <div className="b2-macbook">
          <div className="b2-macbook-lid">
            <div className="b2-macbook-screen h-[100px]">
              <div className="absolute top-[3px] left-[3px] h-[calc(100%-6px)] w-[calc(100%-6px)] overflow-hidden rounded-t-[2px] rounded-b-[1px] bg-[linear-gradient(160deg,#1f1f21,#161618_55%,#1c1c1e)]" />
            </div>
          </div>
          <div className="b2-macbook-base" />
        </div>
      </div>

      <div className="absolute top-[110px] left-1/2 z-10 size-14 -translate-x-1/2">
        <AnimatePresence initial={false}>
          {tile && (
            // The exit lives on this outer layer: the fly-in below is a CSS
            // animation that holds its end, and would override an inline exit
            <motion.div
              key={turn}
              className="absolute inset-0"
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.8, filter: "blur(10px)", transition: { duration: 0.5, ease: "easeIn" } }}
            >
              <div className="b2-tile b2-fly size-full">
                <div className="b2-tile-inner absolute inset-0 grid place-items-center">
                  <tile.Logo className="size-8" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ========================== ToDesktop: Performance ========================== */
// ToDesktop's gauge, part for part: a bezel, a dial face, a shade that trails
// the needle and a tapered needle on a round base, in front of an app window
// with readings drifting up behind. While the scan runs the reading wanders the
// way theirs does, and the higher it reads, the harder the whole scene shakes.
// Once the scan finishes it settles on the score.

const READINGS = ["8.5 ETH", "reentrancy", "4 calls", "flash loan", "withdraw()", "21,394,112", "oracle drift", "0 approvals", "5 of 5", "slippage", "3 paths", "+12.4 ETH"];
// The dial reads 0–120 over 225°, starting at -113° (ToDesktop's numbers)
const DIAL_MAX = 120;
const dialAngle = (v: number) => -113 + (v / DIAL_MAX) * 225;
type Floater = { id: number; x: number; y: number; text: string; alpha: number; dur: number };

function Performance({ finished }: { finished: boolean }) {
  const reduce = useReducedMotion();
  const scene = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLDivElement>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextId = useRef(0);
  const finishedRef = useRef(finished);
  useEffect(() => {
    finishedRef.current = finished;
  }, [finished]);
  const [value, setValue] = useState(85);

  // ToDesktop's loop: every 20 frames, move the reading, swing the needle,
  // shake the whole scene (more the higher it reads) and throw up readings
  useEffect(() => {
    if (reduce) return;
    const box = area.current;
    if (!box) return;
    // Readings rise in four lanes, in mirrored pairs: the two outer lanes
    // together, then the two inner ones, so the left always answers the right.
    // All move at one speed and sit centred in their lane, so none can catch up
    // with or spill into another
    const LANES = 4;
    const RISE_MS = 6_500; // bottom to top, the same for every reading
    const PAIRS = [
      [0, 3],
      [1, 2],
    ];
    let pair = 0;
    const spawnPair = (startY?: number) => {
      const { width, height } = box.getBoundingClientRect();
      const y = startY ?? height;
      const lanes = PAIRS[pair % PAIRS.length];
      const alpha = 0.12 + Math.random() * 0.1; // one shade for both sides
      pair += 1;
      setFloaters((f) => [
        ...f.slice(-12),
        ...lanes.map((lane) => ({
          id: nextId.current++,
          x: ((lane + 0.5) / LANES) * width,
          y,
          text: READINGS[Math.floor(Math.random() * READINGS.length)],
          alpha,
          dur: (y / height) * RISE_MS,
        })),
      ]);
    };
    // Start part-way through: an outer pair high up, an inner pair lower down
    const h = box.getBoundingClientRect().height;
    spawnPair(h * 0.35);
    spawnPair(h * 0.7);

    // Their walk: up or down by up to 20 a move, turning back above 100 and below 20
    let reading = 85;
    const move = () => {
      if (finishedRef.current) reading = SCORE + (Math.random() - 0.5) * 4;
      else if (reading > 100) reading -= Math.random() * 20;
      else if (reading < 20 || Math.random() > 0.5) reading += Math.random() * 20;
      else reading -= Math.random() * 20;
      setValue(reading);
      const t = reading / DIAL_MAX;
      const e = Math.max(t - 0.3, 0) * 1.5;
      scene.current?.animate(
        { transform: [`translate(-${e}px, ${e}px)`, `translate(${e}px, -${e}px)`, `translate(-${e}px, -${e}px)`, `translate(${e}px, ${e}px)`] },
        { duration: t * 150, fill: "forwards", iterations: 6, easing: "ease-in-out" },
      );
    };

    let frame = 0;
    let raf = 0;
    const tick = () => {
      if (frame % 20 === 0) move();
      if (frame % 80 === 0) spawnPair();
      frame += 1;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce]);

  const shown = reduce ? SCORE : value;
  const angle = dialAngle(shown);

  return (
    <div className="relative size-full overflow-hidden">
      <div ref={scene} className="absolute inset-0">
        <div className="absolute top-0 left-0 h-[240px] w-full">
          {/* Rising readings */}
          <div ref={area} className="b2-fade absolute inset-0 overflow-hidden font-mono text-[12px]">
            {floaters.map((f) => (
              <Rising key={f.id} f={f} onDone={() => setFloaters((all) => all.filter((x) => x.id !== f.id))} />
            ))}
          </div>
          {/* The app window behind the meter */}
          <div className="absolute inset-x-[51px] top-[116px] h-[156px] rounded-[14px] backdrop-blur-[4px]" />
          <div className="b2-fade absolute inset-0">
            <div className="b2-window absolute inset-x-[51px] top-[115px] h-[156px] rounded-[14px] bg-popover/90">
              <div className="flex w-full gap-2 border-b border-white/[0.06] p-2.5">
                <span className="size-2 rounded-full bg-white/[0.14]" />
                <span className="size-2 rounded-full bg-white/[0.14]" />
                <span className="size-2 rounded-full bg-white/[0.14]" />
              </div>
            </div>
          </div>
        </div>

        {/* The meter */}
        <div className="b2-meter absolute top-11 left-[calc(50%-78px)] z-10 size-[156px] rounded-full">
          <div className="b2-meter-groove absolute inset-3 rounded-full" />
          <div className="b2-meter-face absolute top-3.5 left-3.5 z-10 size-32 rounded-full">
            <div className="b2-meter-dial absolute inset-1.5 rounded-full" />
            {/* Carved into the dial: each mark is a dark line over a white one a pixel lower */}
            {["b2-meter-carve-light translate-y-px", "b2-meter-carve"].map((tone) => (
              <div key={tone} className={cn("absolute inset-0", tone)}>
                {Array.from({ length: 11 }, (_, i) => (
                  <div key={i} className="absolute inset-0" style={{ rotate: `${-112.5 + i * 22.5}deg` }}>
                    <span className="b2-meter-tick absolute top-3 left-1/2 h-[5.5px] w-px -translate-x-1/2" />
                  </div>
                ))}
                <div className="b2-meter-inner-arc absolute inset-7 rounded-full" />
              </div>
            ))}
            <div className="b2-meter-hub absolute inset-12 rounded-full" />
            <div className="b2-meter-reading absolute bottom-6 left-1/2 -translate-x-1/2 text-[13px] font-semibold tracking-[-0.02em] tabular-nums">
              {Math.min(100, Math.round(finished ? SCORE : shown))}
            </div>
          </div>
          {/* The shade trails the needle; it's drawn with the needle at 12 o'clock and turns with it */}
          <div className="b2-meter-shade absolute top-3.5 left-3.5 z-10 size-32">
            <div className="absolute inset-0 rounded-full transition-[rotate] duration-[400ms]" style={{ rotate: `${angle}deg` }}>
              <div className="b2-meter-trail absolute inset-0 rounded-full" />
              <div className="b2-meter-rim absolute inset-0 rounded-full" />
            </div>
          </div>
          <div className="absolute top-[65px] left-[65px] z-10 size-[26px] transition-[rotate] duration-[400ms]" style={{ rotate: `${angle}deg` }}>
            <Needle />
          </div>
        </div>
      </div>
    </div>
  );
}

/** ToDesktop's needle: a shaft tapering to a rounded tip, flaring into a round base on the pivot. */
function Needle() {
  const id = useId();
  return (
    <svg viewBox="0 0 26 70" width={26} height={70} className="b2-needle absolute bottom-0 left-0 max-w-none overflow-visible">
      <defs>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.8" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={`${id}-base`} cx="0.38" cy="0.32" r="0.7">
          <stop offset="0" stopColor="#fff" stopOpacity="0.3" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={NEEDLE_SHAFT} fill="var(--ink)" />
      <path d={NEEDLE_SHAFT} fill={`url(#${id}-shine)`} />
      <circle cx="13" cy="57.4" r="7.8" fill="var(--ink)" />
      <circle cx="13" cy="57.4" r="7.8" fill={`url(#${id}-base)`} />
    </svg>
  );
}
// Measured off theirs: 2px at the tip, 9px where it meets the 15.6px base
const NEEDLE_SHAFT = "M12 6.9A1 1 0 0 1 14 6.9L17.6 50.5H8.4Z";

function Rising({ f, onDone }: { f: Floater; onDone: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    const a = ref.current?.animate(
      {
        transform: [`translate(${f.x}px, ${f.y}px)`, `translate(${f.x}px, -100%)`],
        opacity: [0, 1, 1, 0],
        filter: ["blur(0px)", "blur(0px)", "blur(0px)", "blur(2px)"],
      },
      { duration: f.dur, fill: "forwards", easing: "linear" },
    );
    if (a) a.onfinish = () => done.current();
    return () => a?.cancel();
  }, [f]);
  return (
    <span ref={ref} className="absolute top-0 left-0 whitespace-nowrap" style={{ color: `rgba(164,164,164,${f.alpha})`, transform: `translate(${f.x}px, ${f.y}px)` }}>
      {/* Centred on the lane's middle, so a long reading never reaches the next lane */}
      <span className="block -translate-x-1/2">{f.text}</span>
    </span>
  );
}

/* ============================ Clerk: Passcode phone ========================= */
// Clerk's phone, motion for motion, light. When something lands the phone lifts
// 2rem, the island lights up and the notification drops in over the home
// screen. Each finding replaces the one before it.

// Clerk's curves, as their page runs them
const EXIT = [0.25, 0.1, 0.35, 1] as const;
const DROP = { type: "spring" as const, duration: 0.6, bounce: 0.1 };
const SETTLE = { type: "spring" as const, duration: 0.5, bounce: 0 };

// Each finding has a turn on the lock screen, then the next drops in, on a loop
const NOTE_EVERY = 2_400;
const NOTES = [
  { app: "Repository", Logo: GoogleLogo, title: "VaultCore.sol", body: "withdraw() calls before zeroing" },
  { app: "Foundry", Logo: InstagramLogo, title: "withdraw() exploit", body: "Re-enters and drains the vault" },
  { app: "Chain state", Logo: MetaLogo, title: "Fork @ 21,384,221", body: "125.5 ETH left the vault" },
  { app: "Council", Logo: GoogleAdsLogo, title: "5 of 5 referees", body: "The theft reproduced" },
];
const HOME = [
  { app: "Repo", Logo: GoogleLogo },
  { app: "Foundry", Logo: InstagramLogo },
  { app: "Chain", Logo: MetaLogo },
  { app: "Council", Logo: GoogleAdsLogo },
  { app: "Fork", Logo: GoogleMapsLogo },
  { app: "Source", Logo: null },
];

function Passcode({ elapsed }: { elapsed: number }) {
  const reduce = useReducedMotion();
  // A beat of quiet first, then a new notification every couple of seconds
  const turn = Math.floor((elapsed - 600) / NOTE_EVERY);
  const current = turn >= 0 ? NOTES[turn % NOTES.length] : undefined;
  const active = Boolean(current);

  return (
    <div className="relative size-full">
      <motion.div
        className="absolute inset-x-0 top-0 isolate h-[206px] overflow-hidden pt-6"
        initial={false}
        animate={active && !reduce ? { y: "-2rem", scale: 1 } : { y: "0rem", scale: 0.98 }}
        transition={active ? SETTLE : { duration: 0.3, ease: EXIT }}
      >
        <div
          className="mx-auto h-56 w-[264px] rounded-[44px] bg-[#2c2c2e] p-1.5"
          style={{
            boxShadow: "0 1px 0 0 rgb(255 255 255 / 0.12) inset, 0 0 0 1px rgb(255 255 255 / 0.04), 0px 2px 5px 0 rgb(0 0 0 / 0.45)",
            backgroundImage: "linear-gradient(180deg, rgb(255 255 255 / 0.07) 0%, rgb(255 255 255 / 0) 67.19%)",
          }}
        >
          <div className="relative h-[200px] overflow-hidden rounded-[38px] bg-card px-5 pt-3 ring-1 ring-white/[0.06] ring-inset">
            {/* The island lights up while something's arriving */}
            <motion.div
              className="relative z-10 mx-auto flex size-6 items-center justify-center rounded-full"
              initial={false}
              animate={{ backgroundColor: active ? "#000000" : "#2a2a2c" }}
              transition={{ duration: 0.28 }}
              style={{ boxShadow: "0 1px rgb(255 255 255 / 0.06)" }}
            >
              <motion.span initial={false} animate={{ opacity: active ? 1 : 0 }} transition={{ duration: 0.4 }}>
                <Lock className="size-3 text-white" strokeWidth={2.25} />
              </motion.span>
            </motion.div>

            <span className="[perspective:1000px]">
              <AnimatePresence mode="wait" initial={false}>
                {current && (
                  <motion.div
                    key={turn}
                    className="absolute inset-x-2 top-12 z-20 flex origin-top items-center gap-x-3 rounded-2xl bg-popover p-2"
                    style={{ boxShadow: "0 6px 12px rgb(0 0 0 / 0.4), 0 0 0 1px rgb(255 255 255 / 0.08)" }}
                    initial={reduce ? { opacity: 0 } : { y: "-6.5rem", scale: 0.9, opacity: 0.5, filter: "blur(2px)" }}
                    animate={{
                      y: "0rem",
                      scale: 1,
                      opacity: 1,
                      filter: "blur(0px)",
                      transition: { y: { ...DROP, delay: 0.2 }, scale: { ...DROP, delay: 0.2 }, opacity: { ...DROP, delay: 0.2 }, filter: { duration: 0.6, delay: 0.2, ease: "easeOut" } },
                    }}
                    exit={reduce ? { opacity: 0 } : { y: "-6.5rem", scale: 0.9, opacity: 0.5, filter: "blur(2px)", transition: { duration: 0.3, ease: EXIT } }}
                  >
                    <div className="grid size-10 flex-none place-items-center rounded-[10px] bg-secondary shadow-[0_1px_rgb(255_255_255/0.08)_inset] [background-image:radial-gradient(circle_at_top,rgb(255_255_255/0.04),rgb(255_255_255/0))]">
                      <current.Logo className="size-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] leading-4 font-medium text-ink">{current.title}</div>
                      <div className="truncate text-[11px] leading-4 text-ink-2">{current.body}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </span>

            {/* The home screen, under where notifications land */}
            <div className="mt-6 flex flex-wrap justify-between gap-x-2 gap-y-4 text-center">
              {HOME.map((h) => (
                <div key={h.app} className="flex w-10 flex-none flex-col items-center">
                  <div className="grid size-10 place-items-center rounded-[10px] bg-secondary shadow-[0_1px_rgb(255_255_255/0.08)_inset]">
                    {h.Logo ? <h.Logo className="size-5" /> : <BusinessMark className="size-5 rounded-[5px]" />}
                  </div>
                  <div className="mt-1.5 text-[10px] leading-4 font-medium whitespace-nowrap text-ink-3">{h.app}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Clerk's fade over the phone's lower edge, which slides away as it lifts */}
        <motion.div
          className="pointer-events-none absolute inset-0 bg-linear-to-t from-(--b2-card) via-transparent to-transparent"
          initial={false}
          animate={{ y: active ? "2rem" : "0rem" }}
          transition={{ duration: 0.3, ease: EXIT }}
        />
      </motion.div>
    </div>
  );
}
