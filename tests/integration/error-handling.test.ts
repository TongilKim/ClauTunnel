import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { RealtimeClient } from '../../apps/cli/src/realtime/client.js';

/**
 * Error handling integration tests
 *
 * Tests observable behavior when things go wrong: DB failures, channel errors,
 * disconnections, etc. Each test verifies what the USER/SYSTEM observes, not
 * internal implementation calls.
 */

// --- Mock helpers (Supabase boundary mocks) ---

function createMockChannel(subscribeStatus = 'SUBSCRIBED') {
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

function buildSupabase(
  outputChannel: any,
  inputChannel: any,
  presenceChannel: any,
  mockInsert: ReturnType<typeof vi.fn>,
) {
  let callIdx = 0;
  const channels = [outputChannel, inputChannel, presenceChannel];
  return {
    channel: vi.fn(() => channels[callIdx++] || presenceChannel),
    removeChannel: vi.fn().mockResolvedValue({ error: null }),
    from: vi.fn(() => ({ insert: mockInsert })),
  } as any;
}

describe('RealtimeClient Error Handling', () => {
  let outputChannel: any;
  let inputChannel: any;
  let presenceChannel: any;
  let mockInsert: ReturnType<typeof vi.fn>;
  let supabase: any;
  let client: RealtimeClient;

  beforeEach(() => {
    outputChannel = createMockChannel();
    inputChannel = createMockChannel();
    presenceChannel = createMockPresenceChannel();
    mockInsert = vi.fn().mockResolvedValue({ error: null });
    supabase = buildSupabase(outputChannel, inputChannel, presenceChannel, mockInsert);
    client = new RealtimeClient({ supabase, sessionId: 'error-test-session' });
  });

  afterEach(async () => {
    if (client.isConnected()) {
      await client.disconnect();
    }
  });

  // -------------------------------------------------------------------------
  // DB persist failures
  // -------------------------------------------------------------------------

  describe('DB persist failure during broadcast()', () => {
    it('does not throw and still emits broadcast event', async () => {
      // Arrange: DB insert returns error
      mockInsert.mockResolvedValue({ error: { message: 'disk full' } });
      await client.connect();
      const handler = vi.fn();
      client.on('broadcast', handler);

      // Act
      await expect(client.broadcast('test')).resolves.not.toThrow();

      // Assert: broadcast event still emitted, seq still incremented
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'output', content: 'test' }),
      );
      expect(client.getSeq()).toBe(1);
    });

    it('does not throw when DB insert throws an exception', async () => {
      // Arrange: DB insert throws (network error etc.)
      mockInsert.mockRejectedValue(new Error('Connection refused'));
      await client.connect();

      // Act & Assert
      await expect(client.broadcast('still works')).resolves.not.toThrow();
      expect(client.getSeq()).toBe(1);
    });
  });

  describe('DB persist failure during broadcastSystem()', () => {
    it('does not throw and still emits broadcast event', async () => {
      // Arrange
      mockInsert.mockResolvedValue({ error: { message: 'constraint violation' } });
      await client.connect();
      const handler = vi.fn();
      client.on('broadcast', handler);

      // Act
      await expect(client.broadcastSystem('system msg')).resolves.not.toThrow();

      // Assert
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'system', content: 'system msg' }),
      );
      expect(client.getSeq()).toBe(1);
    });
  });

  describe('DB persist failure during broadcastToolUse()', () => {
    it('does not throw and still emits broadcast event', async () => {
      // Arrange
      mockInsert.mockResolvedValue({ error: { message: 'timeout' } });
      await client.connect();
      const handler = vi.fn();
      client.on('broadcast', handler);

      const toolData = { action: 'Edit', filePath: 'a.ts', oldString: 'x', newString: 'y' } as any;

      // Act
      await expect(client.broadcastToolUse(toolData)).resolves.not.toThrow();

      // Assert
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'tool-use' }),
      );
      expect(client.getSeq()).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // channel.send() failures
  // -------------------------------------------------------------------------

  describe('channel.send() failure during broadcast()', () => {
    it('throws the send error', async () => {
      // Arrange
      outputChannel.send.mockRejectedValue(new Error('send failed'));
      await client.connect();

      // Act & Assert: the error propagates
      await expect(client.broadcast('fail')).rejects.toThrow('send failed');

      // seq was still incremented before the send attempt
      expect(client.getSeq()).toBe(1);
    });
  });

  describe('channel.send() failure during broadcastSystem()', () => {
    it('throws the send error', async () => {
      // Arrange
      outputChannel.send.mockRejectedValue(new Error('channel closed'));
      await client.connect();

      // Act & Assert
      await expect(client.broadcastSystem('sys')).rejects.toThrow('channel closed');
    });
  });

  describe('channel.send() failure during broadcastToolUse()', () => {
    it('throws the send error', async () => {
      // Arrange
      outputChannel.send.mockRejectedValue(new Error('rate limited'));
      await client.connect();

      const toolData = { action: 'Write', filePath: 'b.ts', content: 'x' } as any;

      // Act & Assert
      await expect(client.broadcastToolUse(toolData)).rejects.toThrow('rate limited');
    });
  });

  // -------------------------------------------------------------------------
  // Not connected errors
  // -------------------------------------------------------------------------

  describe('calling methods without connection', () => {
    it('broadcast() throws Not connected', async () => {
      await expect(client.broadcast('x')).rejects.toThrow('Not connected');
    });

    it('broadcastSystem() throws Not connected', async () => {
      await expect(client.broadcastSystem('x')).rejects.toThrow('Not connected');
    });

    it('broadcastToolUse() throws Not connected', async () => {
      const data = { action: 'Edit', filePath: 'x', oldString: 'a', newString: 'b' } as any;
      await expect(client.broadcastToolUse(data)).rejects.toThrow('Not connected');
    });

    it('broadcastMode() throws Not connected', async () => {
      await expect(client.broadcastMode('plan')).rejects.toThrow('Not connected');
    });

    it('broadcastCommands() throws Not connected', async () => {
      await expect(client.broadcastCommands([])).rejects.toThrow('Not connected');
    });

    it('broadcastModel() throws Not connected', async () => {
      await expect(client.broadcastModel('opus')).rejects.toThrow('Not connected');
    });

    it('broadcastModels() throws Not connected', async () => {
      await expect(client.broadcastModels([])).rejects.toThrow('Not connected');
    });

    it('broadcastStatusResponse() throws Not connected', async () => {
      await expect(client.broadcastStatusResponse(false, false)).rejects.toThrow('Not connected');
    });

    it('broadcastComplete() throws Not connected', async () => {
      await expect(client.broadcastComplete()).rejects.toThrow('Not connected');
    });

    it('broadcastQueued() throws Not connected', async () => {
      await expect(client.broadcastQueued()).rejects.toThrow('Not connected');
    });

    it('broadcastError() throws Not connected', async () => {
      await expect(client.broadcastError('err')).rejects.toThrow('Not connected');
    });

    it('broadcastSessionTitle() throws Not connected', async () => {
      await expect(client.broadcastSessionTitle('title')).rejects.toThrow('Not connected');
    });

    it('broadcastInteractiveResponse() throws Not connected', async () => {
      const data = { command: 'config', uiType: 'select', title: 'T', options: [] } as any;
      await expect(client.broadcastInteractiveResponse(data)).rejects.toThrow('Not connected');
    });

    it('broadcastInteractiveConfirm() throws Not connected', async () => {
      await expect(
        client.broadcastInteractiveConfirm('config' as any, { success: true }),
      ).rejects.toThrow('Not connected');
    });

    it('broadcastResumeHistory() throws Not connected', async () => {
      await expect(client.broadcastResumeHistory('sid')).rejects.toThrow('Not connected');
    });

    it('broadcastUserQuestion() throws Not connected', async () => {
      const data = { toolUseId: 'tu1', questions: [] } as any;
      await expect(client.broadcastUserQuestion(data)).rejects.toThrow('Not connected');
    });

    it('broadcastPermissionRequest() throws Not connected', async () => {
      const data = { requestId: 'r1', toolName: 'Edit', toolInput: {}, toolUseId: 'tu1' } as any;
      await expect(client.broadcastPermissionRequest(data)).rejects.toThrow('Not connected');
    });
  });

  // -------------------------------------------------------------------------
  // Realtime disabled behavior (channels failed to subscribe)
  // -------------------------------------------------------------------------

  describe('realtime disabled — methods that persist to DB still persist', () => {
    let disabledClient: RealtimeClient;
    let disabledInsert: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const failOutput = createMockChannel('CHANNEL_ERROR');
      const failInput = createMockChannel('CHANNEL_ERROR');
      disabledInsert = vi.fn().mockResolvedValue({ error: null });
      const disabledSupabase = buildSupabase(
        failOutput, failInput, presenceChannel, disabledInsert,
      );
      disabledClient = new RealtimeClient({
        supabase: disabledSupabase,
        sessionId: 'disabled-session',
      });
      await disabledClient.connect();
    });

    afterEach(async () => {
      await disabledClient.disconnect();
    });

    it('broadcast() still persists to DB', async () => {
      await disabledClient.broadcast('data');
      expect(disabledInsert).toHaveBeenCalled();
      expect(disabledClient.getSeq()).toBe(1);
    });

    it('broadcastSystem() still persists to DB', async () => {
      await disabledClient.broadcastSystem('sys data');
      expect(disabledInsert).toHaveBeenCalled();
    });

    it('broadcastToolUse() still persists to DB', async () => {
      const toolData = { action: 'Edit', filePath: 'f', oldString: 'a', newString: 'b' } as any;
      await disabledClient.broadcastToolUse(toolData);
      expect(disabledInsert).toHaveBeenCalled();
    });

    it('broadcastMode() does not throw (silent no-op)', async () => {
      await expect(disabledClient.broadcastMode('plan')).resolves.not.toThrow();
    });

    it('broadcastComplete() does not throw (silent no-op)', async () => {
      await expect(disabledClient.broadcastComplete()).resolves.not.toThrow();
    });

    it('broadcastQueued() does not throw (silent no-op)', async () => {
      await expect(disabledClient.broadcastQueued()).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Presence tracking failure is non-critical
  // -------------------------------------------------------------------------

  describe('presence tracking failure', () => {
    it('connect() succeeds even when presence track fails', async () => {
      // Arrange: presence track throws
      presenceChannel.track.mockRejectedValue(new Error('presence failed'));

      // Act
      await client.connect();

      // Wait for async presence callback
      await new Promise((r) => setTimeout(r, 20));

      // Assert: client is still connected and functional
      expect(client.isConnected()).toBe(true);
      expect(client.isRealtimeEnabled()).toBe(true);
    });
  });
});
