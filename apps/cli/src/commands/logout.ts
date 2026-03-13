import { Command } from 'commander';
import { Config, ConfigurationError } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { createSupabaseClient } from '../utils/supabase.js';

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

    try {
      config.requireConfiguration();

      const supabase = createSupabaseClient(
        config.getSupabaseUrl(),
        config.getSupabaseAnonKey()
      );
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });

      // If the stored session is already invalid, clear the local copy anyway.
      if (sessionError) {
        config.clearSessionTokens();
        logger.info('Stored session was already invalid. Cleared local auth.');
        return;
      }

      const { error: signOutError } = await supabase.auth.signOut({ scope: 'global' });
      if (signOutError) {
        logger.error(`Logout failed: ${signOutError.message}`);
        process.exit(1);
      }

      config.clearSessionTokens();
      logger.info('Logged out successfully.');
    } catch (error) {
      if (error instanceof ConfigurationError) {
        logger.error(error.message);
        process.exit(1);
      }
      logger.error(
        `Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  });

  return command;
}
