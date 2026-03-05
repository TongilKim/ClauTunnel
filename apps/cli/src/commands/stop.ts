import { Command } from 'commander';
import * as fs from 'fs';
import { Logger } from '../utils/logger.js';
import { PID_FILE, readPidFile, isProcessAlive, pidFileExists } from '../utils/pid.js';

export function createStopCommand(): Command {
  const command = new Command('stop');

  command.description('Stop the running daemon').action(async () => {
    const logger = new Logger();

    try {
      const pid = readPidFile();

      if (pid === null) {
        logger.info('No daemon is running');
        return;
      }

      if (!isProcessAlive(pid)) {
        logger.info('Daemon process not found (already stopped)');
        try { fs.unlinkSync(PID_FILE); } catch { /* already gone */ }
        return;
      }

      try {
        // Note: We cannot verify that the process at this PID is actually
        // clautunnel (see PID reuse limitation in pid.ts). We rely on:
        // 1. The PID file existing (written only by clautunnel start)
        // 2. The process being alive at that PID
        // 3. Post-SIGTERM: PID file removal by gracefulShutdown as confirmation
        //
        // Send SIGTERM — the daemon's gracefulShutdown handler will:
        // 1. Stop all sessions, set machine offline
        // 2. Call removePidFile() to clean up
        // 3. Exit the process
        process.kill(pid, 'SIGTERM');
        logger.info(`Sent stop signal to daemon (PID: ${pid})`);

        // Wait for process to exit.
        // We watch for PID file removal as confirmation that our process
        // handled the signal (not an unrelated process with a reused PID).
        let attempts = 0;
        let pidFileRemoved = false;
        while (attempts < 10) {
          await new Promise((resolve) => setTimeout(resolve, 500));

          if (!pidFileExists()) {
            // PID file was cleaned up by gracefulShutdown — confirmed our process
            pidFileRemoved = true;
            break;
          }

          if (!isProcessAlive(pid)) {
            // Process exited but didn't clean up PID file (crash during shutdown)
            break;
          }

          attempts++;
        }

        if (attempts >= 10 && !pidFileRemoved) {
          // Process didn't exit after 5 seconds.
          // Only SIGKILL if the PID file still has the original PID,
          // confirming the process hasn't been replaced.
          const currentPid = readPidFile();
          if (currentPid === pid && isProcessAlive(pid)) {
            logger.warn('Daemon did not stop gracefully, sending SIGKILL');
            process.kill(pid, 'SIGKILL');
          }
        }

        logger.info('Daemon stopped');
      } catch (err: any) {
        if (err.code === 'ESRCH') {
          logger.info('Daemon process not found (already stopped)');
        } else {
          throw err;
        }
      }

      // Clean up PID file if still present (crash during shutdown).
      // Only remove if it still contains the PID we were stopping.
      const currentPid = readPidFile();
      if (currentPid === pid) {
        try { fs.unlinkSync(PID_FILE); } catch { /* already gone */ }
      }
    } catch (error) {
      logger.error(
        `Failed to stop daemon: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  });

  return command;
}
