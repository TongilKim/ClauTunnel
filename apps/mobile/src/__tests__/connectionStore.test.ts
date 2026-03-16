import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * ConnectionStore Behavior Tests (TDD-aligned)
 *
 * These tests import and exercise the real Zustand connectionStore,
 * mocking only at the Supabase boundary. Every assertion checks
 * observable state or side-effects — never mock internals.
 */

// --- Supabase boundary mock ---

let outputHandler: ((payload: any) => void) | null = null;

const mockSend = vi.fn().mockResolvedValue({ error: null });
const mockRemoveChannel = vi.fn().mockResolvedValue({ error: null });

function createMockSelectChain(overrides: {
  sessionData?: any;
  sessionError?: any;
  messagesData?: any[];
  messagesError?: any;
} = {}) {
  return vi.fn().mockImplementation((table: string) => {
    if (table === 'sessions') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: overrides.sessionData ?? { status: 'active' },
              error: overrides.sessionError ?? null,
            }),
          }),
        }),
      };
    }
    if (table === 'messages') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({
                data: overrides.messagesData ?? [],
                error: overrides.messagesError ?? null,
              }),
            }),
            lt: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: overrides.messagesData ?? [],
                  error: overrides.messagesError ?? null,
                }),
              }),
            }),
          }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      };
    }
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    };
  });
}

function buildMockSupabase(overrides: {
  sessionData?: any;
  sessionError?: any;
  messagesData?: any[];
  messagesError?: any;
} = {}) {
  const mockFrom = createMockSelectChain(overrides);

  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      setSession: vi.fn(),
      verifyOtp: vi.fn(),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    functions: { invoke: vi.fn() },
    from: mockFrom,
    channel: vi.fn().mockImplementation(() => {
      const channel: any = {
        subscribe: vi.fn((cb: (status: string) => void) => {
          setTimeout(() => cb('SUBSCRIBED'), 0);
          return channel;
        }),
        send: mockSend,
        on: vi.fn((event: string, filter: any, handler: (payload: any) => void) => {
          if (event === 'broadcast' && filter?.event === 'output') {
            outputHandler = handler;
          }
          return channel;
        }),
        track: vi.fn().mockResolvedValue(undefined),
        untrack: vi.fn().mockResolvedValue(undefined),
      };
      return channel;
    }),
    removeChannel: mockRemoveChannel,
  };
}

// Mock testMode to always return false (we test real behavior, not mock mode)
vi.mock('../utils/testMode', () => ({
  isTestMode: () => false,
  MOCK_MESSAGES: [],
  MOCK_COMMANDS: [],
  MOCK_MODELS: [],
  MOCK_PERMISSION_MODE: null,
  buildMockClaudeResponse: () => '',
  buildMockAnswerSummary: () => '',
  buildMockPermissionSummary: () => '',
}));

// Mock expo modules
vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn(),
  EncodingType: { Base64: 'base64' },
}));
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

let mockSupabase: ReturnType<typeof buildMockSupabase>;

// We must mock supabase BEFORE the store is imported
vi.mock('../services/supabase', () => {
  // This will be replaced in beforeEach via vi.mocked
  return {
    supabase: buildMockSupabase(),
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  };
});

// Helper: get a fresh store instance
async function getStore() {
  vi.resetModules();

  // Re-mock supabase with the current mockSupabase
  vi.doMock('../services/supabase', () => ({
    supabase: mockSupabase,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  }));

  // Re-mock sessionStore to avoid circular dependency issues
  vi.doMock('../stores/sessionStore', () => ({
    useSessionStore: {
      getState: () => ({ sessions: [] }),
      setState: vi.fn(),
    },
  }));

  const { useConnectionStore } = await import('../stores/connectionStore');
  return useConnectionStore;
}

// Helper: connect store and capture output handler
async function connectStore(useStore: any) {
  await useStore.getState().connect('test-session');
  // Wait for async subscribe callbacks
  await new Promise((r) => setTimeout(r, 20));
  return useStore;
}

// Helper: simulate a message arriving on the output channel
function simulateMessage(message: any) {
  if (!outputHandler) throw new Error('outputHandler not captured — did you call connectStore()?');
  outputHandler({ payload: message });
}

