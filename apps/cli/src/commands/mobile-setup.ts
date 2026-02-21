import { Command } from 'commander';
import { Config, ConfigurationError } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { existsSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

export function createMobileSetupCommand(): Command {
  const command = new Command('mobile-setup');

  command
    .description('Generate mobile app .env file from CLI credentials')
    .action(async () => {
      const config = new Config();
      const logger = new Logger();

      try {
        config.requireConfiguration();

        const supabaseUrl = config.getSupabaseUrl();
        const supabaseAnonKey = config.getSupabaseAnonKey();

        // Look for apps/mobile directory relative to cwd
        const mobileDir = resolve(process.cwd(), 'apps', 'mobile');
        if (!existsSync(mobileDir)) {
          logger.error('Could not find apps/mobile directory.');
          logger.error('');
          logger.error('Make sure you run this command from the ClauTunnel project root:');
          logger.error('  cd clautunnel');
          logger.error('  clautunnel mobile-setup');
          process.exit(1);
        }

        const envPath = join(mobileDir, '.env');

        // Warn if .env already exists
        if (existsSync(envPath)) {
          logger.warn('apps/mobile/.env already exists and will be overwritten.');
        }

        const envContent = [
          `EXPO_PUBLIC_SUPABASE_URL=${supabaseUrl}`,
          `EXPO_PUBLIC_SUPABASE_ANON_KEY=${supabaseAnonKey}`,
          '',
        ].join('\n');

        writeFileSync(envPath, envContent);

        // Save mobile project path to config for clautunnel start
        config.setMobileProjectPath(mobileDir);

        logger.info('');
        logger.info('Mobile app configured successfully!');
        logger.info(`  Project: ${mobileDir}`);
        logger.info(`  .env: ${envPath}`);
        logger.info('');
        logger.info('The mobile server will start automatically with "clautunnel start".');
        logger.info('Use "clautunnel start --no-mobile" to skip mobile server.');
      } catch (error) {
        if (error instanceof ConfigurationError) {
          logger.error(error.message);
          process.exit(1);
        }
        logger.error(
          `Mobile setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  return command;
}
