import { cn } from "@/lib/flow/utils";

// Original marks for the sources a Redline scan reads: the repository, the
// mainnet fork it replays on, the Foundry harness, the referee council, and the
// chain state it measures. Simple geometric glyphs in Redline's palette — not
// third-party brand logos. The export names are kept from the onboarding so the
// radar, bento and verdict pick them up unchanged; each now means a scan source.

type LogoProps = { className?: string };

const TILE = <rect x="3" y="3" width="18" height="18" rx="5" fill="var(--secondary)" />;

/** Repository — the source under attack. */
export function GoogleLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      {TILE}
      <path d="M10 9l-3 3 3 3M14 9l3 3-3 3" stroke="var(--foreground)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mainnet fork — the throwaway chain each attack is replayed on. */
export function GoogleMapsLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      {TILE}
      <g stroke="var(--info)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="8" cy="7.5" r="1.5" fill="var(--info)" stroke="none" />
        <circle cx="16" cy="7.5" r="1.5" fill="var(--info)" stroke="none" />
        <circle cx="8" cy="16.5" r="1.5" fill="var(--info)" stroke="none" />
        <path d="M8 9v6M16 9v1.5a3 3 0 0 1-3 3H8" />
      </g>
    </svg>
  );
}

/** Foundry — the harness that runs each exploit as a real transaction. */
export function InstagramLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      {TILE}
      <path d="M10 5.5v3.8l-3.3 6.1A1.5 1.5 0 0 0 8 17.7h8a1.5 1.5 0 0 0 1.3-2.3L14 9.3V5.5" stroke="var(--warning)" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 5.5h6" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Referee council — the panel of models that must agree. */
export function GoogleAdsLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      {TILE}
      <path d="M12 8.5L8 14m4-5.5l4 5.5M9 15h6" stroke="var(--brand)" strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" />
      <g fill="var(--brand)">
        <circle cx="12" cy="7.3" r="1.8" />
        <circle cx="7.6" cy="15.2" r="1.8" />
        <circle cx="16.4" cy="15.2" r="1.8" />
      </g>
    </svg>
  );
}

/** Chain state — the ledger the theft is measured against. */
export function MetaLogo({ className }: LogoProps) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5", className)} aria-hidden>
      {TILE}
      <g stroke="var(--success)" strokeWidth="1.4" fill="none" strokeLinejoin="round">
        <rect x="7" y="6.8" width="10" height="3.3" rx="1" />
        <rect x="7" y="10.3" width="10" height="3.3" rx="1" />
        <rect x="7" y="13.8" width="10" height="3.3" rx="1" />
      </g>
    </svg>
  );
}
