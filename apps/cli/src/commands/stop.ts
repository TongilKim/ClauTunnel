import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../utils/logger.js';

const PID_FILE = path.join(os.homedir(), '.clautunnel', 'daemon.pid');

export function createStopCommand(): Command {
  const command = new Command('stop');

  command.description('Stop the running daemon').action(async () => {
    const logger = new Logger();

    try {
      if (!fs.existsSync(PID_FILE)) {
        logger.info('No daemon is running');
        return;
      }

      const pid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);

      if (isNaN(pid)) {
        logger.error('Invalid PID file');
        fs.unlinkSync(PID_FILE);
        return;
      }

      try {
        // Check if process exists
        process.kill(pid, 0);

        // Send SIGTERM
        process.kill(pid, 'SIGTERM');
        logger.info(`Sent stop signal to daemon (PID: ${pid})`);

        // Wait for process to exit
        let attempts = 0;
        while (attempts < 10) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          try {
            process.kill(pid, 0);
            attempts++;
          } catch {
            // Process has exited
            break;
          }
        }

        if (attempts >= 10) {
          logger.warn('Daemon did not stop gracefully, sending SIGKILL');
          process.kill(pid, 'SIGKILL');
        }

        logger.info('Daemon stopped');
      } catch (err: any) {
        if (err.code === 'ESRCH') {
          logger.info('Daemon process not found (already stopped)');
        } else {
          throw err;
        }
      }

      // Clean up PID file
      if (fs.existsSync(PID_FILE)) {
        fs.unlinkSync(PID_FILE);
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
