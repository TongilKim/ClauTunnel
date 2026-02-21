import { Command } from 'commander';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { MachineManager } from '../daemon/machine.js';
import { createSupabaseClient, restoreSession } from '../utils/supabase.js';

export function createStatusCommand(): Command {
  const command = new Command('status');

  command
    .description('Show connection status')
    .action(async () => {
      const config = new Config();
      const logger = new Logger();

      try {
        const supabase = createSupabaseClient(
          config.getSupabaseUrl(),
          config.getSupabaseAnonKey()
        );

        // Restore session from stored tokens
        const session = await restoreSession(supabase, config);
        if (!session) {
          logger.info('Status: Not authenticated');
          logger.info('Run "clautunnel login" to authenticate');
          return;
        }

        const { user } = session;

        logger.info(`User: ${user.email}`);

        const machineId = config.getMachineId();
        if (!machineId) {
          logger.info('Machine: Not registered');
          logger.info('Run "clautunnel start" to register this machine');
          return;
        }

        const machineManager = new MachineManager({ supabase });
        const machine = await machineManager.getMachine(machineId);

        if (!machine) {
          logger.info(`Machine ID: ${machineId} (not found)`);
          return;
        }

        logger.info(`Machine: ${machine.name} (${machine.id})`);
        logger.info(`Status: ${machine.status}`);
        logger.info(`Last seen: ${machine.last_seen_at}`);
      } catch (error) {
        logger.error(
          `Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  return command;
}
