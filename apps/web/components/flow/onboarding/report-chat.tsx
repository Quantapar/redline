"use client";

// The Live Read's finished screen: the report is ready, and what the scan found
// comes up as a short conversation. Like a real one: a typing indicator, then
// our question arriving word by word, then the quick replies; your answer sends
// with a little spring and the thread glides up to make room. The way into the
// report stays pinned under it all, so answering is always optional. Bubbles are
// Kobra's Conversation, words are Kobra's Streaming Text.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion } from "motion/react";
import type { Fact } from "@/lib/flow/fleet";
import { EASE_EXIT, EASE_OUT } from "@/lib/flow/motion";
import { Button } from "@/components/flow/ui/button";
import { Input } from "@/components/flow/ui/input";
import { StreamingText } from "@/components/flow/ui/streaming-text";
import { Conversation, ConversationBubble, ConversationContent } from "@/components/flow/ui/conversation";
import { ContinueButton } from "./setup-shell";
import type { FactDecisions, FactState } from "./types";

const Bubble = motion.create(ConversationBubble);

// How long we "type" before a message lands, and how fast its words arrive
const TYPING_MS = 650;
const WORD_MS = 45;
// The thread gliding up as it grows, and a sent reply settling in
const GLIDE = { type: "spring", duration: 0.45, bounce: 0 } as const;
const SEND = { type: "spring", duration: 0.4, bounce: 0.25 } as const;

// Streaming Text's reveal colours, in greys rather than its blue to purple
const GREY_REVEAL = {
  "--stream-reveal-1": "oklch(0.75 0 0)",
  "--stream-reveal-2": "oklch(0.55 0 0)",
  "--stream-reveal-3": "oklch(0.35 0 0)",
} as React.CSSProperties;

const CONTENT = "px-4 py-2.5 text-[15px] text-pretty";

// How we ask about each finding, the way a person would: the source named once,
// and not the same "Right?" every time
const QUESTIONS: Record<string, string> = {
  locations: "Google lists 4 Fleet Coffee shops in Austin. Is that right?",
  rainey: "Your website says your newest shop is at 88 Rainey St. Right?",
  ordering: "Your website offers online ordering for pickup. Still true?",
  "congress-hours": "Your website says Congress Ave is closed on weekends, but Google says it opens Saturdays. Which is right?",
  "loved-for": "Customers on Google keep mentioning your key lime pie latte. Sound right?",
  competition: "Black Fox Coffee shows up above you when people search nearby. Is that what you see too?",
  instagram: "You post on Instagram about every 5 days. Is that right?",
  ads: "You’re not running any Google or Meta ads right now. Correct?",
};
const sourceOf = (f: Fact) => (f.source.toLowerCase().startsWith("your") ? f.source.toLowerCase() : f.source);
const ask = (f: Fact) =>
  QUESTIONS[f.id] ?? (f.conflict ? f.conflict.question : `${sourceOf(f).replace(/^./, (c) => c.toUpperCase())} says ${f.label.toLowerCase()}. Is that right?`);
const reply = (s: FactState) => (s.status === "edited" ? s.value : (s.value ?? "Yes, that’s right"));

export function ReportChat({
  headline,
  facts,
  decisions,
  onDecide,
  onDone,
}: {
  headline: string;
  facts: readonly Fact[];
  decisions: FactDecisions;
  onDecide: (id: string, state: FactState) => void;
  onDone: () => void;
}) {
  const reduce = useReducedMotion() ?? false;
  const answered = facts.filter((f) => decisions[f.id]);
  const pending = facts.filter((f) => !decisions[f.id]);
  const current = pending[0];
  const intro = `${headline} Before you look, a few quick checks.`;
  const outro = "Thanks, that’s everything. Your report uses your answers.";

  // Our turn: what we say next. The very first turn also says hello.
  const turnKey = current?.id ?? "done";
  const turn = current ? (answered.length === 0 ? [intro, ask(current)] : [ask(current)]) : [outro];
  const [readyFor, setReadyFor] = useState<string | null>(null);
  const ready = readyFor === turnKey;

  return (
    <div data-component="ReportChat" className="mx-auto flex h-full w-full max-w-[520px] flex-col">
      {/* Messages stack up from the replies and fade off the top. The thread
          moves as one piece, so a new message can never land on an older one */}
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden pt-2 [mask-image:linear-gradient(to_bottom,transparent,black_40px)]">
        <Thread reduce={reduce}>
          <Conversation aria-live="polite" className="gap-1.5" style={GREY_REVEAL}>
            {answered.length > 0 && (
              <ConversationBubble variant="muted">
                <ConversationContent className={CONTENT}>{intro}</ConversationContent>
              </ConversationBubble>
            )}
            {answered.map((f) => [
              <ConversationBubble key={`${f.id}-q`} variant="muted">
                <ConversationContent className={CONTENT}>{ask(f)}</ConversationContent>
              </ConversationBubble>,
              <Bubble
                key={`${f.id}-a`}
                variant="default"
                align="end"
                className="mb-1.5 origin-bottom-right"
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={SEND}
              >
                <ConversationContent className="px-4 py-2.5 text-[15px]">{reply(decisions[f.id])}</ConversationContent>
              </Bubble>,
            ])}
            <Turn key={turnKey} messages={turn} reduce={reduce} onReady={() => setReadyFor(turnKey)} />
          </Conversation>
        </Thread>
      </div>

      <div className="shrink-0 pt-3">
        {/* The replies wait until the question has finished arriving */}
        <div className="min-h-10">
          <AnimatePresence mode="wait" initial={false}>
            {current && ready && (
              <motion.div
                key={current.id}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_EXIT } }}
                transition={{ duration: 0.22, ease: EASE_OUT }}
              >
                <Replies fact={current} onDecide={onDecide} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="mt-4 flex items-center justify-between gap-4 border-t border-black/[0.06] pt-4">
          <p className="text-sm text-ink-3 tabular-nums">
            {pending.length > 0 ? `${pending.length} left, or skip them` : "Your report uses your answers"}
          </p>
          <ContinueButton type="button" onClick={onDone}>
            See your report
          </ContinueButton>
        </div>
      </div>
    </div>
  );
}

