import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RealtimeClient } from '../realtime/client.js';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { REALTIME_CHANNELS } from 'clautunnel-shared';

describe('RealtimeClient', () => {
  let mockSupabase: Partial<SupabaseClient>;
  let mockOutputChannel: Partial<RealtimeChannel>;
  let mockInputChannel: Partial<RealtimeChannel>;
  let mockPresenceChannel: Partial<RealtimeChannel>;
  let subscribeCallback: ((status: string) => void) | null = null;

  beforeEach(() => {
    subscribeCallback = null;

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
        if (name.includes('output')) {
          return mockOutputChannel as RealtimeChannel;
        }
        if (name.includes('presence')) {
          return mockPresenceChannel as RealtimeChannel;
        }
        return mockInputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    };
  });

  it('should create RealtimeClient with session ID', () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    expect(client).toBeDefined();
  });

  it('should connect to output channel with session ID', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    const expectedOutputChannel = REALTIME_CHANNELS.sessionOutput(
      'test-session-123'
    );
    expect(mockSupabase.channel).toHaveBeenCalledWith(expectedOutputChannel);
  });

  it('should connect to input channel with session ID', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    const expectedInputChannel = REALTIME_CHANNELS.sessionInput(
      'test-session-123'
    );
    expect(mockSupabase.channel).toHaveBeenCalledWith(expectedInputChannel);
  });

  it('should emit connected event when channels subscribe successfully', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    const connectedCallback = vi.fn();
    client.on('connected', connectedCallback);

    await client.connect();

    expect(connectedCallback).toHaveBeenCalled();
  });

  it('should disconnect from all channels', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();
    await client.disconnect();

    // 3 channels: output, input, presence
    expect(mockSupabase.removeChannel).toHaveBeenCalledTimes(3);
  });

  it('should connect to presence channel with session ID', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    const expectedPresenceChannel = REALTIME_CHANNELS.sessionPresence(
      'test-session-123'
    );
    expect(mockSupabase.channel).toHaveBeenCalledWith(expectedPresenceChannel);
  });

  it('should track presence when connected', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
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

  it('should untrack presence when disconnecting', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();
    await client.disconnect();

    expect(mockPresenceChannel.untrack).toHaveBeenCalled();
  });

  it('should emit disconnected event when disconnecting', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    const disconnectedCallback = vi.fn();
    client.on('disconnected', disconnectedCallback);

    await client.connect();
    await client.disconnect();

    expect(disconnectedCallback).toHaveBeenCalled();
  });

  it('should broadcast output messages to output channel', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();
    await client.broadcast('test output');

    expect(mockOutputChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'broadcast',
        event: 'output',
        payload: expect.objectContaining({
          type: 'output',
          content: 'test output',
        }),
      })
    );
  });

  it('should increment sequence number on each broadcast', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    await client.broadcast('message 1');
    expect(client.getSeq()).toBe(1);

    await client.broadcast('message 2');
    expect(client.getSeq()).toBe(2);

    await client.broadcast('message 3');
    expect(client.getSeq()).toBe(3);
  });

  it('should emit input event when receiving input from mobile', async () => {
    let inputHandler: ((payload: any) => void) | null = null;

    mockInputChannel.on = vi.fn((event, filter, handler) => {
      if (event === 'broadcast' && filter.event === 'input') {
        inputHandler = handler;
      }
      return mockInputChannel as RealtimeChannel;
    });

    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    const inputCallback = vi.fn();
    client.on('input', inputCallback);

    await client.connect();

    // Simulate receiving input from mobile
    if (inputHandler) {
      inputHandler({
        payload: {
          type: 'input',
          content: 'user input',
          timestamp: Date.now(),
          seq: 1,
        },
      });
    }

    expect(inputCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'input',
        content: 'user input',
      })
    );
  });

  it('should report connected status correctly', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    expect(client.isConnected()).toBe(false);

    await client.connect();
    expect(client.isConnected()).toBe(true);

    await client.disconnect();
    expect(client.isConnected()).toBe(false);
  });

  it('should throw error when broadcasting without connection', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await expect(client.broadcast('test')).rejects.toThrow('Not connected');
  });

  it('should handle subscription timeout gracefully', async () => {
    // Create channel that never calls back with SUBSCRIBED
    const slowOutputChannel = {
      subscribe: vi.fn(() => slowOutputChannel as RealtimeChannel),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const slowInputChannel = {
      subscribe: vi.fn(() => slowInputChannel as RealtimeChannel),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const slowSupabase = {
      channel: vi.fn((name) => {
        if (name.includes('output')) {
          return slowOutputChannel as RealtimeChannel;
        }
        return slowInputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
    };

    const client = new RealtimeClient({
      supabase: slowSupabase as unknown as SupabaseClient,
      sessionId: 'test-session-123',
    });

    const connectedCallback = vi.fn();
    client.on('connected', connectedCallback);

    // Use fake timers to simulate timeout
    vi.useFakeTimers();

    const connectPromise = client.connect();

    // Fast-forward past the timeout (10 seconds)
    await vi.advanceTimersByTimeAsync(11000);

    await connectPromise;

    // Should still emit connected event (with degraded functionality)
    expect(connectedCallback).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('should handle CHANNEL_ERROR status gracefully', async () => {
    // Create channel that returns CHANNEL_ERROR
    const errorOutputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorOutputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorInputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorInputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorSupabase = {
      channel: vi.fn((name) => {
        if (name.includes('output')) {
          return errorOutputChannel as RealtimeChannel;
        }
        return errorInputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
    };

    const client = new RealtimeClient({
      supabase: errorSupabase as unknown as SupabaseClient,
      sessionId: 'test-session-123',
    });

    const connectedCallback = vi.fn();
    client.on('connected', connectedCallback);

    // Should not throw - handles error gracefully
    await client.connect();

    // Should still emit connected event (with degraded functionality)
    expect(connectedCallback).toHaveBeenCalled();
  });

  it('should report realtime enabled when subscription succeeds', async () => {
    const client = new RealtimeClient({
      supabase: mockSupabase as SupabaseClient,
      sessionId: 'test-session-123',
    });

    expect(client.isRealtimeEnabled()).toBe(false);

    await client.connect();

    expect(client.isRealtimeEnabled()).toBe(true);
  });

  it('should report realtime disabled when subscription fails', async () => {
    // Create channel that returns CHANNEL_ERROR
    const errorOutputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorOutputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorInputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorInputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorSupabase = {
      channel: vi.fn((name) => {
        if (name.includes('output')) {
          return errorOutputChannel as RealtimeChannel;
        }
        return errorInputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
    };

    const client = new RealtimeClient({
      supabase: errorSupabase as unknown as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    expect(client.isRealtimeEnabled()).toBe(false);
  });

  it('should skip broadcast when realtime is disabled', async () => {
    // Create channel that returns CHANNEL_ERROR (realtime disabled)
    const errorOutputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorOutputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorInputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorInputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorSupabase = {
      channel: vi.fn((name) => {
        if (name.includes('output')) {
          return errorOutputChannel as RealtimeChannel;
        }
        return errorInputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) }),
    };

    const client = new RealtimeClient({
      supabase: errorSupabase as unknown as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    // Broadcast should not throw and should not send via realtime
    await client.broadcast('test output');

    // send() should NOT have been called since realtime is disabled
    expect(errorOutputChannel.send).not.toHaveBeenCalled();
    // But message should still be persisted
    expect(errorSupabase.from).toHaveBeenCalledWith('messages');
  });

  describe('broadcastCommands', () => {
    it('should send message with type commands', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastCommands([
        { name: 'commit', description: 'Commit changes', argumentHint: '<message>' },
      ]);

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'commands',
          }),
        })
      );
    });

    it('should include commands array in payload', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      const commands = [
        { name: 'commit', description: 'Commit changes', argumentHint: '<message>' },
        { name: 'help', description: 'Show help', argumentHint: '' },
      ];

      await client.connect();
      await client.broadcastCommands(commands);

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            type: 'commands',
            commands,
          }),
        })
      );
    });
  });

  describe('broadcastMode', () => {
    it('should send message with type mode', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastMode('bypassPermissions');

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'mode',
          }),
        })
      );
    });

    it('should include permissionMode in payload', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastMode('plan');

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            type: 'mode',
            permissionMode: 'plan',
          }),
        })
      );
    });
  });

  describe('broadcastModel', () => {
    it('should send message with type model', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastModel('opus');

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'model',
            model: 'opus',
          }),
        })
      );
    });
  });

  describe('broadcastModels', () => {
    it('should send message with type models', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      const models = [
        { value: 'sonnet', displayName: 'Claude Sonnet', description: 'Balanced' },
        { value: 'opus', displayName: 'Claude Opus', description: 'Most capable' },
      ];

      await client.connect();
      await client.broadcastModels(models);

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'models',
            availableModels: models,
          }),
        })
      );
    });
  });

  describe('broadcastStatusResponse', () => {
    it('should send message with type status-response', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastStatusResponse(true, false);

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'status-response',
            isProcessing: true,
            isMessageQueued: false,
          }),
        })
      );
    });

    it('should include both processing and queued flags', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastStatusResponse(false, true);

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            type: 'status-response',
            isProcessing: false,
            isMessageQueued: true,
          }),
        })
      );
    });

    it('should include permission mode when provided', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastStatusResponse(false, false, 'plan');

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            type: 'status-response',
            isProcessing: false,
            isMessageQueued: false,
            permissionMode: 'plan',
          }),
        })
      );
    });
  });

  describe('broadcastSystem', () => {
    it('should send message with type system', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastSystem('[Model switched to Opus 4]');

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'system',
            content: '[Model switched to Opus 4]',
          }),
        })
      );
    });

    it('should persist system message to database', async () => {
      const mockInsert = vi.fn().mockResolvedValue({ error: null });
      const supabaseWithInsert = {
        ...mockSupabase,
        from: vi.fn().mockReturnValue({ insert: mockInsert }),
      };

      const client = new RealtimeClient({
        supabase: supabaseWithInsert as unknown as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastSystem('[Model switched to Opus 4]');

      expect(supabaseWithInsert.from).toHaveBeenCalledWith('messages');
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session-123',
          type: 'system',
          content: '[Model switched to Opus 4]',
        })
      );
    });

    it('should skip realtime broadcast when realtime is disabled', async () => {
      const errorOutputChannel = {
        subscribe: vi.fn((cb) => {
          setTimeout(() => cb('CHANNEL_ERROR'), 0);
          return errorOutputChannel as RealtimeChannel;
        }),
        send: vi.fn().mockResolvedValue({ error: null }),
        on: vi.fn().mockReturnThis(),
      };

      const errorInputChannel = {
        subscribe: vi.fn((cb) => {
          setTimeout(() => cb('CHANNEL_ERROR'), 0);
          return errorInputChannel as RealtimeChannel;
        }),
        send: vi.fn().mockResolvedValue({ error: null }),
        on: vi.fn().mockReturnThis(),
      };

      const errorSupabase = {
        channel: vi.fn((name) => {
          if (name.includes('output')) {
            return errorOutputChannel as RealtimeChannel;
          }
          return errorInputChannel as RealtimeChannel;
        }),
        removeChannel: vi.fn().mockResolvedValue({ error: null }),
        from: vi.fn().mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) }),
      };

      const client = new RealtimeClient({
        supabase: errorSupabase as unknown as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastSystem('System message');

      // Should NOT send via realtime since it's disabled
      expect(errorOutputChannel.send).not.toHaveBeenCalled();
      // But should still persist to database
      expect(errorSupabase.from).toHaveBeenCalledWith('messages');
    });
  });

  it('should persist messages but not send via realtime when realtime is disabled', async () => {
    // Create channel that returns CHANNEL_ERROR (realtime disabled)
    const errorOutputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorOutputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const errorInputChannel = {
      subscribe: vi.fn((cb) => {
        setTimeout(() => cb('CHANNEL_ERROR'), 0);
        return errorInputChannel as RealtimeChannel;
      }),
      send: vi.fn().mockResolvedValue({ error: null }),
      on: vi.fn().mockReturnThis(),
    };

    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const errorSupabase = {
      channel: vi.fn((name) => {
        if (name.includes('output')) {
          return errorOutputChannel as RealtimeChannel;
        }
        return errorInputChannel as RealtimeChannel;
      }),
      removeChannel: vi.fn().mockResolvedValue({ error: null }),
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    };

    const client = new RealtimeClient({
      supabase: errorSupabase as unknown as SupabaseClient,
      sessionId: 'test-session-123',
    });

    await client.connect();

    expect(client.getSeq()).toBe(0);

    await client.broadcast('test output');

    // Sequence should increment (message is persisted for history)
    expect(client.getSeq()).toBe(1);

    // Message should be persisted to database
    expect(errorSupabase.from).toHaveBeenCalledWith('messages');
    expect(mockInsert).toHaveBeenCalled();

    // But NOT sent via realtime channel
    expect(errorOutputChannel.send).not.toHaveBeenCalled();
  });

  describe('broadcastSessionTitle', () => {
    it('should send message with type session-title', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();
      await client.broadcastSessionTitle('Help me refactor auth');

      expect(mockOutputChannel.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'session-title',
            sessionTitle: 'Help me refactor auth',
          }),
        })
      );
    });
  });

  describe('broadcastError', () => {
    it('should broadcast error message with correct structure', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();

      const errorMessage = 'Test error message';
      const errorCode = 'request_rejected';
      await client.broadcastError(errorMessage, errorCode);

      expect(mockOutputChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'output',
        payload: expect.objectContaining({
          type: 'error',
          content: errorMessage,
          errorCode: errorCode,
          timestamp: expect.any(Number),
          seq: expect.any(Number),
        }),
      });
    });

    it('should use default errorCode if not provided', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();

      const errorMessage = 'Test error message';
      await client.broadcastError(errorMessage);

      expect(mockOutputChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'output',
        payload: expect.objectContaining({
          type: 'error',
          content: errorMessage,
          errorCode: 'unknown',
        }),
      });
    });

    it('should emit broadcast event after sending error', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      await client.connect();

      const broadcastHandler = vi.fn();
      client.on('broadcast', broadcastHandler);

      await client.broadcastError('Test error');

      expect(broadcastHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          content: 'Test error',
          errorCode: 'unknown',
        })
      );
    });

    it('should throw error if not connected', async () => {
      const client = new RealtimeClient({
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'test-session-123',
      });

      // Don't connect

      await expect(client.broadcastError('Test error')).rejects.toThrow('Not connected');
    });
  });
});
