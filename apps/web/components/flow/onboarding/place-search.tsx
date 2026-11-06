"use client";

import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { MapPin, Search } from "lucide-react";
import type { Location } from "@/lib/flow/fleet";
import { EASE_EXIT, EASE_OUT } from "@/lib/flow/motion";
import { Input } from "@/components/flow/ui/input";
import { Spinner } from "@/components/flow/ui/spinner";
import { cn } from "@/lib/flow/utils";

type Status = "idle" | "loading" | "done" | "error";

const label = (l: Location) => `${l.name}, ${l.nickname}`;

/**
 * A shop that isn't in the list, found on the map (through /api/places: Google
 * with a key, OpenStreetMap without) so nobody has to go back a step. Once
 * picked it reads as the selected option.
 */
export function PlaceSearch({
  picked,
  onPick,
  onSearch,
  onListChange,
}: {
  /** The shop picked from the map search, while it's the one selected. */
  picked: Location | null;
  onPick: (l: Location) => void;
  /** Whether the field is in use for a new search, rather than empty or showing a pick. */
  onSearch: (searching: boolean) => void;
  /** Whether the results list is showing, so whatever it floats over can step aside. */
  onListChange?: (open: boolean) => void;
}) {
  const reduce = useReducedMotion();
  const id = useId();
  const [query, setQuery] = useState(picked ? label(picked) : "");
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<Location[]>([]);
  // Where the results came from, so OpenStreetMap gets its credit
  const [source, setSource] = useState<"google" | "openstreetmap" | null>(null);

  const q = query.trim();
  const showingPick = picked !== null && query === label(picked);

  // Search once typing settles, only while the field is in use; a newer
  // query cancels the older one
  useEffect(() => {
    if (!open || showingPick || q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        const data = (await res.json()) as { places?: Location[]; error?: string; source?: "google" | "openstreetmap" };
        if (!res.ok) return setStatus("error");
        setResults(data.places ?? []);
        setSource(data.source ?? null);
        setStatus("done");
      } catch (e) {
        if ((e as Error).name !== "AbortError") setStatus("error");
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, q, showingPick]);

  function pick(l: Location) {
    onPick(l);
    setQuery(label(l));
    setOpen(false);
  }

  const visible = open && !showingPick && q.length >= 2 && status !== "idle";
  useEffect(() => {
    onListChange?.(visible);
  }, [visible, onListChange]);

  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        Search for another shop
      </label>
      {showingPick ? (
        <MapPin
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink"
          strokeWidth={1.75}
          aria-hidden
        />
      ) : (
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3"
          strokeWidth={1.75}
          aria-hidden
        />
      )}
      <Input
        id={id}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          onSearch(e.target.value.trim().length > 0);
        }}
        // Clicking in already means another shop; leaving it empty gives the old one back
        onFocus={() => {
          setOpen(true);
          if (!showingPick) onSearch(true);
        }}
        onBlur={() => {
          setOpen(false);
          if (!query.trim()) onSearch(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && visible && results[0]) {
            e.preventDefault();
            pick(results[0]);
          }
        }}
        placeholder="Not listed? Search for your shop"
        autoComplete="off"
        spellCheck={false}
        data-1p-ignore
        role="combobox"
        aria-expanded={visible}
        aria-controls={`${id}-results`}
        className={cn(
          "h-12 rounded-[14px] bg-card pr-10 pl-10 text-[15px] md:text-[15px] [&::-webkit-search-cancel-button]:hidden",
          // Selected, it wears the same ring as a picked option row above it
          showingPick && "border-transparent shadow-[0_0_0_1.5px_var(--brand),0_1px_3px_rgb(20_20_30/0.06)]",
        )}
      />
      <span className="pointer-events-none absolute top-1/2 right-3.5 grid -translate-y-1/2 place-items-center" aria-hidden>
        {status === "loading" && !showingPick && <Spinner className="size-4 text-ink-3" />}
      </span>

      {/* Results float over the actions, like the Find step's autocomplete */}
      <div id={`${id}-results`} aria-live="polite" className="absolute inset-x-0 top-full z-20 mt-2">
        <AnimatePresence initial={false}>
          {visible && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "translateY(-4px) scale(0.99)" }}
              animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
              exit={{ opacity: 0, transition: { duration: 0.12, ease: EASE_EXIT } }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="surface-floating origin-top rounded-[14px] p-1.5"
            >
              {status === "done" && results.length > 0 ? (
                <>
                {results.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    // Pick before the input's blur closes the list
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(l)}
                    className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-[9px] bg-muted text-ink-2">
                      <MapPin className="size-4" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink">{l.name}</span>
                      <span className="block truncate text-sm text-ink-3">{l.address}</span>
                    </span>
                  </button>
                ))}
                {source === "openstreetmap" && (
                  <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-ink-3">Map data © OpenStreetMap contributors</p>
                )}
                </>
              ) : (
                <p className="px-2.5 py-2 text-sm text-ink-2">
                  {status === "loading"
                    ? "Searching…"
                    : status === "done"
                      ? `Nothing found for “${q}”. Try the street or the shop’s name.`
                      : "Couldn’t search right now. Try again in a moment."}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
