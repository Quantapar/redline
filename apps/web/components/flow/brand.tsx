import { cn } from "@/lib/flow/utils";
import { RedlineMark } from "@/components/brand";

/** Redline's mark + wordmark, used in the flow header. */
export function ConcisionLogo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <RedlineMark size={24} />
      <span className="text-[18px] leading-none font-medium tracking-[-0.02em]">Redline</span>
    </span>
  );
}

/**
 * The target repository's mark — a generic code tile, not a third-party logo.
 * Shown where the onboarding showed the business's favicon.
 */
export function BusinessMark({ className }: { className?: string }) {
  return (
    <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl bg-secondary text-ink", className)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" aria-hidden>
        <path
          d="M9 8l-3.5 4L9 16M15 8l3.5 4L15 16"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
