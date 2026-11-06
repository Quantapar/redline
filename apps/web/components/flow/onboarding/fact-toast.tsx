"use client";

import { startTransition, useRef, useState, ViewTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { Fact } from "@/lib/flow/fleet";
import { EASE_EXIT, EASE_OUT } from "@/lib/flow/motion";
import { Button } from "@/components/flow/ui/button";
import { Input } from "@/components/flow/ui/input";
import type { FactState } from "./types";

/**
 * The facts the owner hasn't answered yet, as a stack of toast cards that
 * lives in the page. The front card is the oldest question; new ones join at
 * the back, so the card under the owner's finger never changes. Answering
 * slides it away and brings the next one forward.
 */
export function FactStack({
  facts,
  onDecide,
  empty,
}: {
  facts: readonly Fact[];
  onDecide: (id: string, state: FactState) => void;
  empty: React.ReactNode;
}) {
  const front = facts[0];

  return (
    // One card at a time, nothing peeking out behind it: the count of what's
    // left is in the line above
    <div className="relative">
      <div className="relative z-10">
        <AnimatePresence mode="popLayout" initial={false}>
          {front ? (
            <motion.div
              key={front.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.15, ease: EASE_EXIT } }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
            >
              {/* Grows open for "Fix it" through a view transition */}
              <ViewTransition update="expand" default="none">
                <FactCard fact={front} onDecide={onDecide} />
              </ViewTransition>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="rounded-[18px] bg-muted px-4 py-4 text-sm text-ink-2 text-pretty"
            >
              {empty}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function FactCard({ fact, onDecide }: { fact: Fact; onDecide: (id: string, state: FactState) => void }) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const decide = (state: FactState) => onDecide(fact.id, state);
  const source = fact.source.toLowerCase().startsWith("your") ? fact.source.toLowerCase() : fact.source;

  return (
    <div
      data-component="FactToast"
      className="rounded-[18px] bg-card p-3.5 shadow-[var(--elevation-floating)]"
    >
      <p className="text-xs text-ink-3">Found on {source}</p>
      <p className="mt-0.5 text-[15px] leading-snug text-ink text-pretty">{fact.label}</p>

      {fact.conflict ? (
        <>
          <p className="mt-2 text-[13px] leading-snug text-ink-2 text-pretty">{fact.conflict.question}</p>
          <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={fact.conflict.question}>
            {fact.conflict.options.map((option, i) => (
              <Button
                key={option}
                type="button"
                variant="outline"
                size="md"
                onClick={() =>
                  decide({
                    status: "confirmed",
                    value: i === 0 ? fact.label : "Congress Ave is open on Saturdays",
                  })
                }
              >
                {option}
              </Button>
            ))}
          </div>
        </>
      ) : editing ? (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const value = inputRef.current?.value.trim();
            if (!value) return;
            decide(value === fact.label ? { status: "confirmed" } : { status: "edited", value });
          }}
        >
          <label htmlFor={`fix-${fact.id}`} className="sr-only">
            Correct this
          </label>
          <Input
            id={`fix-${fact.id}`}
            ref={inputRef}
            defaultValue={fact.label}
            autoFocus
            spellCheck={false}
            autoComplete="off"
            data-1p-ignore
            onKeyDown={(e) => {
              if (e.key === "Escape") startTransition(() => setEditing(false));
            }}
            className="h-10 flex-1 rounded-[10px] px-2.5 text-base md:text-base"
          />
          <Button type="submit" size="md">
            Save
          </Button>
        </form>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button type="button" variant="secondary" size="md" onClick={() => decide({ status: "confirmed" })}>
            Looks right
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="md"
            onClick={() => startTransition(() => setEditing(true))}
            className="text-ink-2"
          >
            Fix it
          </Button>
        </div>
      )}
    </div>
  );
}
