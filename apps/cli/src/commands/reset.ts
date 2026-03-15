import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { Config } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { PID_FILE, readPidFile, isProcessAlive } from '../utils/pid.js';
import { createSupabaseClient } from '../utils/supabase.js';
import { isMacOS } from '../utils/sleep-prevention.js';
import { promptYesNo } from '../utils/sleep-prevention.js';

interface ResetOptions {
  skipDb?: boolean;
  skipNgrok?: boolean;
  yes?: boolean;
}

export function createResetCommand(): Command {
  const command = new Command('reset');

  command
    .description('Reset to fresh user state (uninstall CLI, clean config & DB)')
    .option('--skip-db', 'Skip Supabase DB cleanup')
    .option('--skip-ngrok', 'Keep ngrok installed and configured')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (options: ResetOptions) => {
      const logger = new Logger();

      if (!options.yes) {
        logger.info('This will:');
        logger.info('  - Stop any running clautunnel processes');
        logger.info('  - Restore macOS sleep settings');
        if (!options.skipDb) {
          logger.info('  - Delete all your data from Supabase (machines, sessions, messages)');
        }
        logger.info('  - Uninstall clautunnel (npm & Homebrew)');
        if (!options.skipNgrok) {
          logger.info('  - Uninstall ngrok and remove its config');
        }
        logger.info('  - Delete ~/.clautunnel/ config directory');
        logger.info('');

        const confirmed = await promptYesNo('Are you sure? [y/N]: ');
        if (!confirmed) {
          logger.info('Aborted.');
          return;
        }
        logger.info('');
      }

      // ─── Step 1: Stop running processes ────────────────────────────
      logger.info('[1/7] Stopping running processes...');

      const pid = readPidFile();
      if (pid !== null && isProcessAlive(pid)) {
        try {
          process.kill(pid, 'SIGTERM');
          logger.info(`  - clautunnel daemon stopped (PID ${pid})`);
          // Give it a moment to clean up child processes
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch {
          logger.info('  - could not stop daemon');
        }
      } else {
        logger.info('  - no running daemon');
      }
      // Clean up PID file regardless
      try { fs.unlinkSync(PID_FILE); } catch { /* already gone */ }

      // Kill orphaned ngrok/expo processes
      try {
        execSync('pkill -f "ngrok.*tunnel" 2>/dev/null', { stdio: 'ignore' });
        logger.info('  - ngrok tunnel process killed');
      } catch { /* not running */ }

      try {
        execSync('pkill -f "expo start" 2>/dev/null', { stdio: 'ignore' });
        logger.info('  - expo process killed');
      } catch { /* not running */ }

      // Kill anything on the default Expo port (8081)
      try {
        const pids = execSync('lsof -ti tcp:8081', { stdio: 'pipe' }).toString().trim();
        if (pids) {
          for (const pid of pids.split('\n')) {
            try { process.kill(parseInt(pid, 10), 'SIGTERM'); } catch { /* already gone */ }
          }
          logger.info('  - port 8081 freed');
        }
      } catch { /* port already free */ }

      // ─── Step 2: Restore macOS sleep settings ──────────────────────
      logger.info('[2/7] Restoring macOS sleep settings...');

      if (isMacOS()) {
        try {
          const pmsetOutput = execSync('sudo pmset -g 2>/dev/null', { encoding: 'utf-8' });
          if (pmsetOutput.includes('disablesleep') && pmsetOutput.includes('1')) {
            execSync('sudo pmset -a disablesleep 0', { stdio: 'inherit' });
            logger.info('  - lid-close sleep restored');
          } else {
            logger.info('  - already normal');
          }
        } catch {
          logger.info('  - already normal');
        }

        // Kill leftover caffeinate
        try {
          execSync('pkill -f caffeinate 2>/dev/null', { stdio: 'ignore' });
          logger.info('  - caffeinate stopped');
        } catch { /* not running */ }
      } else {
        logger.info('  - not macOS, skipped');
      }

      // ─── Step 3: Clean Supabase DB ────────────────────────────────
      if (options.skipDb) {
        logger.info('[3/7] Skipping DB cleanup (--skip-db)');
      } else {
        await cleanSupabaseDb(logger);
      }

      // ─── Step 4: Uninstall CLI (npm) ──────────────────────────────
      logger.info('[4/7] Uninstalling CLI (npm)...');
      try {
        execSync('npm list -g @tongil_kim/clautunnel', { stdio: 'ignore' });
        execSync('npm uninstall -g @tongil_kim/clautunnel', { stdio: 'inherit' });
        logger.info('  - npm package removed');
      } catch {
        logger.info('  - not installed via npm, skipped');
      }

      // ─── Step 5: Uninstall CLI (Homebrew) ─────────────────────────
      logger.info('[5/7] Uninstalling CLI (Homebrew)...');
      try {
        execSync('brew list clautunnel', { stdio: 'ignore' });
        execSync('brew uninstall clautunnel', { stdio: 'inherit' });
        logger.info('  - Homebrew package removed');
      } catch {
        logger.info('  - not installed via Homebrew, skipped');
      }

      // ─── Step 6: Uninstall ngrok ──────────────────────────────────
      if (options.skipNgrok) {
        logger.info('[6/7] Skipping ngrok cleanup (--skip-ngrok)');
      } else {
        logger.info('[6/7] Uninstalling ngrok...');
        try {
          execSync('brew list ngrok', { stdio: 'ignore' });
          execSync('brew uninstall ngrok', { stdio: 'inherit' });
          logger.info('  - ngrok removed');
        } catch {
          try {
            execSync('which ngrok', { stdio: 'ignore' });
            logger.info('  - ngrok found but not installed via Homebrew, remove manually');
          } catch {
            logger.info('  - not installed, skipped');
          }
        }

        // Remove ngrok config directories
        const ngrokConfigDir = path.join(os.homedir(), '.config', 'ngrok');
        const ngrokLegacyDir = path.join(os.homedir(), '.ngrok2');

        if (fs.existsSync(ngrokConfigDir)) {
          fs.rmSync(ngrokConfigDir, { recursive: true, force: true });
          logger.info('  - ngrok config removed (~/.config/ngrok)');
        }
        if (fs.existsSync(ngrokLegacyDir)) {
          fs.rmSync(ngrokLegacyDir, { recursive: true, force: true });
          logger.info('  - ngrok legacy config removed (~/.ngrok2)');
        }
      }

      // ─── Step 7: Remove local data ────────────────────────────────
      logger.info('[7/7] Removing local data...');

      const configDir = path.join(os.homedir(), '.clautunnel');
      const legacyDir = path.join(os.homedir(), '.termbridge');

      if (fs.existsSync(configDir)) {
        fs.rmSync(configDir, { recursive: true, force: true });
        logger.info('  - ~/.clautunnel removed (config, logs, repo)');
      } else {
        logger.info('  - ~/.clautunnel already clean');
      }

      if (fs.existsSync(legacyDir)) {
        fs.rmSync(legacyDir, { recursive: true, force: true });
        logger.info('  - ~/.termbridge removed (legacy)');
      }

      logger.info('');
      logger.info('Done! Fresh user state restored.');
      logger.info('');
      logger.info('Next steps:');
      logger.info('  1. npm install -g @tongil_kim/clautunnel');
      logger.info('  2. clautunnel setup');
      logger.info('  3. clautunnel login');
      logger.info('  4. clautunnel start');
    });

  return command;
}

