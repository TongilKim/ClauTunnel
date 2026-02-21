import { Command } from 'commander';
import { Config, ConfigurationError } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { prompt, promptHidden } from '../utils/prompt.js';
import { createSupabaseClient } from '../utils/supabase.js';

export function createLoginCommand(): Command {
  const command = new Command('login');

  command.description('Authenticate with ClauTunnel').action(async () => {
    const config = new Config();
    const logger = new Logger();

    try {
      config.requireConfiguration();

      const supabase = createSupabaseClient(
        config.getSupabaseUrl(),
        config.getSupabaseAnonKey()
      );

      const email = await prompt('Email: ');
      const password = await promptHidden('Password: ');

      if (!email || !password) {
        logger.error('Email and password are required');
        process.exit(1);
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        logger.error(`Login failed: ${error.message}`);
        process.exit(1);
      }

      if (data.user) {
        logger.info(`Logged in as ${data.user.email}`);

        // Store session tokens securely
        if (data.session) {
          config.setSession({
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          });
          logger.info('Session saved');
        }
      }
    } catch (error) {
      if (error instanceof ConfigurationError) {
        logger.error(error.message);
        process.exit(1);
      }
      logger.error(
        `Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  });

  return command;
}
