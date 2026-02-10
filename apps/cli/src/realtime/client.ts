import { EventEmitter } from 'events';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type {
  RealtimeMessage,
  ModelInfo,
  PermissionMode,
  SlashCommand,
  InteractiveCommandData,
  InteractiveCommandType,
  InteractiveResult,
  PresencePayload,
  UserQuestionData,
  PermissionRequestData,
} from 'termbridge-shared';
import { REALTIME_CHANNELS } from 'termbridge-shared';
import { subscribeWithTimeout } from './utils.js';

export interface RealtimeClientOptions {
  supabase: SupabaseClient;
  sessionId: string;
}

export class RealtimeClient extends EventEmitter {
  private supabase: SupabaseClient;
  private sessionId: string;
  private outputChannel: RealtimeChannel | null = null;
  private inputChannel: RealtimeChannel | null = null;
  private presenceChannel: RealtimeChannel | null = null;
  private seq: number = 0;
  private realtimeEnabled: boolean = false;

  constructor(options: RealtimeClientOptions) {
    super();
    this.supabase = options.supabase;
    this.sessionId = options.sessionId;
  }

  async connect(): Promise<void> {
    // Subscribe to output channel (CLI broadcasts to mobile)
    const outputChannelName = REALTIME_CHANNELS.sessionOutput(this.sessionId);
    this.outputChannel = this.supabase.channel(outputChannelName);

    // Subscribe to input channel (mobile sends to CLI)
    const inputChannelName = REALTIME_CHANNELS.sessionInput(this.sessionId);
    this.inputChannel = this.supabase.channel(inputChannelName);

    this.inputChannel.on('broadcast', { event: 'input' }, (payload) => {
      this.emit('input', payload.payload as RealtimeMessage);
    });

    const results = await Promise.all([
      subscribeWithTimeout(this.outputChannel, 'output'),
      subscribeWithTimeout(this.inputChannel, 'input'),
    ]);

    // Only enable realtime if both channels subscribed successfully
    this.realtimeEnabled = results.every((success) => success);

    // Set up presence channel to track CLI online status
    if (this.realtimeEnabled) {
      const presenceChannelName = REALTIME_CHANNELS.sessionPresence(this.sessionId);
      this.presenceChannel = this.supabase.channel(presenceChannelName);

      // Subscribe and track presence - re-track on every SUBSCRIBED (handles reconnection)
      this.presenceChannel.subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED' && this.presenceChannel) {
          try {
            const payload: PresencePayload = {
              type: 'cli',
              online_at: new Date().toISOString(),
            };
            await this.presenceChannel.track(payload);
          } catch (trackError) {
            // Presence tracking is non-critical - log and continue
            console.warn('[WARN] Failed to track presence:', trackError);
          }
        } else if (status === 'CHANNEL_ERROR') {
          // Presence is non-critical - log and continue
          console.warn('[WARN] Presence channel error:', err?.message || 'Unknown error');
        }
      });
    }

    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    // Untrack presence before disconnecting
    if (this.presenceChannel) {
      await this.presenceChannel.untrack();
      await this.supabase.removeChannel(this.presenceChannel);
      this.presenceChannel = null;
    }

    if (this.outputChannel) {
      await this.supabase.removeChannel(this.outputChannel);
      this.outputChannel = null;
    }

    if (this.inputChannel) {
      await this.supabase.removeChannel(this.inputChannel);
      this.inputChannel = null;
    }

    this.emit('disconnected');
  }

  async broadcast(content: string): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    const message: RealtimeMessage = {
      type: 'output',
      content,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    // Persist message to database for history
    try {
      const { error } = await this.supabase.from('messages').insert({
        session_id: this.sessionId,
        type: message.type,
        content: message.content,
        seq: message.seq,
      });
      if (error) {
        console.warn('[WARN] Failed to persist message:', error.message);
      }
    } catch (error) {
      // Log but don't fail - message persistence is secondary to realtime
      console.warn('[WARN] Failed to persist message:', error);
    }

    // Skip realtime broadcasting if not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    try {
      await this.outputChannel.send({
        type: 'broadcast',
        event: 'output',
        payload: message,
      });
    } catch (error) {
      throw error;
    }

    this.emit('broadcast', message);
  }

  async broadcastMode(mode: PermissionMode): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'mode',
      permissionMode: mode,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastCommands(commands: SlashCommand[]): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'commands',
      commands,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastModel(model: string): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'model',
      model,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastModels(models: ModelInfo[]): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'models',
      availableModels: models,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastSystem(content: string): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    const message: RealtimeMessage = {
      type: 'system',
      content,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    // Persist message to database for history
    try {
      const { error } = await this.supabase.from('messages').insert({
        session_id: this.sessionId,
        type: message.type,
        content: message.content,
        seq: message.seq,
      });
      if (error) {
        console.warn('[WARN] Failed to persist system message:', error.message);
      }
    } catch (error) {
      console.warn('[WARN] Failed to persist system message:', error);
    }

    // Skip realtime broadcasting if not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    try {
      await this.outputChannel.send({
        type: 'broadcast',
        event: 'output',
        payload: message,
      });
    } catch (error) {
      throw error;
    }

    this.emit('broadcast', message);
  }

  async broadcastInteractiveResponse(data: InteractiveCommandData): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'interactive-response',
      interactiveData: data,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastInteractiveConfirm(
    command: InteractiveCommandType,
    result: InteractiveResult
  ): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'interactive-confirm',
      interactiveCommand: command,
      interactiveResult: result,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastResumeHistory(historySessionId: string): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'resume-history',
      historySessionId,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastUserQuestion(questionData: UserQuestionData): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'user-question',
      userQuestion: questionData,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastPermissionRequest(requestData: PermissionRequestData): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'permission-request',
      permissionRequest: requestData,
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  async broadcastComplete(): Promise<void> {
    if (!this.outputChannel) {
      throw new Error('Not connected');
    }

    // Skip broadcasting if realtime is not enabled
    if (!this.realtimeEnabled) {
      return;
    }

    const message: RealtimeMessage = {
      type: 'complete',
      timestamp: Date.now(),
      seq: ++this.seq,
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'output',
      payload: message,
    });

    this.emit('broadcast', message);
  }

  getSeq(): number {
    return this.seq;
  }

  isConnected(): boolean {
    return this.outputChannel !== null && this.inputChannel !== null;
  }

  isRealtimeEnabled(): boolean {
    return this.realtimeEnabled;
  }
}
