import type { Redis } from 'ioredis';
import { createRedis } from './connection.js';
import type { ScanEvent, EmitFn } from './events.js';

/**
 * The Redis pub/sub channel a scan's live events are published on. This MUST match
 * the subscriber in the web app (apps/web/lib/scan-events.ts), so the live scan
 * room shows real worker scans — not only the in-app demo, which published its own
 * events. Keeping the scheme here (one source) and mirroring it there avoids drift.
 */
export const channelFor = (scanId: string) => `redline:scan:${scanId}`;

/** A short-lived publisher connection for one scan job. */
export function scanEventPublisher(): Redis {
  return createRedis();
}

/** Build an EmitFn that publishes each event to the scan's channel. */
export function redisEmit(pub: Redis): EmitFn {
  return (ev: ScanEvent) => {
    void pub.publish(channelFor(ev.scanId), JSON.stringify(ev));
  };
}
