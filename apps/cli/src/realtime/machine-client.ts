import { EventEmitter } from 'events';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import type { MachineCommand, PresencePayload } from 'termbridge-shared';
import { REALTIME_CHANNELS } from 'termbridge-shared';
import { subscribeWithTimeout } from './utils.js';

export interface MachineRealtimeClientOptions {
  supabase: SupabaseClient;
  machineId: string;
}

export class MachineRealtimeClient extends EventEmitter {
  private supabase: SupabaseClient;
  private machineId: string;
  private inputChannel: RealtimeChannel | null = null;
  private outputChannel: RealtimeChannel | null = null;
  private presenceChannel: RealtimeChannel | null = null;

  constructor(options: MachineRealtimeClientOptions) {
    super();
    this.supabase = options.supabase;
    this.machineId = options.machineId;
  }

  async connect(): Promise<boolean> {
    // Subscribe to input channel (receives commands from mobile)
    const inputChannelName = REALTIME_CHANNELS.machineInput(this.machineId);
    this.inputChannel = this.supabase.channel(inputChannelName);

    this.inputChannel.on('broadcast', { event: 'machine-command' }, (payload) => {
      this.emit('command', payload.payload as MachineCommand);
    });

    // Subscribe to output channel (sends responses to mobile)
    const outputChannelName = REALTIME_CHANNELS.machineOutput(this.machineId);
    this.outputChannel = this.supabase.channel(outputChannelName);

    const results = await Promise.all([
      subscribeWithTimeout(this.inputChannel, 'machine-input'),
      subscribeWithTimeout(this.outputChannel, 'machine-output'),
    ]);

    const connected = results.every((success) => success);

    // Set up presence channel to track listener online status
    if (connected) {
      const presenceChannelName = REALTIME_CHANNELS.machinePresence(this.machineId);
      this.presenceChannel = this.supabase.channel(presenceChannelName);

      this.presenceChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED' && this.presenceChannel) {
          try {
            const payload: PresencePayload = {
              type: 'cli',
              online_at: new Date().toISOString(),
            };
            await this.presenceChannel.track(payload);
          } catch (trackError) {
            console.warn('[WARN] Failed to track machine presence:', trackError);
          }
        }
      });
    }

    return connected;
  }

  async broadcastSessionStarted(sessionId: string, workingDirectory: string): Promise<void> {
    if (!this.outputChannel) return;

    const command: MachineCommand = {
      type: 'session-started',
      sessionId,
      workingDirectory,
      timestamp: Date.now(),
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'machine-command',
      payload: command,
    });
  }

  async broadcastSessionEnded(sessionId: string): Promise<void> {
    if (!this.outputChannel) return;

    const command: MachineCommand = {
      type: 'session-ended',
      sessionId,
      timestamp: Date.now(),
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'machine-command',
      payload: command,
    });
  }

  async broadcastError(error: string): Promise<void> {
    if (!this.outputChannel) return;

    const command: MachineCommand = {
      type: 'start-session-error',
      error,
      timestamp: Date.now(),
    };

    await this.outputChannel.send({
      type: 'broadcast',
      event: 'machine-command',
      payload: command,
    });
  }

  async disconnect(): Promise<void> {
    if (this.presenceChannel) {
      await this.presenceChannel.untrack();
      await this.supabase.removeChannel(this.presenceChannel);
      this.presenceChannel = null;
    }

    if (this.inputChannel) {
      await this.supabase.removeChannel(this.inputChannel);
      this.inputChannel = null;
    }

    if (this.outputChannel) {
      await this.supabase.removeChannel(this.outputChannel);
      this.outputChannel = null;
    }

    this.emit('disconnected');
  }
}
