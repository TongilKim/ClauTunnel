import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { RealtimeClient } from '../../apps/cli/src/realtime/client.js';

/**
 * Integration tests for CLI RealtimeClient
 * Tests actual RealtimeClient behavior with mocked Supabase boundary
 */

// --- Mock Supabase boundary ---

function createMockChannel(subscribeStatus: string = 'SUBSCRIBED') {
  const channel: any = {
    subscribe: vi.fn((cb: (status: string) => void) => {
      setTimeout(() => cb(subscribeStatus), 0);
      return channel as RealtimeChannel;
    }),
    send: vi.fn().mockResolvedValue({ error: null }),
    on: vi.fn().mockReturnThis(),
    track: vi.fn().mockResolvedValue(undefined),
    untrack: vi.fn().mockResolvedValue(undefined),
  };
  return channel;
}

let inputHandler: ((payload: any) => void) | null = null;

function createMockInputChannel(subscribeStatus: string = 'SUBSCRIBED') {
  const channel: any = {
    subscribe: vi.fn((cb: (status: string) => void) => {
      setTimeout(() => cb(subscribeStatus), 0);
      return channel as RealtimeChannel;
    }),
    send: vi.fn().mockResolvedValue({ error: null }),
    on: vi.fn((event: string, filter: any, handler: (payload: any) => void) => {
      if (event === 'broadcast' && filter?.event === 'input') {
        inputHandler = handler;
      }
      return channel;
    }),
    track: vi.fn().mockResolvedValue(undefined),
    untrack: vi.fn().mockResolvedValue(undefined),
  };
  return channel;
}

function createMockPresenceChannel() {
  const channel: any = {
    subscribe: vi.fn((cb: (status: string) => void) => {
      setTimeout(() => cb('SUBSCRIBED'), 0);
      return channel as RealtimeChannel;
    }),
    track: vi.fn().mockResolvedValue(undefined),
    untrack: vi.fn().mockResolvedValue(undefined),
  };
  return channel;
}

function createMockInsert() {
  return vi.fn().mockResolvedValue({ error: null });
}

function createMockSupabase(
  outputChannel: any,
  inputChannel: any,
  presenceChannel: any,
  mockInsert: ReturnType<typeof vi.fn>,
) {
  let channelCallCount = 0;
  const channels = [outputChannel, inputChannel, presenceChannel];

  return {
    channel: vi.fn(() => {
      return channels[channelCallCount++] || presenceChannel;
    }),
    removeChannel: vi.fn().mockResolvedValue({ error: null }),
    from: vi.fn(() => ({
      insert: mockInsert,
    })),
  } as any;
}

