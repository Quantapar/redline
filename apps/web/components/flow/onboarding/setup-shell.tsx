"use client";

import { ArrowRight, type LucideIcon } from "lucide-react";
import { Button } from "@/components/flow/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/flow/ui/radio-group";
import { cn } from "@/lib/flow/utils";

export const SETUP_STEPS = 3;

/** Clears the prototype bar at the bottom of the page. */
export const BAR_CLEARANCE = "pb-[calc(max(16px,env(safe-area-inset-bottom))+72px)]";

/**
 * One focused question per screen, centred under the app header and exactly
 * one screen tall, so the page never scrolls: the question, its answer, the
 * actions right under it, then an optional note or a visual filling the rest.
 */
export function StepShell({
  children,
  footer,
  note,
  after,
}: {
  children: React.ReactNode;
  footer: React.ReactNode;
  /** A quiet line under the actions. */
  note?: React.ReactNode;
  /** Fills the page below the actions, edge to edge. It clears the prototype bar itself. */
  after?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-[520px] flex-col px-5 pt-[calc(clamp(20px,5.5vh,60px)+30px)] sm:px-0",
        !after && BAR_CLEARANCE,
      )}
    >
      {children}
      <div className={cn("flex items-center gap-2", after ? "mt-3" : "mt-6")}>{footer}</div>
      {note && <div className="mt-5">{note}</div>}
      {after && (
        // Takes the room that's left, edge to edge and down to the bottom of the
        // page; the visual hides rather than overflow it
        <div className="fit-or-hide mt-[calc(clamp(32px,6.5vh,60px)-30px)] min-h-0 w-screen flex-1 self-center">
          <div className="h-full">{after}</div>
        </div>
      )}
    </div>
  );
}

/** Step dots. The current step stretches into a pill; scale, not width, so nothing reflows. */
export function Dots({ step, total }: { step: number; total: number }) {
  return (
    <p className="flex items-center gap-1" aria-label={`Step ${step} of ${total}`}>
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className="grid h-1.5 w-4 place-items-center">
          <span
            className={cn(
              "h-1.5 w-4 rounded-full transition-[transform,background-color] duration-300 ease-[var(--ease-out)]",
              i + 1 === step ? "scale-x-100 bg-brand" : i + 1 < step ? "scale-x-[0.375] bg-brand/40" : "scale-x-[0.375] bg-ink/15",
            )}
          />
        </span>
      ))}
    </p>
  );
}

/* ------------------------------ Headings & buttons -------------------------- */

/** Display heading shared by every screen before the report. */
export const HEADING = "text-[30px] leading-[1.1] font-medium tracking-[-0.025em] text-ink text-balance sm:text-[36px]";

export function StepHeading({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="text-center">
      <h1 className={HEADING}>{title}</h1>
      {children && (
        <p className="mx-auto mt-3 max-w-[440px] text-[17px] leading-[1.5] text-ink-2 text-pretty">{children}</p>
      )}
    </div>
  );
}

export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="secondary" size="xl" onClick={onClick}>
      Back
    </Button>
  );
}

/** Kobra's raised primary button, sized for the setup footer, with a trailing arrow. */
export function ContinueButton({ children, className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button size="xl" {...props} className={cn("group", className)}>
      {children}
      <ArrowRight
        data-icon="inline-end"
        className="size-4 transition-transform duration-200 group-enabled:group-hover:translate-x-0.5"
        strokeWidth={2}
        aria-hidden
      />
    </Button>
  );
}

/* ---------------------------------- Option rows ----------------------------- */

// Brand and ink are Kobra's raised surfaces, so a tile matches its buttons: ink is
// the secondary button, brand the primary one in the brand color (a picked row)
const TONES = {
  brand: "t-raise t-raise-primary text-white [--primary:var(--brand)]",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  ink: "t-raise t-raise-secondary text-ink-2",
} as const;

export type Tone = keyof typeof TONES;

export function IconTile({ icon: Icon, tone, className }: { icon: LucideIcon; tone: Tone; className?: string }) {
  return (
    <span
      className={cn(
        "relative isolate grid size-8 shrink-0 place-items-center rounded-[9px] transition-colors duration-200 before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:transition-[background-color,box-shadow] before:duration-200",
        TONES[tone],
        className,
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

/**
 * Rows for a Kobra RadioGroup: the radio's dot slides between rows when the
 * choice changes. The whole row is the label, so it's all one hit area.
 */
export function OptionGroup({
  value,
  onValueChange,
  label,
  children,
}: {
  value: string | null;
  onValueChange: (value: string) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <RadioGroup
      aria-label={label}
      value={value}
      onValueChange={(v) => onValueChange(String(v))}
      className="gap-2 [--primary:var(--brand)]"
    >
      {children}
    </RadioGroup>
  );
}

export function OptionRow({
  value,
  checked,
  media,
  title,
  detail,
}: {
  value: string;
  checked: boolean;
  media: React.ReactNode;
  title: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-[14px] bg-card px-3 py-2.5 transition-shadow duration-150",
        checked
          ? "shadow-[0_0_0_1.5px_var(--brand),0_1px_3px_rgb(20_20_30/0.06)]"
          : "shadow-[0_0_0_1px_var(--border),0_1px_2px_rgb(20_20_30/0.03)] hover:shadow-[0_0_0_1px_var(--input),0_1px_3px_rgb(20_20_30/0.06)]",
      )}
    >
      {media}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] text-ink">{title}</span>
        {detail && <span className="block truncate text-sm text-ink-3">{detail}</span>}
      </span>
      <RadioGroupItem value={value} className={cn("size-[18px]", checked && "border-brand")} />
    </label>
  );
}
