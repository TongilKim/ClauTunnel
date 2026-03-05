import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export const PID_FILE = path.join(os.homedir(), '.clautunnel', 'daemon.pid');

/**
 * PID file format: "pid:timestamp"
 * The timestamp is Date.now() at process start.
 * Used by removePidFile() to only remove files written by this process,
 * preventing one instance from deleting another's lock.
 *
 * Known limitation — PID reuse:
 * acquirePidFile() and stop both rely on kill(pid, 0) to check process
 * liveness, which cannot distinguish our daemon from an unrelated process
 * that was assigned the same PID after the daemon crashed. Pure Node.js
 * has no cross-platform way to verify process identity (start time, command
 * line, etc.) without shelling out to platform tools like `ps`.
 *
 * In practice this requires: daemon crash (no PID file cleanup) → OS
 * reassigns the exact same PID → user runs `clautunnel stop` or `start`
 * before noticing. The probability is extremely low given typical PID space
 * sizes (32768–99999+). If it does occur:
 * - `stop` may SIGTERM an unrelated process
 * - `start` may falsely report "already running"
 * In either case, manually deleting ~/.clautunnel/daemon.pid resolves it.
 */

const startTimestamp = Date.now();

/**
 * Atomically acquire the PID file lock.
 * Uses O_EXCL to prevent race conditions between concurrent start commands.
 * If the file already exists, checks whether the owning process is still alive.
 *
 * Returns the PID of an existing running process, or null if
 * the lock was successfully acquired.
 */
export function acquirePidFile(pidFile: string = PID_FILE): number | null {
  const dir = path.dirname(pidFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const content = `${process.pid}:${startTimestamp}`;

  try {
    // O_WRONLY | O_CREAT | O_EXCL — fails if file already exists
    const fd = fs.openSync(pidFile, 'wx');
    fs.writeSync(fd, content);
    fs.closeSync(fd);
    return null; // Lock acquired
  } catch (err: any) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }

  // File exists — check if the owning process is still alive
  const existing = parsePidFile(pidFile);
  if (existing === null) {
    // Invalid/empty file — remove and retry
    removePidFileUnchecked(pidFile);
    return acquirePidFile(pidFile);
  }

  if (isProcessAlive(existing.pid)) {
    return existing.pid; // Process is still running
  }

  // Process is dead — stale PID file
  removePidFileUnchecked(pidFile);
  return acquirePidFile(pidFile);
}

/**
 * Remove the PID file only if it was written by this process
 * (matching both PID and timestamp).
 * Prevents accidentally removing another instance's lock.
 */
export function removePidFile(pidFile: string = PID_FILE): void {
  const existing = parsePidFile(pidFile);
  if (existing && existing.pid === process.pid && existing.timestamp === startTimestamp) {
    removePidFileUnchecked(pidFile);
  }
}

/**
 * Read the PID from the PID file (ignoring the timestamp).
 * Used by stop command to find the daemon PID.
 */
export function readPidFile(pidFile: string = PID_FILE): number | null {
  const existing = parsePidFile(pidFile);
  return existing?.pid ?? null;
}

/**
 * Check if a process with the given PID is still alive.
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the PID file still exists (i.e., has not been cleaned up
 * by its owning process's graceful shutdown).
 */
export function pidFileExists(pidFile: string = PID_FILE): boolean {
  return fs.existsSync(pidFile);
}

function parsePidFile(pidFile: string): { pid: number; timestamp: number } | null {
  try {
    const content = fs.readFileSync(pidFile, 'utf-8').trim();
    // Support both "pid:timestamp" and legacy "pid" format
    const parts = content.split(':');
    const pid = parseInt(parts[0], 10);
    const timestamp = parts.length > 1 ? parseInt(parts[1], 10) : 0;
    if (isNaN(pid)) return null;
    return { pid, timestamp: isNaN(timestamp) ? 0 : timestamp };
  } catch {
    return null;
  }
}

function removePidFileUnchecked(pidFile: string): void {
  try {
    fs.unlinkSync(pidFile);
  } catch {
    // File may already be gone
  }
}
