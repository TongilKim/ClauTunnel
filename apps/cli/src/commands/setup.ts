import { Command } from 'commander';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { prompt } from '../utils/prompt.js';

export function createSetupCommand(): Command {
  const command = new Command('setup');

  command
    .description('Configure ClauTunnel with Supabase credentials')
    .action(async () => {
      const config = new Config();
      const logger = new Logger();

      try {
        logger.info('ClauTunnel Setup');
        logger.info('================');
        logger.info('');

        // Step 1: Project ID
        logger.info('[Step 1/2] Supabase Project ID');
        logger.info('');
        logger.info('  1. Go to your Supabase project dashboard');
        logger.info('  2. Settings > General > Copy "Project ID"');
        logger.info('');

        const projectId = await prompt('Project ID: ');
        if (!projectId) {
          logger.error('Supabase Project ID is required');
          process.exit(1);
        }

        // Check if user accidentally pasted a full URL
        if (projectId.includes('supabase.co') || projectId.startsWith('http')) {
          logger.error('');
          logger.error('Please enter only the Project ID, not the full URL.');
          logger.error('');
          logger.error('Example: abcdefghijklmnop');
          logger.error('NOT: https://abcdefghijklmnop.supabase.co');
          process.exit(1);
        }

        // Validate Project ID format (alphanumeric, no spaces/special chars)
        if (!/^[a-zA-Z0-9-]+$/.test(projectId)) {
          logger.error('');
          logger.error('Invalid Project ID format.');
          logger.error('The Project ID should only contain letters, numbers, and hyphens.');
          logger.error('');
          logger.error('You can find it at: Settings > General > Project ID');
          process.exit(1);
        }

        const url = `https://${projectId}.supabase.co`;
        logger.info('✓ Project ID saved');
        logger.info('');

        // Step 2: Anon Key
        logger.info('[Step 2/2] Supabase Anon Key');
        logger.info('');
        logger.info('  1. Go to your Supabase project dashboard');
        logger.info('  2. Settings > API Keys > Legacy anon Tab > Copy anon key');
        logger.info('');

        const anonKey = await prompt('Anon Key: ');
        if (!anonKey) {
          logger.error('Supabase Anon Key is required');
          process.exit(1);
        }

        config.setSupabaseCredentials({ url, anonKey });

        logger.info('');
        logger.info('✓ Configuration saved successfully!');
        logger.info('');
        logger.info('Next steps:');
        logger.info('  1. Run "clautunnel login" to authenticate');
        logger.info('  2. Run "clautunnel start" to begin a session');
      } catch (error) {
        logger.error(
          `Setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  return command;
}