/**
 * One turn of ours: each message in order, first as a typing indicator, then
 * its words arriving. Calls onReady when the last word is in.
 */
function Turn({ messages, reduce, onReady }: { messages: string[]; reduce: boolean; onReady: () => void }) {
  const [at, setAt] = useState(0);
  const done = useRef(onReady);
  useEffect(() => {
    done.current = onReady;
  });
  useEffect(() => {
    if (at >= messages.length) done.current();
  }, [at, messages.length]);

  return (
    <>
      {messages.slice(0, at + 1).map((text, i) =>
        i < at ? (
          <ConversationBubble key={i} variant="muted">
            <ConversationContent className={CONTENT}>{text}</ConversationContent>
          </ConversationBubble>
        ) : i < messages.length ? (
          <Typed key={i} text={text} reduce={reduce} onDone={() => setAt((n) => n + 1)} />
        ) : null,
      )}
    </>
  );
}

/** A message being written: the typing dots, then the words coming in. */
function Typed({ text, reduce, onDone }: { text: string; reduce: boolean; onDone: () => void }) {
  const words = text.split(" ");
  const [typing, setTyping] = useState(!reduce);
  const [shown, setShown] = useState(reduce ? words.length : 0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    if (!typing) return;
    const id = window.setTimeout(() => setTyping(false), TYPING_MS);
    return () => window.clearTimeout(id);
  }, [typing]);

  useEffect(() => {
    if (typing) return;
    if (shown >= words.length) {
      done.current();
      return;
    }
    const id = window.setTimeout(() => setShown((n) => n + 1), WORD_MS);
    return () => window.clearTimeout(id);
  }, [typing, shown, words.length]);

  // One bubble throughout: the dots inside it give way to the words, so there's
  // no gap or second bubble between "typing" and the message
  return (
    <Bubble
      variant="muted"
      aria-label={typing ? "Typing" : undefined}
      className="origin-bottom-left"
      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2, ease: EASE_OUT }}
    >
      <ConversationContent className={typing ? "flex h-[42px] items-center gap-1 px-4" : CONTENT}>
        {typing ? (
          [0, 1, 2].map((d) => (
            <motion.span
              key={d}
              className="size-1.5 rounded-full bg-ink/40"
              animate={{ opacity: [0.35, 1, 0.35], y: [0, -2, 0] }}
              transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: d * 0.15 }}
            />
          ))
        ) : (
          // The full text holds the bubble's size while the words arrive
          <span className="grid">
            <span aria-hidden className="invisible col-start-1 row-start-1">
              {text}
            </span>
            <StreamingText className="col-start-1 row-start-1">{words.slice(0, shown).join(" ")}</StreamingText>
          </span>
        )}
      </ConversationContent>
    </Bubble>
  );
}

/**
 * The thread as one moving piece. Whenever it grows, it's nudged down by
 * exactly the new height and springs back up, all together, the way a chat
 * scrolls; nothing in it can pass anything else.
 */
function Thread({ reduce, children }: { reduce: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = el.offsetHeight;
    // Runs after layout and before paint, so the nudge is never seen as a jump
    const ro = new ResizeObserver(() => {
      const height = el.offsetHeight;
      const grew = height - last;
      last = height;
      if (grew <= 0 || reduce) return;
      y.set(y.get() + grew);
      animate(y, 0, GLIDE);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [reduce, y]);

  return (
    <motion.div ref={ref} style={{ y }}>
      {children}
    </motion.div>
  );
}

/** Quick replies for the open question: a yes, a "not quite" that opens a field, or the two sides of a conflict. */
function Replies({ fact, onDecide }: { fact: Fact; onDecide: (id: string, state: FactState) => void }) {
  const [fixing, setFixing] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  if (fact.conflict)
    return (
      <div className="flex justify-end gap-2" role="group" aria-label={fact.conflict.question}>
        {fact.conflict.options.map((o, i) => (
          <Button
            key={o}
            type="button"
            variant="outline"
            size="md"
            rounded
            onClick={() => onDecide(fact.id, { status: "confirmed", value: i === 0 ? fact.label : "Congress Ave is open on Saturdays" })}
          >
            {o}
          </Button>
        ))}
      </div>
    );

  if (fixing)
    return (
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const v = input.current?.value.trim();
          if (v) onDecide(fact.id, v === fact.label ? { status: "confirmed" } : { status: "edited", value: v });
        }}
      >
        <label htmlFor={`chat-${fact.id}`} className="sr-only">
          What’s right?
        </label>
        <Input
          id={`chat-${fact.id}`}
          ref={input}
          defaultValue={fact.label}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          data-1p-ignore
          onKeyDown={(e) => e.key === "Escape" && setFixing(false)}
          className="h-10 flex-1 rounded-full px-4 text-base md:text-[15px]"
        />
        <Button type="submit" size="md" rounded>
          Send
        </Button>
      </form>
    );

  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" size="md" rounded onClick={() => setFixing(true)}>
        Not quite
      </Button>
      <Button type="button" variant="secondary" size="md" rounded onClick={() => onDecide(fact.id, { status: "confirmed" })}>
        Yes, that’s right
      </Button>
    </div>
  );
}
