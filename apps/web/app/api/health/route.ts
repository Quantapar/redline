import { NextResponse } from 'next/server';
import { sql } from '@redline/db';
import { Redis } from 'ioredis';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, 'ok' | 'down'> = { db: 'down', redis: 'down' };
  try {
    await db().execute(sql`select 1`);
    checks.db = 'ok';
  } catch { /* down */ }

  // Fail fast when Redis is unreachable: without a short connectTimeout, ioredis
  // waits ~10s by default, long enough for a load balancer to time out the whole
  // health check and cascade. 2s is plenty to confirm a reachable Redis.
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    connectTimeout: 2000,
  });
  try {
    await redis.connect();
    await redis.ping();
    checks.redis = 'ok';
  } catch { /* down */ } finally {
    redis.disconnect();
  }

  const healthy = checks.db === 'ok' && checks.redis === 'ok';
  return NextResponse.json({ status: healthy ? 'healthy' : 'degraded', checks }, { status: healthy ? 200 : 503 });
}
