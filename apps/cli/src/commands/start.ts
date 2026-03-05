import { Command } from 'commander';
import WebSocket from 'ws';
import { Daemon } from '../daemon/daemon.js';
import { MachineManager } from '../daemon/machine.js';
import { MachineRealtimeClient } from '../realtime/machine-client.js';
import { Config, ConfigurationError } from '../utils/config.js';
import { Logger } from '../utils/logger.js';
import { Spinner } from '../utils/spinner.js';
import { createSupabaseClient, restoreSession } from '../utils/supabase.js';
import {
  promptYesNo,
  enableSleepPrevention,
  startCaffeinate,
  cleanup as cleanupSleep,
  isMacOS,
  checkFullDiskAccess,
  getFullDiskAccessStatus,
  getTerminalAppName,
  openFullDiskAccessSettings,
  type SleepPreventionState,
  type FullDiskAccessStatus,
} from '../utils/sleep-prevention.js';
import { MobileServerManager } from '../mobile/mobile-server.js';
import { acquirePidFile, removePidFile } from '../utils/pid.js';
import type { MachineCommand } from 'clautunnel-shared';

// Polyfill WebSocket for Node.js (Supabase Realtime needs this)
if (typeof globalThis.WebSocket === 'undefined') {
  // @ts-expect-error WebSocket polyfill for Node.js
  globalThis.WebSocket = WebSocket;
}

export interface StartOptions {
  name?: string;
  preventSleep?: boolean;
  mobile?: boolean;
}