describe('CLI RealtimeClient Integration', () => {
  let client: RealtimeClient;
  let mockOutputChannel: any;
  let mockInputChannel: any;
  let mockPresenceChannel: any;
  let mockInsert: ReturnType<typeof vi.fn>;
  let mockSupabase: any;

  beforeEach(() => {
    inputHandler = null;
    mockOutputChannel = createMockChannel();
    mockInputChannel = createMockInputChannel();
    mockPresenceChannel = createMockPresenceChannel();
    mockInsert = createMockInsert();
    mockSupabase = createMockSupabase(
      mockOutputChannel,
      mockInputChannel,
      mockPresenceChannel,
      mockInsert,
    );
    client = new RealtimeClient({ supabase: mockSupabase, sessionId: 'test-session' });
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  describe('Output Broadcasting', () => {
    it('broadcast() increments seq by 1 and emits a broadcast event', async () => {
      // Arrange
      await client.connect();
      const handler = vi.fn();
      client.on('broadcast', handler);

      // Act
      await client.broadcast('Hello');

      // Assert
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'output', content: 'Hello' }),
      );
      expect(client.getSeq()).toBe(1);
    });

    it('sequential broadcasts increment seq in order', async () => {
      // Arrange
      await client.connect();

      // Act
      await client.broadcast('one');
      await client.broadcast('two');
      await client.broadcast('three');

      // Assert
      expect(client.getSeq()).toBe(3);
    });

    it('broadcast persists the message to the database', async () => {
      // Arrange
      await client.connect();

      // Act
      await client.broadcast('persisted content');

      // Assert (DB is an external boundary, so verifying the mock call is acceptable)
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          session_id: 'test-session',
          type: 'output',
          content: 'persisted content',
          seq: 1,
        }),
      );
    });

    it('100 rapid broadcasts are all processed with correct final seq', async () => {
      // Arrange
      await client.connect();

      // Act
      await Promise.all(
        Array.from({ length: 100 }, (_, i) => client.broadcast(`msg-${i}`)),
      );

      // Assert
      expect(client.getSeq()).toBe(100);
    });
  });

  describe('Input Receiving', () => {
    it('emits an input event when the input channel receives a message', async () => {
      // Arrange
      await client.connect();
      const handler = vi.fn();
      client.on('input', handler);

      // Act - simulate incoming message via the captured input handler
      expect(inputHandler).not.toBeNull();
      inputHandler!({
        payload: {
          type: 'input',
          content: 'y\n',
          timestamp: Date.now(),
          seq: 1,
        },
      });

      // Assert
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'input', content: 'y\n' }),
      );
    });

    it('handles special character inputs without errors', async () => {
      // Arrange
      await client.connect();
      const handler = vi.fn();
      client.on('input', handler);

      const specialInputs = [
        '\x03', // Ctrl+C
        '\x04', // Ctrl+D
        '\t',   // Tab
        '\n',   // Enter
        '\x1b[A', // Arrow up
        '\x1b[B', // Arrow down
      ];

      // Act
      for (const input of specialInputs) {
        inputHandler!({
          payload: { type: 'input', content: input, timestamp: Date.now(), seq: 1 },
        });
      }

      // Assert
      expect(handler).toHaveBeenCalledTimes(specialInputs.length);
    });
  });

  describe('Connection Lifecycle', () => {
    it('isConnected() returns true after connect()', async () => {
      // Act
      await client.connect();

      // Assert
      expect(client.isConnected()).toBe(true);
    });

    it('isConnected() returns false after disconnect()', async () => {
      // Arrange
      await client.connect();

      // Act
      await client.disconnect();

      // Assert
      expect(client.isConnected()).toBe(false);
    });

    it('emits connected event on connect()', async () => {
      // Arrange
      const handler = vi.fn();
      client.on('connected', handler);

      // Act
      await client.connect();

      // Assert
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits disconnected event on disconnect()', async () => {
      // Arrange
      await client.connect();
      const handler = vi.fn();
      client.on('disconnected', handler);

      // Act
      await client.disconnect();

      // Assert
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('realtimeEnabled is false when channel subscription fails', async () => {
      // Arrange - create client with failing channels
      const failingOutput = createMockChannel('CHANNEL_ERROR');
      const failingInput = createMockInputChannel('CHANNEL_ERROR');
      const failSupabase = createMockSupabase(
        failingOutput,
        failingInput,
        mockPresenceChannel,
        mockInsert,
      );
      const failClient = new RealtimeClient({
        supabase: failSupabase,
        sessionId: 'fail-session',
      });

      // Act
      await failClient.connect();

      // Assert
      expect(failClient.isRealtimeEnabled()).toBe(false);

      await failClient.disconnect();
    });

    it('broadcast only persists to DB when realtime is disabled (no channel.send)', async () => {
      // Arrange - failing subscription means realtimeEnabled = false
      const failingOutput = createMockChannel('CHANNEL_ERROR');
      const failingInput = createMockInputChannel('CHANNEL_ERROR');
      const failSupabase = createMockSupabase(
        failingOutput,
        failingInput,
        mockPresenceChannel,
        mockInsert,
      );
      const failClient = new RealtimeClient({
        supabase: failSupabase,
        sessionId: 'fail-session',
      });
      await failClient.connect();

      // Act
      await failClient.broadcast('db-only');

      // Assert - DB was called (external boundary check is allowed)
      expect(mockInsert).toHaveBeenCalled();
      // channel.send should NOT have been called
      expect(failingOutput.send).not.toHaveBeenCalled();

      await failClient.disconnect();
    });
  });

  describe('Error Resilience', () => {
    it('broadcast() throws Not connected when not connected', async () => {
      // Act & Assert
      await expect(client.broadcast('hello')).rejects.toThrow('Not connected');
    });

    it('broadcast does not throw when DB persist fails', async () => {
      // Arrange
      mockInsert.mockResolvedValue({ error: { message: 'DB failure' } });
      await client.connect();

      // Act & Assert
      await expect(client.broadcast('still works')).resolves.not.toThrow();
    });

    it('broadcast does not throw when DB persist throws an exception', async () => {
      // Arrange
      mockInsert.mockRejectedValue(new Error('Network error'));
      await client.connect();

      // Act & Assert
      await expect(client.broadcast('resilient')).resolves.not.toThrow();
    });
  });
});
