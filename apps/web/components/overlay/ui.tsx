import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon } from '@/components/icon';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';

type IconDef = Parameters<typeof Icon>[0]['icon'];

/** Page header: a large title, optional meta line, optional right-aligned actions. */
export function Head({ title, meta, actions }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="ov-head">
      <div className="ov-head__text">
        <h2>{title}</h2>
        {meta ? <p>{meta}</p> : null}
      </div>
      {actions ? <div className="ov-head__actions">{actions}</div> : null}
    </header>
  );
}

/** A row of large clickable stat tiles. */
export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="ov-stats">{children}</div>;
}

export function Stat({
  label,
  value,
  note,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  href?: string;
  tone?: 'alarm';
}) {
  const inner = (
    <>
      <span className="ov-stat__label">{label}</span>
      <span className="ov-stat__value ov-num" style={tone === 'alarm' ? { color: 'var(--ov-accent)' } : undefined}>
        {value}
      </span>
      {note ? <span className="ov-stat__note">{note}</span> : null}
    </>
  );
  return href ? (
    <Link href={href} className="ov-stat">
      {inner}
    </Link>
  ) : (
    <div className="ov-stat">{inner}</div>
  );
}

/** A card panel with a titled head and optional right-aligned link/action. */
export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ov-card ov-panel${className ? ` ${className}` : ''}`}>
      <header className="ov-panel__head">
        <h3>{title}</h3>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function PanelLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="ov-link">
      {children}
    </Link>
  );
}

/** A 0..1 progress meter. */
export function Meter({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <div
      className="ov-meter"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <span style={{ transform: `scaleX(${v})` }} />
    </div>
  );
}

/** A quiet list of rows with a leading time/icon, a title, and trailing meta. */
export function Agenda({ children }: { children: ReactNode }) {
  return <ul className="ov-agenda">{children}</ul>;
}

export function AgendaRow({
  href,
  lead,
  title,
  trailing,
}: {
  href?: string;
  lead: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
}) {
  const body = (
    <>
      {lead}
      <span className="ov-agenda__title">{title}</span>
      {trailing ?? <span />}
    </>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="ov-agenda__row">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

/** Centered empty state. */
export function EmptyState({ icon, title, text }: { icon: IconDef; title: string; text: string }) {
  return (
    <div className="ov-empty">
      <span className="ov-empty__icon">
        <Icon icon={icon} size={20} strokeWidth={1.5} />
      </span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

/** A small status dot in a given color. */
export function Dot({ color, title }: { color: string; title?: string }) {
  return (
    <span
      aria-hidden
      title={title}
      style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 9999, background: color, flex: 'none' }}
    />
  );
}

export { ArrowRight01Icon };