async function cleanSupabaseDb(logger: Logger): Promise<void> {
  const configDir = path.join(os.homedir(), '.clautunnel');
  const configFile = path.join(configDir, 'config.json');

  if (!fs.existsSync(configFile)) {
    logger.info('[3/7] Skipping DB cleanup (no config file found)');
    return;
  }

  let configData: any;
  try {
    configData = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  } catch {
    logger.info('[3/7] Skipping DB cleanup (invalid config file)');
    return;
  }

  const supabaseUrl = configData.supabaseUrl;
  const anonKey = configData.supabaseAnonKey;
  const accessToken = configData.sessionTokens?.accessToken;
  const refreshToken = configData.sessionTokens?.refreshToken;

  if (!supabaseUrl || !anonKey || !accessToken) {
    logger.info('[3/7] Skipping DB cleanup (missing credentials)');
    return;
  }

  logger.info('[3/7] Cleaning Supabase DB data...');

  // Refresh token in case it's expired
  const supabase = createSupabaseClient(supabaseUrl, anonKey);

  let token = accessToken;
  if (refreshToken) {
    const { data } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (data?.session) {
      token = data.session.access_token;
    }
  }

  // Delete push_tokens (no cascade from machines)
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${token}`,
    Prefer: 'return=minimal',
  };

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/push_tokens?select=*`, {
      method: 'DELETE',
      headers,
    });
    logger.info(res.ok ? '  - push_tokens cleared' : '  - push_tokens: skipped');
  } catch {
    logger.info('  - push_tokens: skipped');
  }

  // Delete machines (cascades to sessions -> messages)
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/machines?select=*`, {
      method: 'DELETE',
      headers,
    });
    logger.info(res.ok ? '  - machines cleared (sessions + messages cascade)' : '  - machines: skipped');
  } catch {
    logger.info('  - machines: skipped');
  }

  // Delete mobile_pairings
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/mobile_pairings?select=*`, {
      method: 'DELETE',
      headers,
    });
    logger.info(res.ok ? '  - mobile_pairings cleared' : '  - mobile_pairings: skipped');
  } catch {
    logger.info('  - mobile_pairings: skipped');
  }
}
