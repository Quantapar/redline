import { setScanStatus, getScan, type Database } from '@redline/db';
import type { Queue } from 'bullmq';
import type { ScanJobData } from './queue.js';

/**
 * Cancel a scan: mark it cancelled and drop its queued job if it has not started.
 * A scan already complete or failed is left as-is.
 */
export async function cancelScan(
  db: Database,
  queue: Queue<ScanJobData>,
  scanId: string,
): Promise<{ cancelled: boolean; reason: string }> {
  const scan = await getScan(db, scanId);
  if (!scan) return { cancelled: false, reason: 'not found' };
  if (scan.status === 'complete' || scan.status === 'failed') {
    return { cancelled: false, reason: `already ${scan.status}` };
  }

  // Remove any waiting/delayed job for this scan.
  const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized', 'paused']);
  for (const job of jobs) {
    if (job.data.scanId === scanId) await job.remove().catch(() => undefined);
  }

  await setScanStatus(db, scanId, 'cancelled', { finishedAt: new Date() });
  return { cancelled: true, reason: 'cancelled' };
}
