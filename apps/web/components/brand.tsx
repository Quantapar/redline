export function RedlineMark({ size = 22 }: { size?: number }) {
  // A single red line cutting across — the brand.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" stroke="var(--border)" />
      <path d="M5 15.5L10 10.5L13.5 14L19 8" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="19" cy="8" r="1.6" fill="var(--brand)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <RedlineMark />
      <span className="text-[15px]">Redline</span>
    </span>
  );
}
