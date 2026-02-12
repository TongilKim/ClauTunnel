import { EventEmitter } from 'events';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SdkSession } from './sdk-session.js';
import { SessionManager } from './session.js';
import { MachineManager } from './machine.js';
import { ConfigManager } from './config-manager.js';
import { RealtimeClient } from '../realtime/client.js';
import type { Session, Machine, RealtimeMessage, ImageAttachment, PermissionMode, UserQuestionData, PermissionRequestData } from 'termbridge-shared';

export interface DaemonOptions {
  supabase: SupabaseClient;
  userId: string;
  machineId?: string;
  machineName?: string;
  cwd: string;
  hybrid?: boolean;
}

export class Daemon extends EventEmitter {
  private options: DaemonOptions;
  private sdkSession: SdkSession;
  private sessionManager: SessionManager;
  private machineManager: MachineManager;
  private configManager: ConfigManager;
  private realtimeClient: RealtimeClient | null = null;
  private machine: Machine | null = null;
  private session: Session | null = null;
  private running: boolean = false;
  private commandsBroadcast: boolean = false;
  private sdkCommandsBroadcast: boolean = false;

  constructor(options: DaemonOptions) {
    super();
    this.options = options;

    this.sdkSession = new SdkSession({
      cwd: options.cwd,
    });

    this.sessionManager = new SessionManager({
      supabase: options.supabase,
    });

    this.machineManager = new MachineManager({
      supabase: options.supabase,
    });

    this.configManager = new ConfigManager({
      cwd: options.cwd,
    });

    // Initialize thinking mode from settings
    const thinkingEnabled = this.configManager.getThinkingMode();
    if (thinkingEnabled) {
      this.sdkSession.setThinkingMode(true);
    }
  }

