'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/icon';
import { StatusBadge } from '@/components/status-badge';
import {
  Target01Icon, AiBrain01Icon, JusticeScale01Icon, Bug01Icon, CheckmarkCircle02Icon,
  Settings02Icon, SourceCodeIcon,
} from '@hugeicons/core-free-icons';
import { SCAN_STATUS_LABEL } from '@/lib/format';

type Ev = Record<string, unknown> & { type: string; at: string };

const STAGES = [
  { key: 'preparing', label: 'Prepare', icon: Settings02Icon },
  { key: 'hunting', label: 'Hunt', icon: Target01Icon },
  { key: 'verifying', label: 'Verify', icon: JusticeScale01Icon },
  { key: 'judging', label: 'Judge', icon: SourceCodeIcon },
  { key: 'complete', label: 'Done', icon: CheckmarkCircle02Icon },
];

function eventLine(ev: Ev): { icon: Parameters<typeof Icon>[0]['icon']; text: string; hue?: 'error' | 'success' } | null {
  switch (ev.type) {
    case 'status': return { icon: Settings02Icon, text: `Stage: ${SCAN_STATUS_LABEL[String(ev.status)] ?? ev.status}` };
    case 'log': return { icon: Settings02Icon, text: String(ev.message) };
    case 'candidate': return { icon: AiBrain01Icon, text: `${String(ev.model)} proposed a ${String(ev.weaknessClass)} attack on ${String(ev.contract)}` };
    case 'referee': return { icon: JusticeScale01Icon, text: `${String(ev.referee)} ran the attack: ${String(ev.outcome)}`, hue: ev.outcome === 'moved' ? 'error' : undefined };
    case 'finding': return { icon: Bug01Icon, text: `${String(ev.title)} — ${String(ev.consensus)}`, hue: ev.isRed ? 'error' : 'success' };
    case 'done': return { icon: CheckmarkCircle02Icon, text: `Scan complete — ${Number(ev.redCount)} red`, hue: Number(ev.redCount) > 0 ? 'error' : 'success' };
    default: return null;
  }
}

export function LiveScanFeed({ scanId, initialStatus }: { scanId: string; initialStatus: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<Ev[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const [done, setDone] = useState(initialStatus === 'complete' || initialStatus === 'failed');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done) return;
    const es = new EventSource(`/api/scans/${scanId}/stream`);
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as Ev;
        if (ev.type === 'open') return;
        if (ev.type === 'status') setStatus(String(ev.status));
        setEvents((prev) => [...prev, ev]);
        if (ev.type === 'done') {
          setStatus('complete');
          setDone(true);
          es.close();
          setTimeout(() => router.refresh(), 800);
        }
      } catch {
        /* ignore */
      }
    };
    // Let EventSource auto-reconnect on transient blips; the done handler and the
    // status poll below both close it deliberately when the scan is actually finished.
    es.onerror = () => { /* keep the connection; native retry handles transient errors */ };

    // Fallback: poll status in case the live stream missed the 'done' event.
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/scans/${scanId}/status`, { cache: 'no-store' });
        const d = await r.json();
        if (d.status === 'complete' || d.status === 'failed') {
          setStatus(d.status);
          setDone(true);
          es.close();
          clearInterval(poll);
          setTimeout(() => router.refresh(), 600);
        }
      } catch {
        /* ignore */
      }
    }, 2000);

    return () => {
      es.close();
      clearInterval(poll);
    };
  }, [scanId, done, router]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [events]);

  const activeStage = STAGES.findIndex((s) => s.key === status);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1.5">
        {STAGES.map((s, i) => {
          const state = i < activeStage || status === 'complete' ? 'done' : i === activeStage ? 'active' : 'pending';
          return (
            <div key={s.key} className="flex flex-1 items-center gap-1.5">
              <div className={`flex size-7 items-center justify-center rounded-full border ${state === 'done' ? 'border-[var(--success)]/40 bg-[var(--success)]/10 text-[var(--success)]' : state === 'active' ? 'border-foreground/30 bg-muted text-foreground' : 'border-border text-muted-foreground'}`}>
                <Icon icon={s.icon} size={14} />
              </div>
              <span className={`text-[11px] ${state === 'pending' ? 'text-muted-foreground' : 'text-foreground'}`}>{s.label}</span>
              {i < STAGES.length - 1 ? <div className={`h-px flex-1 ${i < activeStage || status === 'complete' ? 'bg-[var(--success)]/40' : 'bg-border'}`} /> : null}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className={`size-2 rounded-full ${done ? 'bg-muted-foreground' : 'animate-pulse bg-[var(--success)]'}`} />
          <span className="text-[12px] font-medium">{done ? 'Scan finished' : 'Live — attacking on a throwaway fork'}</span>
          <div className="ml-auto"><StatusBadge hue={done ? 'neutral' : 'info'} size="sm">{SCAN_STATUS_LABEL[status] ?? status}</StatusBadge></div>
        </div>
        <div className="max-h-80 overflow-y-auto p-2 font-mono text-[12px]">
          {events.length === 0 ? (
            <div className="px-2 py-6 text-center text-muted-foreground">Waiting for the first attack…</div>
          ) : (
            events.map((ev, i) => {
              const line = eventLine(ev);
              if (!line) return null;
              return (
                <div key={i} className="flex items-center gap-2 px-2 py-1">
                  <Icon icon={line.icon} size={13} className={line.hue === 'error' ? 'text-destructive' : line.hue === 'success' ? 'text-[var(--success)]' : 'text-muted-foreground'} />
                  <span className={line.hue === 'error' ? 'text-destructive' : ''}>{line.text}</span>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>
      </div>
    </div>
  );
}
