import { Redis } from 'ioredis';

/** Shared Redis connection for BullMQ (queue runs scans in order, fairly). */
export function createRedis(url = process.env.REDIS_URL ?? 'redis://localhost:6379'): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}
