"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { EASE_EXIT, EASE_IN_OUT, EASE_OUT } from "@/lib/flow/motion";

export type InspectItem = {
  /** `data-scan-line` of the element inside the overlay's parent. */
  id: string;
  /** What the scraper calls it: shown in the measurement tag. */
  kind: string;
  /** Scan time (ms) when it has been read. */
  at: number;
};

type Box = { x: number; y: number; w: number; h: number };

/** Space between an element and its outline, in px. */
const PAD = 4;

/**
 * The scrape, drawn as an inspector: every element read so far keeps a dashed
 * outline, corner brackets and a cursor travel to the one being read, and a
 * tag gives its real measured size. Place it as the last child of a
 * positioned element that contains the `data-scan-line` elements.
 */
export function InspectorOverlay({ items, elapsed }: { items: InspectItem[]; elapsed: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [boxes, setBoxes] = useState<Record<string, Box>>({});

  // Measure every element once, and again whenever the page reflows
  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const measure = () => {
      const h = host.getBoundingClientRect();
      const next: Record<string, Box> = {};
      for (const item of items) {
        const el = host.querySelector<HTMLElement>(`[data-scan-line="${item.id}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next[item.id] = { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height };
      }
      setBoxes(next);
    };
    measure();
    const watch = new ResizeObserver(measure);
    watch.observe(host);
    return () => watch.disconnect();
  }, [items]);

  const read = items.filter((i) => elapsed >= i.at && boxes[i.id]);
  const current = [...items].reverse().find((i) => elapsed >= i.at - 700 && boxes[i.id]);
  const box = current ? boxes[current.id] : null;
  const glide = { duration: reduce ? 0 : 0.45, ease: EASE_IN_OUT };

  return (
    <div ref={ref} aria-hidden className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Outlines stay on everything read so far */}
      {read.map((i) => {
        const b = boxes[i.id];
        return (
          <motion.span
            key={i.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, ease: EASE_OUT }}
            className="absolute rounded-[4px] border border-dashed border-ink/25"
            style={{ left: b.x - PAD, top: b.y - PAD, width: b.w + PAD * 2, height: b.h + PAD * 2 }}
          />
        );
      })}

      {box && current && (
        <>
          {/* Corner brackets on the element being read */}
          <motion.span
            className="absolute"
            initial={false}
            animate={{
              left: box.x - PAD - 3,
              top: box.y - PAD - 3,
              width: box.w + PAD * 2 + 6,
              height: box.h + PAD * 2 + 6,
            }}
            transition={glide}
          >
            <span className="absolute top-0 left-0 size-2.5 border-t-[1.5px] border-l-[1.5px] border-ink" />
            <span className="absolute top-0 right-0 size-2.5 border-t-[1.5px] border-r-[1.5px] border-ink" />
            <span className="absolute bottom-0 left-0 size-2.5 border-b-[1.5px] border-l-[1.5px] border-ink" />
            <span className="absolute right-0 bottom-0 size-2.5 border-r-[1.5px] border-b-[1.5px] border-ink" />

            {/* Its tag: what it is and its real size */}
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={current.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: { duration: 0.2, delay: reduce ? 0 : 0.3, ease: EASE_OUT } }}
                exit={{ opacity: 0, transition: { duration: 0.1, ease: EASE_EXIT } }}
                className="absolute right-0 bottom-full mb-1 font-mono text-[10px] leading-none whitespace-nowrap text-ink-2 tabular-nums"
              >
                {current.kind} {Math.round(box.w)}×{Math.round(box.h)}
              </motion.span>
            </AnimatePresence>
          </motion.span>

          {/* The cursor, travelling with the brackets */}
          <motion.svg
            viewBox="0 0 16 16"
            className="absolute top-0 left-0 size-4 text-ink drop-shadow-[0_1px_1px_rgb(0_0_0/0.2)]"
            initial={false}
            animate={{ x: box.x + Math.min(box.w * 0.62, box.w - 8), y: box.y + box.h * 0.6 }}
            transition={{ duration: reduce ? 0 : 0.55, ease: EASE_IN_OUT }}
          >
            <path
              fill="currentColor"
              stroke="white"
              strokeWidth="1"
              d="M2 1.5 13.5 7 8.2 8.4 6.3 13.5 2 1.5Z"
            />
          </motion.svg>
        </>
      )}
    </div>
  );
}
