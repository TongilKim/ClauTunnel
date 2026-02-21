import { Command } from 'commander';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';

export function createLogoutCommand(): Command {
  const command = new Command('logout');

  command.description('Log out of ClauTunnel').action(async () => {
    const config = new Config();
    const logger = new Logger();

    const session = config.getSessionTokens();
    if (!session) {
      logger.info('Not currently logged in.');
      return;
    }

    config.clearSessionTokens();
    logger.info('Logged out successfully.');
  });

  return command;
}
