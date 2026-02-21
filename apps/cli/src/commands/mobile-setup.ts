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

        logger.info('');
        logger.info('Mobile app .env file created successfully!');
        logger.info(`  ${envPath}`);
        logger.info('');
        logger.info('Next steps:');
        logger.info('  1. cd apps/mobile');
        logger.info('  2. pnpm start');
        logger.info('  3. Scan the QR code with Expo Go');
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
