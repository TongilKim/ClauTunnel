import { Command } from 'commander';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { createSupabaseClient, restoreSession } from '../utils/supabase.js';

export function createLogoutCommand(): Command {
  const command = new Command('logout');

  command.description('Log out of ClauTunnel and revoke all device sessions').action(async () => {
    const config = new Config();
    const logger = new Logger();

    const session = config.getSessionTokens();
    if (!session) {
      logger.info('Not currently logged in.');
      return;
    }

    // Revoke all sessions (CLI + paired mobile devices)
    // This invalidates all refresh tokens. Access tokens remain valid until
    // they expire (default 1hr), but no new tokens can be issued.
    try {
      const supabase = createSupabaseClient(
        config.getSupabaseUrl(),
        config.getSupabaseAnonKey()
      );

      const restored = await restoreSession(supabase, config);
      if (restored) {
        const { error } = await supabase.auth.signOut({ scope: 'global' });
        if (error) {
          logger.warn(`Warning: failed to revoke remote sessions: ${error.message}`);
          logger.warn('Local credentials cleared, but mobile devices may remain active until their tokens expire.');
        } else {
          logger.info('All device sessions revoked.');
        }
      }
    } catch {
      // Best-effort — still clear local tokens even if revocation fails
      logger.warn('Warning: could not reach server to revoke sessions.');
    }

    config.clearSessionTokens();
    logger.info('Logged out successfully.');
  });

  return command;
}
