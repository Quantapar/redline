/**
 * Redline's mark: a dark tile with one red line rising across it. The same
 * drawing is the favicon (app/icon.svg), the Open Graph image and the GitHub
 * App icon, so keep them in step when this changes.
 */
export const BRAND_RED = '#e5383b';

export function RedlineMark({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <rect width="32" height="32" rx="8" fill="#111111" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="7.5" stroke="#ffffff" strokeOpacity="0.14" />
      <path d="M7.5 21L13 15.5L17 19.5L24 12.5" stroke={BRAND_RED} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="24" cy="12.5" r="2.5" fill={BRAND_RED} />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <RedlineMark size={size} />
      <span className="text-[15px]">Redline</span>
    </span>
  );
}