describe('ConnectionStore — Real Behavior', () => {
  beforeEach(() => {
    outputHandler = null;
    mockSend.mockClear();
    mockRemoveChannel.mockClear();
    mockSupabase = buildMockSupabase();
  });

  // ---------------------------------------------------------------------------
  // 2E: Message Handler — State Transitions
  // ---------------------------------------------------------------------------

  describe('Message Handlers', () => {
    it('request-queued sets isMessageQueued to true', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      simulateMessage({ type: 'request-queued', timestamp: Date.now(), seq: 1 });

      expect(useStore.getState().isMessageQueued).toBe(true);
    });

    it('error clears isTyping/isMessageQueued and sets error', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      // Set up typing state
      useStore.setState({ isTyping: true, isMessageQueued: true });

      simulateMessage({ type: 'error', content: 'something broke', timestamp: Date.now(), seq: 1 });

      const state = useStore.getState();
      expect(state.isTyping).toBe(false);
      expect(state.isMessageQueued).toBe(false);
      expect(state.error).toBe('something broke');
    });

    it('error uses default message when content is empty', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      simulateMessage({ type: 'error', content: '', timestamp: Date.now(), seq: 1 });

      expect(useStore.getState().error).toBe('An error occurred');
    });

    it('mode updates permissionMode', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      simulateMessage({ type: 'mode', permissionMode: 'plan', timestamp: Date.now(), seq: 1 });

      expect(useStore.getState().permissionMode).toBe('plan');
    });

    it('commands updates commands array', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      const commands = [
        { name: 'commit', description: 'Commit changes', argumentHint: '<msg>' },
      ];
      simulateMessage({ type: 'commands', commands, timestamp: Date.now(), seq: 1 });

      expect(useStore.getState().commands).toEqual(commands);
    });

    it('model updates model and clears isModelChanging', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      useStore.setState({ isModelChanging: true });

      simulateMessage({ type: 'model', model: 'opus', timestamp: Date.now(), seq: 1 });

      const state = useStore.getState();
      expect(state.model).toBe('opus');
      expect(state.isModelChanging).toBe(false);
    });

    it('models updates availableModels', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      const models = [{ value: 'opus', displayName: 'Opus' }];
      simulateMessage({ type: 'models', availableModels: models, timestamp: Date.now(), seq: 1 });

      expect(useStore.getState().availableModels).toEqual(models);
    });

    it('interactive-response sets interactiveData and clears loading', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      useStore.setState({ isInteractiveLoading: true });

      const data = { command: 'config', uiType: 'select', title: 'T', options: [] };
      simulateMessage({ type: 'interactive-response', interactiveData: data, timestamp: Date.now(), seq: 1 });

      const state = useStore.getState();
      expect(state.interactiveData).toEqual(data);
      expect(state.isInteractiveLoading).toBe(false);
      expect(state.interactiveError).toBeNull();
    });

    it('interactive-confirm clears interactive state on success', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      useStore.setState({ interactiveData: { command: 'config' } as any });

      simulateMessage({
        type: 'interactive-confirm',
        interactiveResult: { success: true },
        timestamp: Date.now(),
        seq: 1,
      });

      expect(useStore.getState().interactiveData).toBeNull();
      expect(useStore.getState().interactiveError).toBeNull();
    });

    it('interactive-confirm sets error on failure', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      simulateMessage({
        type: 'interactive-confirm',
        interactiveResult: { success: false, message: 'Failed to apply' },
        timestamp: Date.now(),
        seq: 1,
      });

      expect(useStore.getState().interactiveError).toBe('Failed to apply');
    });

    it('user-question sets pendingQuestion and clears isTyping', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      useStore.setState({ isTyping: true });

      const question = { toolUseId: 'tu1', questions: [{ question: 'q1' }] };
      simulateMessage({ type: 'user-question', userQuestion: question, timestamp: Date.now(), seq: 1 });

      const state = useStore.getState();
      expect(state.pendingQuestion).toEqual(question);
      expect(state.isTyping).toBe(false);
    });

    it('permission-request sets pendingPermissionRequest and clears isTyping', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      useStore.setState({ isTyping: true });

      const request = { requestId: 'r1', toolName: 'Edit', toolInput: {}, toolUseId: 'tu1' };
      simulateMessage({ type: 'permission-request', permissionRequest: request, timestamp: Date.now(), seq: 1 });

      const state = useStore.getState();
      expect(state.pendingPermissionRequest).toEqual(request);
      expect(state.isTyping).toBe(false);
    });

    it('status-response restores isTyping/isMessageQueued/permissionMode', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      simulateMessage({
        type: 'status-response',
        isProcessing: true,
        isMessageQueued: true,
        permissionMode: 'bypassPermissions',
        timestamp: Date.now(),
        seq: 1,
      });

      const state = useStore.getState();
      expect(state.isTyping).toBe(true);
      expect(state.isMessageQueued).toBe(true);
      expect(state.permissionMode).toBe('bypassPermissions');
    });

    it('complete clears isTyping and isMessageQueued', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      useStore.setState({ isTyping: true, isMessageQueued: true });

      simulateMessage({ type: 'complete', timestamp: Date.now(), seq: 1 });

      const state = useStore.getState();
      expect(state.isTyping).toBe(false);
      expect(state.isMessageQueued).toBe(false);
    });

    it('output message is added to messages array', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      simulateMessage({ type: 'output', content: 'Hello world', timestamp: 1000, seq: 1 });

      const state = useStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].content).toBe('Hello world');
      expect(state.messages[0].type).toBe('output');
      expect(state.lastSeq).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2B: Message Deduplication
  // ---------------------------------------------------------------------------

  describe('Message Deduplication', () => {
    it('skips duplicate message with same seq and type', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      simulateMessage({ type: 'output', content: 'A', timestamp: 1000, seq: 1 });
      simulateMessage({ type: 'output', content: 'A', timestamp: 1000, seq: 1 });

      expect(useStore.getState().messages).toHaveLength(1);
    });

    it('allows messages with same seq but different type', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      // Pre-add an input message via setState (simulating sendInput)
      useStore.setState({
        messages: [{ type: 'input', content: 'Q', timestamp: 900, seq: 1 }],
      });

      // CLI responds with output that also has seq=1
      simulateMessage({ type: 'output', content: 'A', timestamp: 1000, seq: 1 });

      expect(useStore.getState().messages).toHaveLength(2);
    });

    it('allows messages with same type but different seq', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      simulateMessage({ type: 'output', content: 'chunk1', timestamp: 1000, seq: 1 });
      simulateMessage({ type: 'output', content: 'chunk2', timestamp: 1001, seq: 2 });

      expect(useStore.getState().messages).toHaveLength(2);
    });

    it('handles rapid sequential messages without dropping any', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      for (let i = 1; i <= 20; i++) {
        simulateMessage({ type: 'output', content: `msg-${i}`, timestamp: 1000 + i, seq: i });
      }

      expect(useStore.getState().messages).toHaveLength(20);
      expect(useStore.getState().lastSeq).toBe(20);
    });
  });

  // ---------------------------------------------------------------------------
  // Connection Lifecycle
  // ---------------------------------------------------------------------------

  describe('Connection Lifecycle', () => {
    it('connect sets state to connected', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      expect(useStore.getState().state).toBe('connected');
      expect(useStore.getState().sessionId).toBe('test-session');
    });

    it('connect resets all session-specific state', async () => {
      const useStore = await getStore();

      // Simulate leftover state from a previous session
      useStore.setState({
        messages: [{ type: 'output', content: 'old', timestamp: 1, seq: 1 }],
        isTyping: true,
        isMessageQueued: true,
        permissionMode: 'plan' as any,
        model: 'opus',
        commands: [{ name: 'commit', description: 'd', argumentHint: '' }],
        interactiveData: {} as any,
        pendingQuestion: {} as any,
        pendingPermissionRequest: {} as any,
      });

      await connectStore(useStore);

      const state = useStore.getState();
      expect(state.messages).toEqual([]);
      expect(state.isTyping).toBe(false);
      expect(state.isMessageQueued).toBe(false);
      expect(state.isCliOnline).toBeNull();
      expect(state.permissionMode).toBeNull();
      expect(state.model).toBeNull();
      expect(state.commands).toEqual([]);
      expect(state.interactiveData).toBeNull();
      expect(state.pendingQuestion).toBeNull();
      expect(state.pendingPermissionRequest).toBeNull();
    });

    it('connect sets error when session fetch fails', async () => {
      mockSupabase = buildMockSupabase({ sessionError: { message: 'not found' } });
      const useStore = await getStore();

      await useStore.getState().connect('bad-session');
      await new Promise((r) => setTimeout(r, 20));

      const state = useStore.getState();
      expect(state.state).toBe('disconnected');
      expect(state.error).toBeDefined();
    });

    it('connect transitions to disconnected when session is ended', async () => {
      mockSupabase = buildMockSupabase({ sessionData: { status: 'ended' } });
      const useStore = await getStore();

      await useStore.getState().connect('ended-session');
      await new Promise((r) => setTimeout(r, 20));

      expect(useStore.getState().state).toBe('disconnected');
      expect(useStore.getState().error).toBeNull();
    });

    it('disconnect resets state', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      expect(useStore.getState().state).toBe('connected');

      await useStore.getState().disconnect();

      const state = useStore.getState();
      expect(state.state).toBe('disconnected');
      expect(state.sessionId).toBeNull();
      expect(state.messages).toEqual([]);
      expect(state.isCliOnline).toBe(false);
    });

    it('loads historical messages on connect', async () => {
      // Mock returns messages in descending order (as Supabase would)
      // The store reverses them back to chronological order
      mockSupabase = buildMockSupabase({
        messagesData: [
          { type: 'output', content: 'A', created_at: '2026-01-01T00:00:01Z', seq: 2 },
          { type: 'input', content: 'Q', created_at: '2026-01-01T00:00:00Z', seq: 1 },
        ],
      });
      const useStore = await getStore();
      await connectStore(useStore);

      const state = useStore.getState();
      expect(state.messages).toHaveLength(2);
      expect(state.messages[0].content).toBe('Q');
      expect(state.messages[1].content).toBe('A');
      expect(state.lastSeq).toBe(2);
      expect(state.oldestLoadedSeq).toBe(1);
    });

    it('sets isTyping when last historical message is input', async () => {
      // Descending order from Supabase; only one message so order doesn't matter
      mockSupabase = buildMockSupabase({
        messagesData: [
          { type: 'input', content: 'pending question', created_at: '2026-01-01T00:00:00Z', seq: 1 },
        ],
      });
      const useStore = await getStore();
      await connectStore(useStore);

      expect(useStore.getState().isTyping).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2C: Pagination — fetchOlderMessages
  // ---------------------------------------------------------------------------

  describe('fetchOlderMessages', () => {
    it('does nothing when isLoadingMore is true', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      useStore.setState({ isLoadingMore: true, hasMoreMessages: true, oldestLoadedSeq: 50 });

      await useStore.getState().fetchOlderMessages();

      // isLoadingMore should still be true (not toggled)
      expect(useStore.getState().isLoadingMore).toBe(true);
    });

    it('does nothing when hasMoreMessages is false', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      useStore.setState({ hasMoreMessages: false, oldestLoadedSeq: 1 });

      await useStore.getState().fetchOlderMessages();

      expect(useStore.getState().hasMoreMessages).toBe(false);
    });

    it('does nothing when oldestLoadedSeq is null', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      useStore.setState({ hasMoreMessages: true, oldestLoadedSeq: null });

      await useStore.getState().fetchOlderMessages();

      // Should remain unchanged
      expect(useStore.getState().oldestLoadedSeq).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // sendInput behavior
  // ---------------------------------------------------------------------------

  describe('sendInput', () => {
    it('adds input message to messages and sets isTyping', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      await useStore.getState().sendInput('Hello Claude');

      const state = useStore.getState();
      expect(state.messages).toHaveLength(1);
      expect(state.messages[0].type).toBe('input');
      expect(state.messages[0].content).toBe('Hello Claude');
      expect(state.isTyping).toBe(true);
    });

    it('sends input message via realtime channel', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      mockSend.mockClear();

      await useStore.getState().sendInput('Hello Claude');

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'broadcast',
          event: 'input',
          payload: expect.objectContaining({
            type: 'input',
            content: 'Hello Claude',
          }),
        }),
      );
    });

    it('persists input message to database', async () => {
      const useStore = await getStore();
      await connectStore(useStore);

      await useStore.getState().sendInput('Hello Claude');

      expect(mockSupabase.from).toHaveBeenCalledWith('messages');
    });

    it('sets error when channel.send() fails', async () => {
      const useStore = await getStore();
      await connectStore(useStore);
      mockSend.mockRejectedValueOnce(new Error('send failed'));

      await useStore.getState().sendInput('Hello Claude');

      expect(useStore.getState().error).toBe('Failed to send message');
    });

    it('sets error when not connected', async () => {
      const useStore = await getStore();
      // Don't connect

      await useStore.getState().sendInput('should fail');

      expect(useStore.getState().error).toBe('Not connected');
    });
  });

  // ---------------------------------------------------------------------------
  // clearMessages
  // ---------------------------------------------------------------------------

  describe('clearMessages', () => {
    it('resets messages, lastSeq, and pagination state', async () => {
      const useStore = await getStore();
      useStore.setState({
        messages: [{ type: 'output', content: 'x', timestamp: 1, seq: 1 }],
        lastSeq: 5,
        hasMoreMessages: false,
        isLoadingMore: true,
        oldestLoadedSeq: 1,
      });

      useStore.getState().clearMessages();

      const state = useStore.getState();
      expect(state.messages).toEqual([]);
      expect(state.lastSeq).toBe(0);
      expect(state.hasMoreMessages).toBe(true);
      expect(state.isLoadingMore).toBe(false);
      expect(state.oldestLoadedSeq).toBeNull();
    });
  });
});
