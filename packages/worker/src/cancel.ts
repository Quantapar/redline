import { cancelScanIfActive, getScan, type Database } from '@redline/db';
import type { Queue } from 'bullmq';
import type { ScanJobData } from './queue.js';

/**
 * Cancel a scan: mark it cancelled and drop its queued job if it has not started.
 * A scan already complete, failed, or cancelled is left as-is.
 */
export async function cancelScan(
  db: Database,
  queue: Queue<ScanJobData>,
  scanId: string,
): Promise<{ cancelled: boolean; reason: string }> {
  const scan = await getScan(db, scanId);
  if (!scan) return { cancelled: false, reason: 'not found' };
  if (scan.status === 'complete' || scan.status === 'failed' || scan.status === 'cancelled') {
    return { cancelled: false, reason: `already ${scan.status}` };
  }

  // Remove any waiting/delayed job for this scan.
  const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized', 'paused']);
  for (const job of jobs) {
    if (job.data.scanId === scanId) await job.remove().catch(() => undefined);
  }

  // Atomic compare-and-set: if the worker completed (or the scan otherwise reached a
  // terminal state) in the race window since the read above, this cancels nothing and
  // we report the real state instead of clobbering a finished scan with 'cancelled'.
  const didCancel = await cancelScanIfActive(db, scanId);
  if (!didCancel) {
    const now = await getScan(db, scanId);
    return { cancelled: false, reason: now ? `already ${now.status}` : 'not found' };
  }
  return { cancelled: true, reason: 'cancelled' };
}