export function createStartCommand(): Command {
  const command = new Command('start');

  command
    .description('Start ClauTunnel and listen for session requests from mobile app')
    .option('-n, --name <name>', 'Machine name')
    .option('--prevent-sleep', 'Auto-enable sleep prevention (skip prompt)')
    .option('--no-mobile', 'Skip mobile server startup')
    .action(async (options: StartOptions) => {
      const config = new Config();
      const logger = new Logger();
      const spinner = new Spinner('Starting ClauTunnel...');

      const daemons: Map<string, Daemon> = new Map(); // sessionId -> Daemon
      let machineClient: MachineRealtimeClient | null = null;

      try {
        // Enforce single process per machine (atomic check + acquire)
        const existingPid = acquirePidFile();
        if (existingPid !== null) {
          logger.error(`Another clautunnel process is already running (PID: ${existingPid})`);
          logger.error('Run "clautunnel stop" first, or kill the existing process.');
          process.exit(1);
        }

        config.requireConfiguration();

        spinner.start();

        const supabase = createSupabaseClient(
          config.getSupabaseUrl(),
          config.getSupabaseAnonKey(),
          { realtime: true }
        );

        // Restore session from stored tokens
        spinner.update('Authenticating...');

        const session = await restoreSession(supabase, config);
        if (!session) {
          spinner.fail('Not authenticated');
          logger.error(
            'Run "clautunnel login" or "clautunnel signup" first.'
          );
          removePidFile();
          process.exit(1);
        }

        const { user } = session;

        // Persist tokens when Supabase auto-refreshes during long-running sessions
        const {
          data: { subscription: authSubscription },
        } = supabase.auth.onAuthStateChange((event, authSession) => {
          if (event === 'TOKEN_REFRESHED' && authSession) {
            config.setSessionTokens({
              accessToken: authSession.access_token,
              refreshToken: authSession.refresh_token,
            });
          }
        });

        spinner.update(`Authenticated as ${user.email}...`);

        // Check Full Disk Access (macOS only)
        let fdaStatus: FullDiskAccessStatus | null = null;

        if (isMacOS()) {
          spinner.stop();

          const terminalApp = getTerminalAppName();
          let fdaEnabled = checkFullDiskAccess();
          fdaStatus = getFullDiskAccessStatus(fdaEnabled, terminalApp);

          if (fdaStatus.enabled) {
            logger.info(`✓ Full Disk Access: ${fdaStatus.label}`);
          } else {
            logger.warn(`⚠ Full Disk Access: ${fdaStatus.label}`);
            logger.warn('');
            for (const line of fdaStatus.warning!.split('\n')) {
              logger.warn(`  ${line}`);
            }
            logger.warn('');

            const openSettings = await promptYesNo(
              'Open Full Disk Access settings? [Y/n]: '
            );

            if (openSettings) {
              openFullDiskAccessSettings();
              logger.info('');
              await promptYesNo(
                'Press Enter after enabling Full Disk Access (or Enter to skip): '
              );

              // Recheck FDA status
              fdaEnabled = checkFullDiskAccess();
              fdaStatus = getFullDiskAccessStatus(fdaEnabled, terminalApp);

              if (fdaStatus.enabled) {
                logger.info('✓ Full Disk Access: Enabled');
              } else {
                logger.warn('Full Disk Access still not enabled. Continuing without it.');
              }
            }

            logger.info('');
          }

          spinner.start();
        }

        // Handle sleep prevention (macOS only)
        const sleepState: SleepPreventionState = {
          caffeinateProcess: null,
          pmsetEnabled: false,
        };

        if (isMacOS()) {
          spinner.stop();

          // Auto-enable if --prevent-sleep flag is used, otherwise ask
          const enableSleep =
            options.preventSleep ||
            (await promptYesNo(
              'Prevent sleep when lid is closed? (keeps clautunnel running) [y/N]: '
            ));

          if (enableSleep) {
            logger.info('');
            logger.info('Enabling sleep prevention...');
            if (!options.preventSleep) {
              logger.info('This requires sudo password (auto-restored on exit)');
              logger.info('');
            }

            sleepState.pmsetEnabled = enableSleepPrevention();
            if (sleepState.pmsetEnabled) {
              logger.info('✓ Lid-closed mode enabled');
            } else {
              logger.warn('Failed to enable lid-closed mode. Using basic mode.');
            }

            // Start caffeinate to prevent idle sleep
            sleepState.caffeinateProcess = startCaffeinate();

            sleepState.caffeinateProcess.on('error', () => {
              logger.warn('Failed to start caffeinate');
            });

            logger.info('');
          }

          spinner.start();
        }

        // Mobile server
        let mobileServer: MobileServerManager | null = null;

        if (options.mobile !== false) {
          const mobileProjectPath = config.getMobileProjectPath();
          mobileServer = new MobileServerManager({
            mobileProjectPath,
            supabaseUrl: config.getSupabaseUrl(),
            supabaseAnonKey: config.getSupabaseAnonKey(),
            onProgress: (msg) => spinner.update(msg),
          });

          const result = await mobileServer.start();
          spinner.stop();

          if (result.started) {
            logger.info('');
            logger.info(`  Tunnel: ${result.tunnelUrl}`);
            logger.info('');
          } else {
            logger.error(`Mobile server failed: ${result.error}`);
            removePidFile();
            process.exit(1);
          }

          spinner.start();
        }

        // Cleanup helper
        const cleanup = async () => {
          removePidFile();
          if (mobileServer) {
            try {
              await mobileServer.stop();
            } catch {
              // Best-effort cleanup
            }
          }
          if (sleepState.pmsetEnabled) {
            console.log('Restoring sleep settings...');
          }
          cleanupSleep(sleepState);
        };

        spinner.update('Registering machine...');

        // Register machine
        const machineManager = new MachineManager({ supabase });
        const machine = await machineManager.registerMachine(
          user.id,
          options.name,
          config.getMachineId()
        );

        // Save machine ID for future use
        config.setMachineId(machine.id);

        // Handle process signals — registered after machine is available
        // so gracefulShutdown can reliably set offline status
        let isShuttingDown = false;

        const gracefulShutdown = async (signal: string) => {
          if (isShuttingDown) {
            console.log('\nForce exiting...');
            process.exit(1);
          }
          isShuttingDown = true;
          console.log(`\n[${signal}] Shutting down gracefully...`);
          try {
            for (const [sessionId, d] of daemons) {
              try {
                await d.stop();
              } catch {
                // Continue stopping other daemons
              }
              daemons.delete(sessionId);
            }
            // Set machine status to offline now that all sessions are stopped
            try {
              await machineManager.updateMachineStatus(machine.id, 'offline');
            } catch {
              // Best-effort - don't block shutdown
            }
            if (machineClient) {
              await machineClient.disconnect();
              machineClient = null;
            }
            authSubscription.unsubscribe();
            console.log('[Cleanup] All sessions ended in database');
            await cleanup();
          } catch (error) {
            console.error('[Cleanup] Error during shutdown:', error);
          }
          process.exit(0);
        };

        process.on('SIGINT', () => {
          gracefulShutdown('SIGINT').catch(console.error);
        });

        process.on('SIGTERM', () => {
          gracefulShutdown('SIGTERM').catch(console.error);
        });

        spinner.update('Connecting to realtime...');

        // Create machine-level realtime client
        machineClient = new MachineRealtimeClient({
          supabase,
          machineId: machine.id,
        });

        const connected = await machineClient.connect();

        spinner.stop();

        if (!connected) {
          logger.error('Failed to connect to Supabase Realtime.');
          logger.error('');
          logger.error('This may be a temporary issue. Try the following:');
          logger.error('  1. Open a new terminal and run "clautunnel start" again');
          logger.error('  2. Check your network connection');
          logger.error('  3. Try "clautunnel login" to refresh your session');
          removePidFile();
          process.exit(1);
        }

        logger.info('');
        logger.info('✓ ClauTunnel is ready!');
        logger.info(`  Machine: ${machine.name}`);
        if (fdaStatus) {
          if (fdaStatus.enabled) {
            logger.info(`  Full Disk Access: ${fdaStatus.label}`);
          } else {
            logger.warn(`  Full Disk Access: ${fdaStatus.label}`);
          }
        }
        if (sleepState.caffeinateProcess) {
          logger.info(
            `  Sleep prevention: ${sleepState.pmsetEnabled ? 'Lid-closed mode' : 'Basic mode'}`
          );
        }
        if (mobileServer) {
          logger.info('  Mobile server: Running');
        }
        logger.info('');
        logger.info('Open the mobile app to start a session.');
        logger.info('Press Ctrl+C to stop.');
        logger.info('');

        // Handle incoming commands from mobile
        machineClient.on('command', async (cmd: MachineCommand) => {
          if (cmd.type === 'start-session') {
            logger.info('Starting session (requested from mobile)...');

            try {
              const newDaemon = new Daemon({
                supabase,
                userId: user.id,
                machineId: machine.id,
                machineName: options.name,
                cwd: process.cwd(),
                hybrid: false,
              });

              newDaemon.on('started', async ({ session }) => {
                daemons.set(session.id, newDaemon);

                logger.info(`  Session: ${session.id.slice(0, 8)}...`);
                logger.info('  Mobile sync: Enabled');
                logger.info(`  Active sessions: ${daemons.size}`);
                logger.info('');

                await machineClient?.broadcastSessionStarted(
                  session.id,
                  process.cwd()
                );
              });

              newDaemon.on('error', (error: Error) => {
                logger.error(`Session error: ${error.message}`);
              });

              newDaemon.on('mobile-input', (prompt: string, attachments?: unknown[]) => {
                const hasImages = attachments && attachments.length > 0;
                const imageInfo = hasImages ? ` [+${attachments.length} image${attachments.length > 1 ? 's' : ''}]` : '';
                logger.info(`[Mobile] ${prompt}${imageInfo}`);
              });

              newDaemon.on('mobile-output', (data: string) => {
                const trimmed = data.trim();
                if (trimmed) {
                  logger.info(`[Claude] ${trimmed}`);
                }
              });

              newDaemon.on('mobile-disconnected', async () => {
                logger.info('Mobile disconnected. Ending session...');
                try {
                  await newDaemon.stop();
                } catch {
                  // Silently handle stop errors - stopped handler handles the rest
                }
              });

              newDaemon.on('stopped', async () => {
                const sessionId = newDaemon.getSession()?.id;
                if (sessionId) {
                  daemons.delete(sessionId);
                  await machineClient?.broadcastSessionEnded(sessionId);
                }

                logger.info('Session ended.');
                logger.info(`  Active sessions: ${daemons.size}`);
                logger.info('');
                if (daemons.size === 0) {
                  logger.info('Waiting for next session request...');
                  logger.info('');
                }
              });

              await newDaemon.start();
            } catch (error) {
              const errorMessage =
                error instanceof Error ? error.message : 'Unknown error';
              logger.error(`Failed to start session: ${errorMessage}`);
              await machineClient?.broadcastError(errorMessage);
            }
          }

          if (cmd.type === 'stop-session' && cmd.sessionId) {
            const targetDaemon = daemons.get(cmd.sessionId);
            if (targetDaemon) {
              logger.info(`Stopping session ${cmd.sessionId.slice(0, 8)}... (requested from mobile)`);
              try {
                await targetDaemon.stop();
              } catch {
                // Silently handle stop errors
              }
            }
          }
        });
      } catch (error) {
        removePidFile();
        if (error instanceof ConfigurationError) {
          spinner.stop();
          logger.error(error.message);
          process.exit(1);
        }
        spinner.fail('Failed to start');
        logger.error(
          `${error instanceof Error ? error.message : 'Unknown error'}`
        );
        process.exit(1);
      }
    });

  return command;
}
