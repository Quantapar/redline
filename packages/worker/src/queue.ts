import { Queue } from 'bullmq';
import { createRedis } from './connection.js';

/**
 * The BullMQ queue name. Overridable via REDLINE_SCAN_QUEUE so an environment can
 * isolate its own line — most importantly so a test run never shares a queue with
 * a long-running dev worker (which would silently consume the test's jobs against
 * the wrong database). Read at call time so a process can set the env before it
 * creates the queue or worker.
 */
export function scanQueueName(): string {
  return process.env.REDLINE_SCAN_QUEUE ?? 'redline-scans';
}

/** Back-compat constant for consumers that read the name once at startup. */
export const SCAN_QUEUE = scanQueueName();

export interface ScanJobData {
  scanId: string;
}

export function createScanQueue(): Queue<ScanJobData> {
  return new Queue<ScanJobData>(scanQueueName(), { connection: createRedis() });
}

/**
 * Enqueue a scan. Larger customers do not block smaller ones: jobs are keyed so
 * one repo cannot monopolise the line (fair ordering via priority).
 */
export async function enqueueScan(queue: Queue<ScanJobData>, scanId: string, priority = 5): Promise<void> {
  await queue.add('scan', { scanId }, { priority, removeOnComplete: 1000, removeOnFail: 5000, attempts: 1 });
}
