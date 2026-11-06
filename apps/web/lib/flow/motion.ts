// Shared motion values, mirrored from the CSS custom properties in globals.css.
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
export const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
export const EASE_EXIT = [0.4, 0, 0.6, 1] as const;

/** One short shake on an element, without remounting it (so typed values survive). */
export function nudge(el: HTMLElement | null) {
  if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  el.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-4px)", offset: 0.25 },
      { transform: "translateX(3px)", offset: 0.6 },
      { transform: "translateX(0)" },
    ],
    { duration: 260, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
  );
}