  async start(): Promise<void> {
    if (this.running) {
      throw new Error('Daemon is already running');
    }

    // Register machine
    this.machine = await this.machineManager.registerMachine(
      this.options.userId,
      this.options.machineName,
      this.options.machineId
    );

    // Create session
    this.session = await this.sessionManager.createSession(
      this.machine.id,
      this.options.cwd
    );

    // Initialize realtime client
    this.realtimeClient = new RealtimeClient({
      supabase: this.options.supabase,
      sessionId: this.session.id,
    });

    // Wire up SDK session output to broadcast
    this.sdkSession.on('output', async (data: string) => {
      // Hybrid mode: output to local stdout
      if (this.options.hybrid !== false) {
        process.stdout.write(data);
      }

      // Emit for external listeners (e.g., start command logging)
      this.emit('mobile-output', data);

      // Broadcast to mobile
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcast(data);
        } catch {
          // Silently handle broadcast errors
        }
      }
    });

    this.sdkSession.on('error', (error: Error) => {
      this.emit('error', error);
    });

    // Broadcast commands when they're updated from init message (includes plugins/skills)
    this.sdkSession.on('commands-updated', async () => {
      await this.broadcastCommands();
    });

    // Save SDK session ID to Supabase for resume functionality
    this.sdkSession.on('session-started', async (sdkSessionId: string) => {
      if (!this.session) return;
      try {
        await this.sessionManager.updateSdkSessionId(this.session.id, sdkSessionId);
      } catch {
        // Silently handle - non-critical for basic functionality
      }
    });

    this.sdkSession.on('complete', async () => {
      // Session query completed, ready for next input
      if (this.options.hybrid !== false) {
        process.stdout.write('\n> ');
      }

      // Broadcast completion to mobile so it knows Claude is done
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcastComplete();
        } catch {
          // Silently handle broadcast errors
        }
      }

      // Broadcast real SDK commands (including custom skills) after first query completion
      // This updates the fallback commands with the full list from the SDK
      if (!this.sdkCommandsBroadcast && this.realtimeClient) {
        this.sdkCommandsBroadcast = true;
        await this.broadcastCommands();
      }
    });

    // Wire up permission mode changes to broadcast
    this.sdkSession.on('permission-mode', async (mode: PermissionMode) => {
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcastMode(mode);
        } catch {
          // Silently handle broadcast errors
        }
      }
    });

    // Wire up user questions to broadcast to mobile
    this.sdkSession.on('user-question', async (questionData: UserQuestionData) => {
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcastUserQuestion(questionData);
        } catch {
          // Silently handle broadcast errors
        }
      }
    });

    // Wire up request rejection errors to broadcast to mobile
    this.sdkSession.on('request-rejected', async (errorMessage: string) => {
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcastError(errorMessage, 'request_rejected');
        } catch {
          // Silently handle broadcast errors
        }
      }
    });

    // Wire up permission requests to broadcast to mobile
    this.sdkSession.on('permission-request', async (requestData: PermissionRequestData) => {
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcastPermissionRequest(requestData);
        } catch {
          // Silently handle broadcast errors
        }
      }
    });

    // Wire up model changes to broadcast and persist
    this.sdkSession.on('model', async (model: string) => {
      // Persist model to database for this session
      if (this.session) {
        try {
          await this.sessionManager.updateSessionModel(this.session.id, model);
        } catch {
          // Silently handle persistence errors
        }
      }

      // Broadcast to mobile
      if (this.realtimeClient) {
        try {
          await this.realtimeClient.broadcastModel(model);
        } catch {
          // Silently handle broadcast errors
        }
      }
    });

    // Wire up input from mobile
    this.realtimeClient.on('input', async (message: RealtimeMessage) => {
      // Broadcast commands on first message from mobile if not already done
      if (!this.commandsBroadcast) {
        this.commandsBroadcast = true;
        await this.broadcastCommands();
      }

      // Handle mode change requests
      if (message.type === 'mode-change' && message.permissionMode) {
        this.sdkSession.setPermissionMode(message.permissionMode);
        // Broadcast the new mode back to confirm
        if (this.realtimeClient) {
          try {
            await this.realtimeClient.broadcastMode(message.permissionMode);
          } catch {
            // Silently handle broadcast errors
          }
        }
        return;
      }

      // Handle commands request
      if (message.type === 'commands-request') {
        await this.broadcastCommands();
        return;
      }

      // Handle model change requests
      if (message.type === 'model-change' && message.model) {
        const previousModel = this.sdkSession.getModel();
        await this.sdkSession.setModel(message.model);

        // Output confirmation message if model actually changed
        if (previousModel !== message.model) {
          const modelNames: Record<string, string> = {
            'default': 'Opus 4.6',
            'sonnet': 'Sonnet 4',
            'opus': 'Opus 4.6',
            'haiku': 'Haiku 3.5',
          };
          const displayName = modelNames[message.model] || message.model;
          const confirmationMsg = `[Model switched to ${displayName}]`;

          // Output to local terminal
          if (this.options.hybrid !== false) {
            process.stdout.write(`\n${confirmationMsg}\n`);
          }

          // Broadcast to mobile as system message (appears as separate bubble)
          if (this.realtimeClient) {
            try {
              await this.realtimeClient.broadcastSystem(confirmationMsg);
            } catch {
              // Silently handle broadcast errors
            }
          }
        }
        return;
      }

      // Handle models request - send both available models and current model
      if (message.type === 'models-request') {
        await this.broadcastModels();
        // Also broadcast the current model so UI shows the correct selection
        try {
          await this.realtimeClient?.broadcastModel(this.sdkSession.getModel());
        } catch {
          // Silently handle broadcast errors
        }
        return;
      }

      // Handle mobile disconnect notification
      if (message.type === 'mobile-disconnect') {
        if (this.options.hybrid !== false) {
          process.stdout.write('\n[TermBridge] Mobile client disconnected.\n');
        }
        this.emit('mobile-disconnected');
        return;
      }

      // Handle interactive command request
      if (message.type === 'interactive-request' && message.interactiveCommand) {
        const data = this.configManager.getInteractiveData(message.interactiveCommand);
        if (this.realtimeClient) {
          try {
            await this.realtimeClient.broadcastInteractiveResponse(data);
          } catch {
            // Silently handle broadcast errors
          }
        }
        return;
      }

      // Handle interactive apply
      if (message.type === 'interactive-apply' && message.interactivePayload) {
        const result = this.configManager.applyChange(message.interactivePayload);

        // If thinking mode was changed, also update the running SDK session
        if (
          message.interactivePayload.command === 'config' &&
          message.interactivePayload.key === 'alwaysThinkingEnabled'
        ) {
          const enabled = Boolean(message.interactivePayload.value);
          await this.sdkSession.setThinkingMode(enabled);
        }

        if (this.realtimeClient) {
          try {
            await this.realtimeClient.broadcastInteractiveConfirm(
              message.interactivePayload.command,
              result
            );
            // Also broadcast a system message for confirmation
            const statusText = result.success
              ? `✓ ${result.message}`
              : `✗ ${result.message}`;
            await this.realtimeClient.broadcastSystem(statusText);
          } catch {
            // Silently handle broadcast errors
          }
        }
        return;
      }

      // Handle clear request from mobile (doesn't appear in chat)
      if (message.type === 'clear-request') {
        this.sdkSession.clearHistory();
        if (this.options.hybrid !== false) {
          process.stdout.write('\n[Conversation cleared]\n> ');
        }
        return;
      }

      // Handle user answer (response to AskUserQuestion)
      // Use provideAnswer() to stream into the existing query instead of
      // sendPrompt() which would be rejected since isProcessing is true
      if (message.type === 'user-answer' && message.userAnswer) {
        const answerText = Object.values(message.userAnswer.answers).join('\n');
        this.emit('mobile-input', `(answer) ${answerText}`);
        await this.sdkSession.provideAnswer(answerText, message.userAnswer.answers);
        return;
      }

      // Handle permission response from mobile
      if (message.type === 'permission-response' && message.permissionResponse) {
        this.sdkSession.handlePermissionResponse(message.permissionResponse);
        return;
      }

      // Handle resume request from mobile (doesn't appear in chat)
      if (message.type === 'resume-request' && message.resumeSessionId) {
        const targetSdkSessionId = message.resumeSessionId;
        this.sdkSession.resumeSession(targetSdkSessionId);

        const confirmationMsg = `[Resuming session: ${targetSdkSessionId.slice(0, 8)}...]`;
        if (this.options.hybrid !== false) {
          process.stdout.write(`\n${confirmationMsg}\n`);
        }

        if (this.realtimeClient) {
          try {
            // Find the Supabase session with this SDK session ID to load its messages
            const { data: sessionData } = await this.options.supabase
              .from('sessions')
              .select('id')
              .eq('sdk_session_id', targetSdkSessionId)
              .single();

            if (sessionData) {
              // Tell mobile to load messages from this session
              await this.realtimeClient.broadcastResumeHistory(sessionData.id);
            }

            await this.realtimeClient.broadcastSystem(confirmationMsg);
          } catch {
            // Silently handle broadcast errors
          }
        }

        // Send a prompt to trigger the resumed session
        await this.sdkSession.sendPrompt('Continue from where we left off.');
        return;
      }

      // Remove trailing newline/carriage return for SDK
      const prompt = message.content?.replace(/[\r\n]+$/, '') || '';
      const attachments = message.attachments;

      // Send if there's text or attachments
      if (prompt.trim() || (attachments && attachments.length > 0)) {
        const trimmedPrompt = prompt.trim();

        // Emit mobile input event for logging
        this.emit('mobile-input', trimmedPrompt, attachments);

        // Handle /clear typed in chat (legacy support)
        if (trimmedPrompt === '/clear') {
          this.sdkSession.clearHistory();
          if (this.realtimeClient) {
            try {
              await this.realtimeClient.broadcastSystem('Conversation cleared');
            } catch {
              // Silently handle broadcast errors
            }
          }
          if (this.options.hybrid !== false) {
            process.stdout.write('\n[Conversation cleared]\n> ');
          }
          return;
        }

        await this.sdkSession.sendPrompt(prompt, attachments);
      }
    });

    // Connect to realtime
    await this.realtimeClient.connect();

    // Broadcast initial permission mode
    try {
      await this.realtimeClient.broadcastMode(this.sdkSession.getPermissionMode());
    } catch {
      // Silently handle broadcast errors
    }

    // Broadcast available commands immediately
    await this.broadcastCommands();

    // Broadcast available models immediately
    await this.broadcastModels();

    // Broadcast current model
    try {
      await this.realtimeClient.broadcastModel(this.sdkSession.getModel());
    } catch {
      // Silently handle broadcast errors
    }

    this.running = true;
    this.emit('started', {
      machine: this.machine,
      session: this.session,
      mobileSyncEnabled: this.realtimeClient?.isRealtimeEnabled() ?? false,
    });

    // Show initial prompt
    if (this.options.hybrid !== false) {
      process.stdout.write('\n[TermBridge] Ready for input.\n> ');
    }
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    this.running = false;

    // Cancel any ongoing SDK operation
    this.sdkSession.cancel();

    // End session
    if (this.session) {
      await this.sessionManager.endSession(this.session.id);
    }

    // Note: We don't set machine status to 'offline' here because other
    // sessions may still be running on the same machine. The machine
    // status is set to 'online' when any session starts.

    // Disconnect realtime
    if (this.realtimeClient) {
      await this.realtimeClient.disconnect();
    }

    this.emit('stopped');
  }

  async sendPrompt(prompt: string, attachments?: ImageAttachment[]): Promise<void> {
    await this.sdkSession.sendPrompt(prompt, attachments);
  }

  isRunning(): boolean {
    return this.running;
  }

  getSession(): Session | null {
    return this.session;
  }

  getMachine(): Machine | null {
    return this.machine;
  }

  private async broadcastCommands(): Promise<void> {
    if (!this.realtimeClient) {
      return;
    }

    try {
      const commands = await this.sdkSession.getSupportedCommands();
      await this.realtimeClient.broadcastCommands(commands);
    } catch {
      // Silently handle broadcast errors
    }
  }

  private async broadcastModels(): Promise<void> {
    if (!this.realtimeClient) {
      return;
    }

    try {
      const models = await this.sdkSession.getSupportedModels();
      await this.realtimeClient.broadcastModels(models);
    } catch {
      // Silently handle broadcast errors
    }
  }
}
