import { Command } from 'commander';
import { Config, ConfigurationError } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { prompt, promptHidden } from '../utils/prompt.js';
import { createSupabaseClient } from '../utils/supabase.js';

export function createSignupCommand(): Command {
  const command = new Command('signup');

  command.description('Create a new ClauTunnel account').action(async () => {
    const config = new Config();
    const logger = new Logger();

    try {
      config.requireConfiguration();

      const supabase = createSupabaseClient(
        config.getSupabaseUrl(),
        config.getSupabaseAnonKey()
      );

      logger.info('Create a new ClauTunnel account');
      logger.info('');

      const email = await prompt('Email: ');
      if (!email) {
        logger.error('Email is required');
        process.exit(1);
      }

      const password = await promptHidden('Password: ');
      if (!password) {
        logger.error('Password is required');
        process.exit(1);
      }

      if (password.length < 6) {
        logger.error('Password must be at least 6 characters');
        process.exit(1);
      }

      const confirmPassword = await promptHidden('Confirm Password: ');
      if (password !== confirmPassword) {
        logger.error('Passwords do not match');
        process.exit(1);
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        logger.error(`Signup failed: ${error.message}`);
        process.exit(1);
      }

      if (data.user) {
        logger.info('');
        logger.info(`Account created for ${data.user.email}`);

        if (data.session) {
          config.setSession({
            accessToken: data.session.access_token,
            refreshToken: data.session.refresh_token,
          });
          logger.info('Logged in automatically');
        }

        logger.info('');
        logger.info('Next steps:');
        logger.info('  1. Run "clautunnel start" to begin a session');
        logger.info('  2. Set up the mobile app:');
        logger.info('     https://github.com/TongilKim/ClauTunnel#mobile-app-setup');
      }
    } catch (error) {
      if (error instanceof ConfigurationError) {
        logger.error(error.message);
        process.exit(1);
      }
      logger.error(
        `Signup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      process.exit(1);
    }
  });

  return command;
}
