import { Queue } from 'bullmq';
import { createRedis } from './connection.js';

export const SCAN_QUEUE = 'redline-scans';

export interface ScanJobData {
  scanId: string;
}

export function createScanQueue(): Queue<ScanJobData> {
  return new Queue<ScanJobData>(SCAN_QUEUE, { connection: createRedis() });
}

/**
 * Enqueue a scan. Larger customers do not block smaller ones: jobs are keyed so
 * one repo cannot monopolise the line (fair ordering via priority).
 */
export async function enqueueScan(queue: Queue<ScanJobData>, scanId: string, priority = 5): Promise<void> {
  await queue.add('scan', { scanId }, { priority, removeOnComplete: 1000, removeOnFail: 5000, attempts: 1 });
}
