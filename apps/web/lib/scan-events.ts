import { Redis } from 'ioredis';
import type { ScanEvent } from '@redline/worker';

export const channelFor = (scanId: string) => `redline:scan:${scanId}`;
const url = () => process.env.REDIS_URL ?? 'redis://localhost:6379';

/** A short-lived publisher connection. */
export function publisher(): Redis {
  return new Redis(url());
}

export function publishEvent(pub: Redis, ev: ScanEvent): void {
  void pub.publish(channelFor(ev.scanId), JSON.stringify(ev));
}

/** A dedicated subscriber connection (ioredis requires one per subscriber). */
export function subscriber(): Redis {
  return new Redis(url());
}
