import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MachineRealtimeClient } from '../realtime/machine-client.js';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { REALTIME_CHANNELS } from 'clautunnel-shared';

describe('MachineRealtimeClient', () => {
  let mockSupabase: Partial<SupabaseClient>;
  let mockInputChannel: Partial<RealtimeChannel>;
  let mockOutputChannel: Partial<RealtimeChannel>;
  let mockPresenceChannel: Partial<RealtimeChannel>;

  beforeEach(() => {
    mockOutputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('SUBSCRIBED'), 0);
        return mockOutputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    mockInputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('SUBSCRIBED'), 0);
        return mockInputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    mockPresenceChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('SUBSCRIBED'), 0);
        return mockPresenceChannel as RealtimeChannel;
      }),
      track: vi.fn().mockResolvedValue({ error: null }),
      untrack: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    mockSupabase = {
      channel: vi.fn((name) => {
        if (name.includes('input')) {
          return mockInputChannel as RealtimeChannel;
        }
        if (name.includes('presence')) {
          return mockPresenceChannel as RealtimeChannel;
        }
        return mockOutputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
    };
  });

  it('should return true when channels subscribe successfully', async () => {
    const client = new MachineRealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      machineId: 'test-machine-123',
    });

    const result = await client.connect();

    expect(result).toBe(true);
  });

  it('should return false when channel subscription fails', async () => {
    const errorInputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorInputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorOutputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorOutputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorSupabase = {
      channel: vi.fn((name) => {
        if (name.includes('input')) {
          return errorInputChannel as RealtimeChannel;
        }
        return errorOutputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
    };

    const client = new MachineRealtimeClient({
      supabase: errorSupabase as unknown as SupabaseClient,
      machineId: 'test-machine-123',
    });

    const result = await client.connect();

    expect(result).toBe(false);
  });

  it('should set up presence tracking on successful connect', async () => {
    const client = new MachineRealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      machineId: 'test-machine-123',
    });

    await client.connect();

    // Wait for async presence track callback
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(mockPresenceChannel.track).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'cli',
      })
    );
  });

  it('should not set up presence when subscription fails', async () => {
    const errorInputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorInputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorOutputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorOutputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const failSupabase = {
      channel: vi.fn((name) => {
        if (name.includes('input')) {
          return errorInputChannel as RealtimeChannel;
        }
        return errorOutputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
    };

    const client = new MachineRealtimeClient({
      supabase: failSupabase as unknown as SupabaseClient,
      machineId: 'test-machine-123',
    });

    await client.connect();

    // Presence channel should never have been created
    const expectedPresenceChannel = REALTIME_CHANNELS.machinePresence('test-machine-123');
    const channelCalls = (failSupabase.channel as any).mock.calls.map((c: any) => c[0]);
    expect(channelCalls).not.toContain(expectedPresenceChannel);
  });

  it('should emit command event when receiving machine-command broadcast', async () => {
    let commandHandler: ((payload: any) => void) | null = null;

    mockInputChannel.on = vi.fn((event, filter, handler) => {
      if (event === 'broadcast' && filter.event === 'machine-command') {
        commandHandler = handler;
      }
      return mockInputChannel as RealtimeChannel;
    });

    const client = new MachineRealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      machineId: 'test-machine-123',
    });

    const commandCallback = vi.fn();
    client.on('command', commandCallback);

    await client.connect();

    // Simulate receiving a machine command
    if (commandHandler) {
      commandHandler({
        payload: {
          type: 'start-session',
          prompt: 'Hello',
          timestamp: Date.now(),
        },
      });
    }

    expect(commandCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'start-session',
        prompt: 'Hello',
      })
    );
  });

  describe('broadcastSessionStarted', () => {
    it('should send session-started command with sessionId and workingDirectory', async () => {
      const client = new MachineRealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        machineId: 'test-machine-123',
      });

      await client.connect();
      await client.broadcastSessionStarted('session-456', '/home/user/project');

      expect(mockOutputChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'machine-command',
        payload: expect.objectContaining({
          type: 'session-started',
          sessionId: 'session-456',
          workingDirectory: '/home/user/project',
        }),
      });
    });

    it('should be no-op when not connected', async () => {
      const client = new MachineRealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        machineId: 'test-machine-123',
      });

      // Don't connect - should not throw
      await client.broadcastSessionStarted('session-456', '/home/user/project');

      expect(mockOutputChannel.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastSessionEnded', () => {
    it('should send session-ended command with sessionId', async () => {
      const client = new MachineRealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        machineId: 'test-machine-123',
      });

      await client.connect();
      await client.broadcastSessionEnded('session-456');

      expect(mockOutputChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'machine-command',
        payload: expect.objectContaining({
          type: 'session-ended',
          sessionId: 'session-456',
        }),
      });
    });

    it('should be no-op when not connected', async () => {
      const client = new MachineRealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        machineId: 'test-machine-123',
      });

      await client.broadcastSessionEnded('session-456');

      expect(mockOutputChannel.send).not.toHaveBeenCalled();
    });
  });

  describe('broadcastError', () => {
    it('should send start-session-error command with error message', async () => {
      const client = new MachineRealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        machineId: 'test-machine-123',
      });

      await client.connect();
      await client.broadcastError('Failed to start session');

      expect(mockOutputChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'machine-command',
        payload: expect.objectContaining({
          type: 'start-session-error',
          error: 'Failed to start session',
        }),
      });
    });

    it('should be no-op when not connected', async () => {
      const client = new MachineRealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        machineId: 'test-machine-123',
      });

      await client.broadcastError('Failed to start session');

      expect(mockOutputChannel.send).not.toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    it('should emit disconnected event', async () => {
      const client = new MachineRealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        machineId: 'test-machine-123',
      });

      const disconnectedCallback = vi.fn();
      client.on('disconnected', disconnectedCallback);

      await client.connect();
      await client.disconnect();

      expect(disconnectedCallback).toHaveBeenCalled();
    });

    it('should untrack presence before removing channels', async () => {
      const client = new MachineRealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        machineId: 'test-machine-123',
      });

      await client.connect();
      await client.disconnect();

      expect(mockPresenceChannel.untrack).toHaveBeenCalled();
      // 3 channels removed: presence, input, output
      expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(3);
    });

    it('should handle already-disconnected state gracefully', async () => {
      const client = new MachineRealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        machineId: 'test-machine-123',
      });

      // Disconnect without connecting - should not throw
      await client.disconnect();

      expect(mockSupabase.removeChannel).not.toHaveBeenCalled();
    });
  });
});
