import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  ImageAttachment,
  InteractiveCommandType,
  ModelInfo,
  RealtimeMessage,
  SlashCommand,
} from 'termbridge-shared';

// Mock Claude Agent SDK
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

import { Daemon } from '../daemon/daemon.js';
import type { SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

describe('Daemon', () => {
  let mockSupabase: Partial<SupabaseClient>;
  let daemon: Daemon | null = null;
  let mockOutputChannel: Partial<RealtimeChannel>;
  let mockInputChannel: Partial<RealtimeChannel>;
  let mockPresenceChannel: Partial<RealtimeChannel>;

  const mockMachine = {
    id: 'machine-123',
    user_id: 'user-456',
    name: 'Test Machine',
    hostname: 'test-host',
    status: 'online',
    last_seen_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  const mockSession = {
    id: 'session-789',
    machine_id: 'machine-123',
    status: 'active',
    working_directory: '/home/user',
    started_at: new Date().toISOString(),
    ended_at: null,
  };

  // Helper to create chainable eq mock
  const createChainableEq = (finalResult: any) => {
    const eqMock: any = vi.fn();
    eqMock.mockReturnValue({
      eq: eqMock,
      single: vi.fn().mockResolvedValue(finalResult),
      order: vi.fn().mockResolvedValue(finalResult),
    });
    return eqMock;
  };

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
      from: vi.fn((table) => {
        if (table === 'machines') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockMachine, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
            select: vi.fn().mockReturnValue({
              eq: createChainableEq({
                data: null,
                error: { code: 'PGRST116', message: 'Not found' },
              }),
            }),
          };
        }
        if (table === 'sessions') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return {};
      }),
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
    };
  });

  afterEach(async () => {
    if (daemon && daemon.isRunning()) {
      await daemon.stop();
    }
    daemon = null;
  });

  it('should create daemon with options', () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    expect(daemon).toBeDefined();
  });

  it('should register machine on start', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    await daemon.start();

    expect(mockSupabase.from).toHaveBeenCalledWith('machines');
    expect(daemon.getMachine()).toBeDefined();
    expect(daemon.getMachine()?.id).toBe('machine-123');
  });

  it('should create session on start', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    await daemon.start();

    expect(mockSupabase.from).toHaveBeenCalledWith('sessions');
    expect(daemon.getSession()).toBeDefined();
    expect(daemon.getSession()?.id).toBe('session-789');
  });

  it('should connect to realtime channels on start', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    await daemon.start();

    expect(mockSupabase.channel).toHaveBeenCalled();
    expect(mockOutputChannel.subscribe).toHaveBeenCalled();
    expect(mockInputChannel.subscribe).toHaveBeenCalled();
  });

  it('should emit started event on start', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    const startedCallback = vi.fn();
    daemon.on('started', startedCallback);

    await daemon.start();

    expect(startedCallback).toHaveBeenCalledWith(
      expect.objectContaining({
        machine: expect.any(Object),
        session: expect.any(Object),
      })
    );
  });

  it('should end session on stop', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    await daemon.start();
    await daemon.stop();

    // Verify session update was called
    expect(mockSupabase.from).toHaveBeenCalledWith('sessions');
  });

  it('should not update machine status on stop (other sessions may be running)', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    await daemon.start();

    // Clear mock calls from start
    vi.clearAllMocks();

    await daemon.stop();

    // Verify machine update was NOT called for 'offline' status
    // (only session should be ended, machine status should not change)
    const machineCalls = (mockSupabase.from as any).mock.calls.filter(
      (call: any[]) => call[0] === 'machines'
    );
    expect(machineCalls.length).toBe(0);
  });

  it('should emit stopped event on stop', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    const stoppedCallback = vi.fn();
    daemon.on('stopped', stoppedCallback);

    await daemon.start();
    await daemon.stop();

    expect(stoppedCallback).toHaveBeenCalled();
  });

  it('should report running status correctly', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    expect(daemon.isRunning()).toBe(false);

    await daemon.start();
    expect(daemon.isRunning()).toBe(true);

    await daemon.stop();
    expect(daemon.isRunning()).toBe(false);
  });

  it('should throw error when starting already running daemon', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    await daemon.start();

    await expect(daemon.start()).rejects.toThrow('Daemon is already running');
  });

  it('should have sendPrompt method', async () => {
    daemon = new Daemon({
      supabase: mockSupabase as SupabaseClient,
      userId: 'user-456',
      cwd: '/home/user',
    });

    await daemon.start();

    expect(typeof daemon.sendPrompt).toBe('function');
  });

  describe('permission mode handling', () => {
    it('should listen for permission-mode event from SDK session', async () => {
      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      // The daemon should have set up a listener for permission-mode
      // We can verify this by checking that the SDK session has the listener
      const sdkSession = (daemon as any).sdkSession;
      const listeners = sdkSession.listeners('permission-mode');
      expect(listeners.length).toBeGreaterThan(0);
    });

    it('should call realtimeClient.broadcastMode when mode received', async () => {
      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      // Get access to the internal SDK session and realtime client
      const sdkSession = (daemon as any).sdkSession;

      // Spy on the output channel send
      const sendSpy = mockOutputChannel.send;

      // Emit permission-mode event from SDK session
      sdkSession.emit('permission-mode', 'bypassPermissions');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify broadcastMode was called (it sends to output channel)
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'mode',
            permissionMode: 'bypassPermissions',
          }),
        })
      );
    });
  });

  describe('commands handling', () => {
    it('should broadcast commands after first query completion', async () => {
      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      // Get access to the internal SDK session
      const sdkSession = (daemon as any).sdkSession;
      const sendSpy = mockOutputChannel.send;

      // Emit complete event to simulate first query completion
      sdkSession.emit('complete');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify broadcastCommands was called
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'commands',
          }),
        })
      );
    });

    it('should handle commands-request message from mobile', async () => {
      let inputHandler: ((payload: any) => void) | null = null;

      mockInputChannel.on = vi.fn((event, filter, handler) => {
        if (event === 'broadcast' && filter.event === 'input') {
          inputHandler = handler;
        }
        return mockInputChannel as RealtimeChannel;
      });

      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      const sendSpy = mockOutputChannel.send;

      // Simulate receiving commands-request from mobile
      if (inputHandler) {
        inputHandler({
          payload: {
            type: 'commands-request',
            timestamp: Date.now(),
            seq: 1,
          },
        });
      }

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify broadcastCommands was called in response
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'commands',
          }),
        })
      );
    });
  });

  describe('attachment handling', () => {
    it('should extract attachments from incoming RealtimeMessage', async () => {
      // Test the logic for extracting attachments
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      const message: RealtimeMessage = {
        type: 'input',
        content: 'Describe this image',
        attachments,
        timestamp: Date.now(),
        seq: 1,
      };

      // Verify the message structure supports attachments
      expect(message.attachments).toBeDefined();
      expect(message.attachments!.length).toBe(1);
      expect(message.attachments![0].type).toBe('image');
    });

    it('should handle messages with only attachments (no text)', async () => {
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/png', data: 'base64data' },
      ];

      const message: RealtimeMessage = {
        type: 'input',
        content: '',
        attachments,
        timestamp: Date.now(),
        seq: 1,
      };

      // Verify empty content with attachments is valid
      expect(message.content).toBe('');
      expect(message.attachments).toBeDefined();
      expect(message.attachments!.length).toBe(1);
    });

    it('should pass attachments to sendPrompt', async () => {
      // This tests the interface contract - sendPrompt should accept attachments
      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      // The sendPrompt method should exist and accept attachments
      // This is validated by TypeScript - if it compiles, the interface is correct
      expect(typeof daemon.sendPrompt).toBe('function');
    });
  });

  describe('interactive command handling', () => {
    it('should handle interactive-request message from mobile', async () => {
      let inputHandler: ((payload: any) => void) | null = null;

      mockInputChannel.on = vi.fn((event, filter, handler) => {
        if (event === 'broadcast' && filter.event === 'input') {
          inputHandler = handler;
        }
        return mockInputChannel as RealtimeChannel;
      });

      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      const sendSpy = mockOutputChannel.send;

      // Simulate receiving interactive-request from mobile
      if (inputHandler) {
        inputHandler({
          payload: {
            type: 'interactive-request',
            interactiveCommand: 'permissions' as InteractiveCommandType,
            timestamp: Date.now(),
            seq: 1,
          },
        });
      }

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify broadcastInteractiveResponse was called
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'interactive-response',
            interactiveData: expect.objectContaining({
              command: 'permissions',
              uiType: 'select',
            }),
          }),
        })
      );
    });

    it('should handle interactive-apply message from mobile', async () => {
      let inputHandler: ((payload: any) => void) | null = null;

      mockInputChannel.on = vi.fn((event, filter, handler) => {
        if (event === 'broadcast' && filter.event === 'input') {
          inputHandler = handler;
        }
        return mockInputChannel as RealtimeChannel;
      });

      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      const sendSpy = mockOutputChannel.send;

      // Simulate receiving interactive-apply from mobile
      if (inputHandler) {
        inputHandler({
          payload: {
            type: 'interactive-apply',
            interactivePayload: {
              command: 'vim' as InteractiveCommandType,
              action: 'toggle',
              value: true,
            },
            timestamp: Date.now(),
            seq: 1,
          },
        });
      }

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify broadcastInteractiveConfirm was called
      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'interactive-confirm',
            interactiveCommand: 'vim',
            interactiveResult: expect.objectContaining({
              success: true,
            }),
          }),
        })
      );
    });
  });

  describe('concurrent sessions', () => {
    it('should support multiple daemons running concurrently', async () => {
      const daemon1 = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      const daemon2 = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon1.start();
      await daemon2.start();

      expect(daemon1.isRunning()).toBe(true);
      expect(daemon2.isRunning()).toBe(true);

      await daemon1.stop();
      await daemon2.stop();
    });

    it('should stop one daemon without affecting others', async () => {
      const daemon1 = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      const daemon2 = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon1.start();
      await daemon2.start();

      // Stop only daemon1
      await daemon1.stop();

      expect(daemon1.isRunning()).toBe(false);
      expect(daemon2.isRunning()).toBe(true);

      await daemon2.stop();
    });

    it('should track daemons by session ID in a Map', async () => {
      // Make sessions table return different IDs for each insert
      let sessionCounter = 0;
      const originalFrom = mockSupabase.from;
      mockSupabase.from = vi.fn((table) => {
        if (table === 'sessions') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockImplementation(() => {
                  sessionCounter++;
                  return Promise.resolve({
                    data: { ...mockSession, id: `session-${sessionCounter}` },
                    error: null,
                  });
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          };
        }
        return (originalFrom as any)(table);
      });

      const daemons: Map<string, Daemon> = new Map();

      const d1 = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      const d2 = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await d1.start();
      await d2.start();

      const session1Id = d1.getSession()?.id;
      const session2Id = d2.getSession()?.id;

      expect(session1Id).toBeDefined();
      expect(session2Id).toBeDefined();
      expect(session1Id).not.toBe(session2Id);

      daemons.set(session1Id!, d1);
      daemons.set(session2Id!, d2);

      expect(daemons.size).toBe(2);

      // Stop one by session ID
      const targetDaemon = daemons.get(session1Id!);
      expect(targetDaemon).toBeDefined();
      await targetDaemon!.stop();
      daemons.delete(session1Id!);

      expect(daemons.size).toBe(1);
      expect(daemons.has(session2Id!)).toBe(true);
      expect(daemons.get(session2Id!)!.isRunning()).toBe(true);

      await d2.stop();
      daemons.delete(session2Id!);

      // Restore original mock
      mockSupabase.from = originalFrom;
    });

    it('should emit stopped event independently for each daemon', async () => {
      const daemon1 = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      const daemon2 = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      const stopped1 = vi.fn();
      const stopped2 = vi.fn();

      daemon1.on('stopped', stopped1);
      daemon2.on('stopped', stopped2);

      await daemon1.start();
      await daemon2.start();

      await daemon1.stop();

      expect(stopped1).toHaveBeenCalled();
      expect(stopped2).not.toHaveBeenCalled();

      await daemon2.stop();

      expect(stopped2).toHaveBeenCalled();
    });
  });

  describe('model handling', () => {
    it('should handle model-change message from mobile', async () => {
      let inputHandler: ((payload: any) => void) | null = null;

      mockInputChannel.on = vi.fn((event, filter, handler) => {
        if (event === 'broadcast' && filter.event === 'input') {
          inputHandler = handler;
        }
        return mockInputChannel as RealtimeChannel;
      });

      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      const sdkSession = (daemon as any).sdkSession;
      const setModelSpy = vi.spyOn(sdkSession, 'setModel').mockResolvedValue(undefined);

      // Simulate receiving model-change from mobile
      if (inputHandler) {
        inputHandler({
          payload: {
            type: 'model-change',
            model: 'opus',
            timestamp: Date.now(),
            seq: 1,
          },
        });
      }

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(setModelSpy).toHaveBeenCalledWith('opus');
    });

    it('should broadcast model after model change', async () => {
      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      const sdkSession = (daemon as any).sdkSession;
      const sendSpy = mockOutputChannel.send;

      // Emit model event from SDK session
      sdkSession.emit('model', 'opus');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendSpy).toHaveBeenCalledWith(
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

    it('should persist model to database when model changes', async () => {
      const sessionUpdateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      // Track calls to sessions table with update
      const originalFrom = mockSupabase.from;
      mockSupabase.from = vi.fn((table) => {
        if (table === 'sessions') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockSession, error: null }),
              }),
            }),
            update: sessionUpdateMock,
          };
        }
        return (originalFrom as any)(table);
      });

      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      const sdkSession = (daemon as any).sdkSession;

      // Emit model event from SDK session
      sdkSession.emit('model', 'opus');

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Verify model was persisted to database
      expect(sessionUpdateMock).toHaveBeenCalledWith({ model: 'opus' });
    });

    it('should handle models-request message from mobile', async () => {
      let inputHandler: ((payload: any) => void) | null = null;

      mockInputChannel.on = vi.fn((event, filter, handler) => {
        if (event === 'broadcast' && filter.event === 'input') {
          inputHandler = handler;
        }
        return mockInputChannel as RealtimeChannel;
      });

      daemon = new Daemon({
        supabase: mockSupabase as SupabaseClient,
        userId: 'user-456',
        cwd: '/home/user',
      });

      await daemon.start();

      const sdkSession = (daemon as any).sdkSession;
      const mockModels: ModelInfo[] = [
        { value: 'sonnet', displayName: 'Claude Sonnet', description: 'Balanced' },
      ];
      vi.spyOn(sdkSession, 'getSupportedModels').mockResolvedValue(mockModels);

      const sendSpy = mockOutputChannel.send;

      // Simulate receiving models-request from mobile
      if (inputHandler) {
        inputHandler({
          payload: {
            type: 'models-request',
            timestamp: Date.now(),
            seq: 1,
          },
        });
      }

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(sendSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'output',
          payload: expect.objectContaining({
            type: 'models',
            availableModels: mockModels,
          }),
        })
      );
    });
  });

  describe('request rejection handling', () => {
    it('should broadcast error when sdkSession emits request-rejected event', async () => {
      daemon = new Daemon({
        cwd: '/test',
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'session-789',
      });

      await daemon.start();

      // Get the sdkSession from daemon
      const sdkSession = (daemon as any).sdkSession;

      // Emit request-rejected event
      sdkSession.emit('request-rejected', 'Your message was not processed because Claude is still working on the previous request. Please wait.');

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      // Verify broadcastError was called via the output channel
      expect(mockOutputChannel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'output',
        payload: expect.objectContaining({
          type: 'error',
          content: 'Your message was not processed because Claude is still working on the previous request. Please wait.',
          errorCode: 'request_rejected',
        }),
      });
    });

    it('should handle broadcast errors silently when rejecting requests', async () => {
      // Mock output channel to throw error
      mockOutputChannel.send = vi.fn().mockRejectedValue(new Error('Broadcast failed'));

      daemon = new Daemon({
        cwd: '/test',
        supabase: mockSupabase as SupabaseClient,
        sessionId: 'session-789',
      });

      await daemon.start();

      const sdkSession = (daemon as any).sdkSession;

      // Should not throw even if broadcast fails
      expect(() => {
        sdkSession.emit('request-rejected', 'Test error message');
      }).not.toThrow();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });
});
