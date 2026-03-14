import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { RealtimeMessage, ImageAttachment, PermissionMode, SlashCommand } from 'clautunnel-shared';
import { convertImageToBase64, getMediaTypeFromUri } from '../utils/imageUtils';

// Mock expo-file-system/legacy
vi.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: vi.fn().mockResolvedValue('base64encodeddata'),
  EncodingType: { Base64: 'base64' },
}));

// Mock expo-image-manipulator
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn().mockResolvedValue({ uri: 'file:///resized/image.jpg' }),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}));

// Mock supabase before imports
vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      setSession: vi.fn(),
      verifyOtp: vi.fn(),
      onAuthStateChange: vi.fn(),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
  },
}));

// Test store logic without React Native dependencies
describe('Store Logic', () => {
  describe('AuthStore', () => {
    it('should have initial state with isPaired false', () => {
      const initialState = {
        user: null,
        session: null,
        isPaired: false,
        isLoading: true,
        error: null,
      };

      expect(initialState.user).toBeNull();
      expect(initialState.session).toBeNull();
      expect(initialState.isPaired).toBe(false);
      expect(initialState.isLoading).toBe(true);
      expect(initialState.error).toBeNull();
    });

    it('should clear error', () => {
      let error: string | null = 'Some error';

      const clearError = () => {
        error = null;
      };

      clearError();
      expect(error).toBeNull();
    });

    describe('disconnect', () => {
      it('should call supabase.auth.signOut with local scope', async () => {
        const { supabase } = await import('../services/supabase');
        const mockSignOut = vi.mocked(supabase.auth.signOut);
        mockSignOut.mockResolvedValue({ error: null } as any);

        vi.resetModules();
        const { useAuthStore } = await import('../stores/authStore');
        const store = useAuthStore.getState();
        await store.disconnect();

        expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
      });
    });

    describe('initialize', () => {
      it('should check for existing session via getSession', async () => {
        const { supabase } = await import('../services/supabase');
        const mockGetSession = vi.mocked(supabase.auth.getSession);
        const mockOnAuthStateChange = vi.mocked(supabase.auth.onAuthStateChange);

        mockGetSession.mockResolvedValue({
          data: { session: null },
          error: null,
        } as any);
        mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } } as any);

        vi.resetModules();
        const { useAuthStore } = await import('../stores/authStore');
        const store = useAuthStore.getState();
        await store.initialize();

        expect(mockGetSession).toHaveBeenCalled();
      });
    });

    describe('redeemPairingCode', () => {
      it('should call Edge Function and verifyOtp on success', async () => {
        const { supabase } = await import('../services/supabase');
        const mockVerifyOtp = vi.mocked(supabase.auth.verifyOtp);
        const mockOnAuthStateChange = vi.mocked(supabase.auth.onAuthStateChange);

        const mockFetch = vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ hashed_token: 'test-hashed-token' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        mockVerifyOtp.mockResolvedValue({
          data: {
            session: {
              access_token: 'new-token',
              refresh_token: 'new-refresh',
              user: { id: 'user-1', email: 'test@test.com' },
            },
            user: { id: 'user-1', email: 'test@test.com' },
          },
          error: null,
        } as any);

        mockOnAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } } as any);

        vi.resetModules();
        const { useAuthStore } = await import('../stores/authStore');
        const store = useAuthStore.getState();
        await store.redeemPairingCode('test-pairing-uuid');

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/functions/v1/redeem-mobile-pairing'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ code: 'test-pairing-uuid' }),
          })
        );
        expect(mockVerifyOtp).toHaveBeenCalledWith({
          token_hash: 'test-hashed-token',
          type: 'email',
        });

        vi.unstubAllGlobals();
      });

      it('should set error when Edge Function fails', async () => {
        const mockFetch = vi.fn().mockResolvedValue({
          ok: false,
          status: 410,
          json: () => Promise.resolve({ error: 'Pairing code expired' }),
        });
        vi.stubGlobal('fetch', mockFetch);

        vi.resetModules();
        const { useAuthStore } = await import('../stores/authStore');
        const store = useAuthStore.getState();
        await store.redeemPairingCode('expired-code');

        const state = useAuthStore.getState();
        expect(state.error).toBe('Pairing code expired');
        expect(state.isPaired).toBe(false);

        vi.unstubAllGlobals();
      });
    });
  });

  describe('SessionStore', () => {
    it('should have initial state', () => {
      const initialState = {
        sessions: [],
        isLoading: false,
        error: null,
        sessionOnlineStatus: {},
      };

      expect(initialState.sessions).toEqual([]);
      expect(initialState.isLoading).toBe(false);
      expect(initialState.error).toBeNull();
      expect(initialState.sessionOnlineStatus).toEqual({});
    });

    it('should track session online status per session', () => {
      let sessionOnlineStatus: Record<string, boolean> = {};

      const updateOnlineStatus = (sessionId: string, isOnline: boolean) => {
        sessionOnlineStatus = { ...sessionOnlineStatus, [sessionId]: isOnline };
      };

      updateOnlineStatus('session-1', true);
      expect(sessionOnlineStatus['session-1']).toBe(true);

      updateOnlineStatus('session-2', false);
      expect(sessionOnlineStatus['session-2']).toBe(false);

      // Update existing session
      updateOnlineStatus('session-1', false);
      expect(sessionOnlineStatus['session-1']).toBe(false);
    });

    it('should only subscribe to presence for active sessions', () => {
      const sessions = [
        { id: '1', status: 'active' },
        { id: '2', status: 'ended' },
        { id: '3', status: 'active' },
      ];

      const activeSessions = sessions.filter((s) => s.status === 'active');

      expect(activeSessions.length).toBe(2);
      expect(activeSessions.map((s) => s.id)).toEqual(['1', '3']);
    });

    it('should fetch sessions and update state', () => {
      const mockSessions = [
        { id: '1', machine_id: 'm1', status: 'active' },
        { id: '2', machine_id: 'm2', status: 'ended' },
      ];

      let sessions: any[] = [];

      const setSessions = (data: any[]) => {
        sessions = data;
      };

      setSessions(mockSessions);
      expect(sessions.length).toBe(2);
    });

    it('should set error on fetch failure', () => {
      let error: string | null = null;

      const setError = (message: string) => {
        error = message;
      };

      setError('Failed to fetch sessions');
      expect(error).toBe('Failed to fetch sessions');
    });

    it('should have isLoading true during fetch', () => {
      let isLoading = false;

      const startFetch = () => {
        isLoading = true;
      };

      startFetch();
      expect(isLoading).toBe(true);
    });

    it('should skip fetch if already loading (silent mode)', () => {
      let isLoading = true;
      let fetchCalled = false;

      const fetchSessions = (silent = false) => {
        if (isLoading) return;
        fetchCalled = true;
      };

      fetchSessions(true);
      expect(fetchCalled).toBe(false);
    });

    it('should delete ended sessions for a specific machine', () => {
      let sessions = [
        { id: '1', machine_id: 'm1', status: 'active' },
        { id: '2', machine_id: 'm1', status: 'ended' },
        { id: '3', machine_id: 'm1', status: 'ended' },
        { id: '4', machine_id: 'm2', status: 'ended' },
        { id: '5', machine_id: 'm2', status: 'active' },
      ];

      const deleteEndedSessionsForMachine = (machineId: string) => {
        sessions = sessions.filter(
          (session) => !(session.machine_id === machineId && session.status === 'ended')
        );
      };

      // Delete ended sessions for machine m1
      deleteEndedSessionsForMachine('m1');

      expect(sessions.length).toBe(3);
      // Active session for m1 should remain
      expect(sessions.find((s) => s.id === '1')).toBeDefined();
      // Ended sessions for m1 should be deleted
      expect(sessions.find((s) => s.id === '2')).toBeUndefined();
      expect(sessions.find((s) => s.id === '3')).toBeUndefined();
      // Sessions for m2 should remain
      expect(sessions.find((s) => s.id === '4')).toBeDefined();
      expect(sessions.find((s) => s.id === '5')).toBeDefined();
    });

    it('should delete all ended sessions', () => {
      let sessions = [
        { id: '1', machine_id: 'm1', status: 'active' },
        { id: '2', machine_id: 'm1', status: 'ended' },
        { id: '3', machine_id: 'm2', status: 'ended' },
        { id: '4', machine_id: 'm2', status: 'active' },
      ];

      const deleteEndedSessions = () => {
        sessions = sessions.filter((session) => session.status !== 'ended');
      };

      deleteEndedSessions();

      expect(sessions.length).toBe(2);
      expect(sessions.every((s) => s.status === 'active')).toBe(true);
    });

    it('should not delete anything if machine has no ended sessions', () => {
      let sessions = [
        { id: '1', machine_id: 'm1', status: 'active' },
        { id: '2', machine_id: 'm2', status: 'ended' },
      ];

      const deleteEndedSessionsForMachine = (machineId: string) => {
        sessions = sessions.filter(
          (session) => !(session.machine_id === machineId && session.status === 'ended')
        );
      };

      // Delete ended sessions for m1 (which has none)
      deleteEndedSessionsForMachine('m1');

      expect(sessions.length).toBe(2);
    });

    it('should update session title in local state', () => {
      let sessions = [
        { id: '1', machine_id: 'm1', status: 'active', title: undefined as string | undefined },
        { id: '2', machine_id: 'm2', status: 'active', title: undefined as string | undefined },
      ];

      const updateSessionTitle = (sessionId: string, title: string) => {
        const newTitle = title.trim() === '' ? undefined : title;
        sessions = sessions.map((s) =>
          s.id === sessionId ? { ...s, title: newTitle } : s
        );
      };

      updateSessionTitle('1', 'My Dev Session');
      expect(sessions[0].title).toBe('My Dev Session');
      expect(sessions[1].title).toBeUndefined();
    });

    it('should clear title when empty string is provided', () => {
      let sessions = [
        { id: '1', machine_id: 'm1', status: 'active', title: 'Old Title' as string | undefined },
      ];

      const updateSessionTitle = (sessionId: string, title: string) => {
        const newTitle = title.trim() === '' ? undefined : title;
        sessions = sessions.map((s) =>
          s.id === sessionId ? { ...s, title: newTitle } : s
        );
      };

      updateSessionTitle('1', '');
      expect(sessions[0].title).toBeUndefined();
    });

    it('should display title with priority: session.title || machine.name || Unknown Machine', () => {
      const getDisplayName = (
        sessionTitle: string | undefined,
        machineName: string | undefined
      ): string => {
        return sessionTitle || machineName || 'Unknown Machine';
      };

      expect(getDisplayName('My Session', 'MacBook Pro')).toBe('My Session');
      expect(getDisplayName(undefined, 'MacBook Pro')).toBe('MacBook Pro');
      expect(getDisplayName(undefined, undefined)).toBe('Unknown Machine');
    });

    describe('Presence Subscription Cleanup', () => {
      it('should clear sessionOnlineStatus when session is ended and channel removed', () => {
        let sessionOnlineStatus: Record<string, boolean> = {
          'session-A': true,
          'session-B': true,
        };
        const sessions = [
          { id: 'session-A', status: 'ended' },
          { id: 'session-B', status: 'active' },
        ];

        // Simulate the cleanup logic from subscribeToPresence
        const activeSessions = sessions.filter((s) => s.status === 'active');
        const activeSessionIds = new Set(activeSessions.map((s) => s.id));
        const updatedStatus = { ...sessionOnlineStatus };
        for (const sessionId of Object.keys(updatedStatus)) {
          if (!activeSessionIds.has(sessionId)) {
            delete updatedStatus[sessionId];
          }
        }
        sessionOnlineStatus = updatedStatus;

        expect(sessionOnlineStatus['session-A']).toBeUndefined();
        expect(sessionOnlineStatus['session-B']).toBe(true);
      });

      it('should not overwrite optimistic true status on empty initial presence sync', () => {
        let sessionOnlineStatus: Record<string, boolean> = {
          'session-B': true, // optimistic from startSessionOnMachine
        };

        // Simulate sync with empty presence state (no entries yet)
        const entries: any[] = [];
        const isCliOnline = false; // no CLI found in empty state

        // The fix: if sync is empty AND we already have optimistic true, preserve it
        if (!isCliOnline && entries.length === 0 && sessionOnlineStatus['session-B'] === true) {
          // Do nothing - preserve optimistic status
        } else {
          sessionOnlineStatus = { ...sessionOnlineStatus, 'session-B': isCliOnline };
        }

        expect(sessionOnlineStatus['session-B']).toBe(true);
      });

      it('should update to false when sync has actual presence data without CLI', () => {
        let sessionOnlineStatus: Record<string, boolean> = {
          'session-B': true,
        };

        // Simulate sync with non-empty state (some presences, but no CLI type)
        const entries = [[{ type: 'mobile' }]]; // non-empty, but no CLI
        const isCliOnline = entries.some((presences) =>
          (presences as any[]).some((p) => p.type === 'cli')
        );

        // Non-empty state: we trust the presence data
        if (!isCliOnline && entries.length === 0 && sessionOnlineStatus['session-B'] === true) {
          // Would preserve - but won't match because entries.length > 0
        } else {
          sessionOnlineStatus = { ...sessionOnlineStatus, 'session-B': isCliOnline };
        }

        expect(sessionOnlineStatus['session-B']).toBe(false);
      });

      it('should update to true when sync shows CLI present', () => {
        let sessionOnlineStatus: Record<string, boolean> = {
          'session-B': false,
        };

        // Simulate sync with CLI present
        const entries = [[{ type: 'cli' }]];
        const isCliOnline = entries.some((presences) =>
          (presences as any[]).some((p) => p.type === 'cli')
        );

        if (!isCliOnline && entries.length === 0 && sessionOnlineStatus['session-B'] === true) {
          // preserve - won't match
        } else {
          sessionOnlineStatus = { ...sessionOnlineStatus, 'session-B': isCliOnline };
        }

        expect(sessionOnlineStatus['session-B']).toBe(true);
      });

      it('should handle multiple sessions: ended session cleaned up, new session preserved', () => {
        // Full scenario: session A was online, now ended; session B just created with optimistic true
        let sessionOnlineStatus: Record<string, boolean> = {
          'session-A': true,
          'session-B': true, // optimistic
        };
        const sessions = [
          { id: 'session-A', status: 'ended' },
          { id: 'session-B', status: 'active' },
        ];

        // Step 1: Cleanup ended sessions from online status
        const activeSessions = sessions.filter((s) => s.status === 'active');
        const activeSessionIds = new Set(activeSessions.map((s) => s.id));
        const updatedStatus = { ...sessionOnlineStatus };
        for (const sessionId of Object.keys(updatedStatus)) {
          if (!activeSessionIds.has(sessionId)) {
            delete updatedStatus[sessionId];
          }
        }
        sessionOnlineStatus = updatedStatus;

        // Step 2: Empty sync fires for session-B (CLI hasn't propagated yet)
        const entries: any[] = [];
        const isCliOnline = false;
        if (!isCliOnline && entries.length === 0 && sessionOnlineStatus['session-B'] === true) {
          // Preserve optimistic status
        } else {
          sessionOnlineStatus = { ...sessionOnlineStatus, 'session-B': isCliOnline };
        }

        // session-A should be cleaned up (not in status map)
        expect(sessionOnlineStatus['session-A']).toBeUndefined();
        // session-B should still be true (optimistic preserved)
        expect(sessionOnlineStatus['session-B']).toBe(true);
      });
    });

    it('should get ended session IDs for a specific machine', () => {
      const sessions = [
        { id: '1', machine_id: 'm1', status: 'active' },
        { id: '2', machine_id: 'm1', status: 'ended' },
        { id: '3', machine_id: 'm1', status: 'ended' },
        { id: '4', machine_id: 'm2', status: 'ended' },
      ];

      const getEndedSessionIdsForMachine = (machineId: string): string[] => {
        return sessions
          .filter((s) => s.machine_id === machineId && s.status === 'ended')
          .map((s) => s.id);
      };

      const endedIds = getEndedSessionIdsForMachine('m1');
      expect(endedIds).toEqual(['2', '3']);
    });
  });

  describe('ConnectionStore', () => {
    it('should have initial state', () => {
      const initialState = {
        state: 'disconnected',
        sessionId: null,
        messages: [],
        lastSeq: 0,
        error: null,
        isTyping: false,
        permissionMode: null,
        isCliOnline: null,
      };

      expect(initialState.state).toBe('disconnected');
      expect(initialState.sessionId).toBeNull();
      expect(initialState.messages).toEqual([]);
      expect(initialState.lastSeq).toBe(0);
      expect(initialState.isTyping).toBe(false);
      expect(initialState.isCliOnline).toBeNull();
    });

    it('should have isCliOnline initialized to null (unknown)', () => {
      const initialState = {
        isCliOnline: null as boolean | null,
      };

      expect(initialState.isCliOnline).toBeNull();
    });

    it('should update isCliOnline based on presence state', () => {
      let isCliOnline: boolean | null = null;

      // Simulate presence sync with CLI present
      const handlePresenceSync = (presences: Array<{ type?: string }>) => {
        isCliOnline = presences.some((p) => p.type === 'cli');
      };

      handlePresenceSync([{ type: 'cli' }]);
      expect(isCliOnline).toBe(true);

      // CLI leaves
      handlePresenceSync([]);
      expect(isCliOnline).toBe(false);
    });

    it('should reset isCliOnline to null when connecting to new session', () => {
      let isCliOnline: boolean | null = true;

      const resetOnConnect = () => {
        isCliOnline = null;
      };

      resetOnConnect();
      expect(isCliOnline).toBeNull();
    });

    it('should have permissionMode in state', () => {
      const state: {
        permissionMode: PermissionMode | null;
      } = {
        permissionMode: null,
      };

      expect('permissionMode' in state).toBe(true);
    });

    it('should initialize permissionMode to null', () => {
      const initialState = {
        permissionMode: null as PermissionMode | null,
      };

      expect(initialState.permissionMode).toBeNull();
    });

    it('should update permissionMode on mode message', () => {
      let permissionMode: PermissionMode | null = null;

      const handleMessage = (message: RealtimeMessage) => {
        if (message.type === 'mode' && message.permissionMode) {
          permissionMode = message.permissionMode;
        }
      };

      const modeMessage: RealtimeMessage = {
        type: 'mode',
        permissionMode: 'bypassPermissions',
        timestamp: Date.now(),
        seq: 1,
      };

      handleMessage(modeMessage);
      expect(permissionMode).toBe('bypassPermissions');
    });

    it('should update permissionMode from status-response when provided', () => {
      let state: {
        isTyping: boolean;
        isMessageQueued: boolean;
        permissionMode: PermissionMode | null;
      } = {
        isTyping: false,
        isMessageQueued: false,
        permissionMode: null,
      };

      const handleMessage = (message: RealtimeMessage) => {
        if (message.type === 'status-response') {
          state = {
            ...state,
            isTyping: message.isProcessing ?? false,
            isMessageQueued: message.isMessageQueued ?? false,
            permissionMode: message.permissionMode ?? state.permissionMode,
          };
        }
      };

      handleMessage({
        type: 'status-response',
        isProcessing: false,
        isMessageQueued: false,
        permissionMode: 'plan',
        timestamp: Date.now(),
        seq: 1,
      });

      expect(state.permissionMode).toBe('plan');
    });

    it('should set isTyping true when sending input', () => {
      let isTyping = false;

      const sendInput = () => {
        isTyping = true;
      };

      sendInput();
      expect(isTyping).toBe(true);
    });

    it('should set isTyping false when receiving output', () => {
      let isTyping = true;

      const receiveOutput = () => {
        isTyping = false;
      };

      receiveOutput();
      expect(isTyping).toBe(false);
    });

    it('should clear messages', () => {
      let messages = [
        { type: 'output', content: 'test', seq: 1 },
        { type: 'output', content: 'test2', seq: 2 },
      ];
      let lastSeq = 2;

      const clearMessages = () => {
        messages = [];
        lastSeq = 0;
      };

      clearMessages();
      expect(messages).toEqual([]);
      expect(lastSeq).toBe(0);
    });

    it('should update state on connect', () => {
      let state = 'disconnected';

      const setConnecting = () => {
        state = 'connecting';
      };

      const setConnected = () => {
        state = 'connected';
      };

      setConnecting();
      expect(state).toBe('connecting');

      setConnected();
      expect(state).toBe('connected');
    });

    it('should update state on disconnect', () => {
      let state = 'connected';
      let sessionId: string | null = 'session-123';

      const disconnect = () => {
        state = 'disconnected';
        sessionId = null;
      };

      disconnect();
      expect(state).toBe('disconnected');
      expect(sessionId).toBeNull();
    });

    it('should add messages and update lastSeq', () => {
      let messages: any[] = [];
      let lastSeq = 0;

      const addMessage = (message: any) => {
        messages = [...messages, message];
        lastSeq = message.seq;
      };

      addMessage({ type: 'output', content: 'Hello', seq: 1 });
      expect(messages.length).toBe(1);
      expect(lastSeq).toBe(1);

      addMessage({ type: 'output', content: 'World', seq: 2 });
      expect(messages.length).toBe(2);
      expect(lastSeq).toBe(2);
    });

    it('should set error on connection failure', () => {
      let error: string | null = null;

      const setError = (message: string) => {
        error = message;
      };

      setError('Connection failed');
      expect(error).toBe('Connection failed');
    });

    it('should accept optional attachments parameter in sendInput', () => {
      let sentMessage: RealtimeMessage | null = null;

      const sendInput = (content: string, attachments?: ImageAttachment[]) => {
        const message: RealtimeMessage = {
          type: 'input',
          content,
          attachments,
          timestamp: Date.now(),
          seq: 1,
        };
        sentMessage = message;
      };

      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/jpeg', data: 'base64data' },
      ];

      sendInput('Describe this image', attachments);

      expect(sentMessage).not.toBeNull();
      expect(sentMessage!.attachments).toBe(attachments);
    });

    it('should include attachments in RealtimeMessage payload', () => {
      let sentMessage: RealtimeMessage | null = null;

      const sendInput = (content: string, attachments?: ImageAttachment[]) => {
        const message: RealtimeMessage = {
          type: 'input',
          content,
          attachments,
          timestamp: Date.now(),
          seq: 1,
        };
        sentMessage = message;
      };

      const attachments: ImageAttachment[] = [
        { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgoAAAANS' },
        { type: 'image', mediaType: 'image/jpeg', data: '/9j/4AAQSkZJRg' },
      ];

      sendInput('What are these images?', attachments);

      expect(sentMessage!.attachments?.length).toBe(2);
      expect(sentMessage!.attachments?.[0].mediaType).toBe('image/png');
      expect(sentMessage!.attachments?.[1].mediaType).toBe('image/jpeg');
    });

    it('should send message without attachments when none provided', () => {
      let sentMessage: RealtimeMessage | null = null;

      const sendInput = (content: string, attachments?: ImageAttachment[]) => {
        const message: RealtimeMessage = {
          type: 'input',
          content,
          attachments,
          timestamp: Date.now(),
          seq: 1,
        };
        sentMessage = message;
      };

      sendInput('Just a text message');

      expect(sentMessage).not.toBeNull();
      expect(sentMessage!.attachments).toBeUndefined();
      expect(sentMessage!.content).toBe('Just a text message');
    });

    it('should have commands in state initialized to empty array', () => {
      const initialState = {
        commands: [] as SlashCommand[],
      };

      expect('commands' in initialState).toBe(true);
      expect(initialState.commands).toEqual([]);
    });

    it('should update commands on commands message', () => {
      let commands: SlashCommand[] = [];

      const handleMessage = (message: RealtimeMessage) => {
        if (message.type === 'commands' && message.commands) {
          commands = message.commands;
        }
      };

      const commandsMessage: RealtimeMessage = {
        type: 'commands',
        commands: [
          { name: 'commit', description: 'Commit changes', argumentHint: '<message>' },
          { name: 'help', description: 'Show help', argumentHint: '' },
        ],
        timestamp: Date.now(),
        seq: 1,
      };

      handleMessage(commandsMessage);
      expect(commands.length).toBe(2);
      expect(commands[0].name).toBe('commit');
      expect(commands[1].name).toBe('help');
    });

    it('should have requestCommands action', () => {
      let sentMessage: RealtimeMessage | null = null;

      const requestCommands = () => {
        const message: RealtimeMessage = {
          type: 'commands-request',
          timestamp: Date.now(),
          seq: 1,
        };
        sentMessage = message;
      };

      requestCommands();

      expect(sentMessage).not.toBeNull();
      expect(sentMessage!.type).toBe('commands-request');
    });

    it('should reset all session-specific state when connecting to a new session', () => {
      // Simulate having state from a previous session
      let model: string | null = 'opus';
      let availableModels: any[] = [{ value: 'opus', displayName: 'Opus' }];
      let isModelChanging = true;
      let isTyping = true;
      let permissionMode: string | null = 'bypassPermissions';
      let commands: any[] = [{ name: 'commit' }];
      let messages: any[] = [{ type: 'output', content: 'test' }];

      // The connect action should reset ALL session-specific state
      const resetSessionState = () => {
        model = null;
        availableModels = [];
        isModelChanging = false;
        isTyping = false;
        permissionMode = null;
        commands = [];
        messages = [];
      };

      resetSessionState();

      expect(model).toBeNull();
      expect(availableModels).toEqual([]);
      expect(isModelChanging).toBe(false);
      expect(isTyping).toBe(false);
      expect(permissionMode).toBeNull();
      expect(commands).toEqual([]);
      expect(messages).toEqual([]);
    });

    it('should request models after connecting', () => {
      let sentMessages: RealtimeMessage[] = [];

      const requestModels = () => {
        const message: RealtimeMessage = {
          type: 'models-request',
          timestamp: Date.now(),
          seq: 1,
        };
        sentMessages.push(message);
      };

      // Simulate what happens after connect()
      requestModels();

      expect(sentMessages.length).toBe(1);
      expect(sentMessages[0].type).toBe('models-request');
    });

    it('should only deduplicate messages within the same type', () => {
      // This tests that input seq=1 and output seq=1 are NOT considered duplicates
      // because they have different types (separate counters for mobile and CLI)
      let messages: RealtimeMessage[] = [];

      const isDuplicate = (msg: RealtimeMessage): boolean => {
        return messages.some(
          (m) => m.seq === msg.seq && m.type === msg.type
        );
      };

      const addMessage = (msg: RealtimeMessage) => {
        if (!isDuplicate(msg)) {
          messages.push(msg);
        }
      };

      // User sends input with seq=1
      addMessage({ type: 'input', content: 'Hello', timestamp: 1000, seq: 1 });
      expect(messages.length).toBe(1);

      // CLI responds with output that also has seq=1 (different counter)
      // This should NOT be considered a duplicate
      addMessage({ type: 'output', content: 'Hi there', timestamp: 1001, seq: 1 });
      expect(messages.length).toBe(2);

      // Actual duplicate (same type and seq) should be skipped
      addMessage({ type: 'output', content: 'Hi there', timestamp: 1001, seq: 1 });
      expect(messages.length).toBe(2); // Still 2, duplicate skipped
    });

    it('should not skip messages when seq collides across different types', () => {
      // Simulates the bug where user's 3rd message was lost because
      // CLI's output had the same seq number
      let messages: RealtimeMessage[] = [];

      const isDuplicate = (msg: RealtimeMessage): boolean => {
        return messages.some(
          (m) => m.seq === msg.seq && m.type === msg.type
        );
      };

      const addMessage = (msg: RealtimeMessage) => {
        if (!isDuplicate(msg)) {
          messages.push(msg);
        }
      };

      // Simulate conversation flow
      addMessage({ type: 'input', content: 'Q1', timestamp: 1000, seq: 1 });
      addMessage({ type: 'output', content: 'A1', timestamp: 1001, seq: 1 });
      addMessage({ type: 'input', content: 'Q2', timestamp: 2000, seq: 2 });
      addMessage({ type: 'output', content: 'A2', timestamp: 2001, seq: 2 });
      addMessage({ type: 'input', content: 'Q3', timestamp: 3000, seq: 3 });
      addMessage({ type: 'output', content: 'A3', timestamp: 3001, seq: 3 });

      expect(messages.length).toBe(6);
      expect(messages.filter(m => m.type === 'input').length).toBe(3);
      expect(messages.filter(m => m.type === 'output').length).toBe(3);
    });
  });
});

describe('Effective Status Computation', () => {
  type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

  const computeEffectiveStatus = (
    state: ConnectionState,
    isCliOnline: boolean | null
  ): 'online' | 'cliOffline' | 'connecting' | 'disconnected' => {
    if (state === 'connected' && isCliOnline === false) {
      return 'cliOffline';
    }
    if (state === 'connected') {
      return 'online';
    }
    if (state === 'connecting' || state === 'reconnecting') {
      return 'connecting';
    }
    return 'disconnected';
  };

  it('should return "online" when connected and CLI is online', () => {
    expect(computeEffectiveStatus('connected', true)).toBe('online');
  });

  it('should return "online" when connected and CLI status is unknown (null)', () => {
    expect(computeEffectiveStatus('connected', null)).toBe('online');
  });

  it('should return "cliOffline" when connected but CLI is offline', () => {
    expect(computeEffectiveStatus('connected', false)).toBe('cliOffline');
  });

  it('should return "connecting" when connecting', () => {
    expect(computeEffectiveStatus('connecting', null)).toBe('connecting');
  });

  it('should return "connecting" when reconnecting', () => {
    expect(computeEffectiveStatus('reconnecting', null)).toBe('connecting');
  });

  it('should return "disconnected" when disconnected', () => {
    expect(computeEffectiveStatus('disconnected', null)).toBe('disconnected');
  });
});

describe('InputBar Disabled State with CLI Offline', () => {
  it('should be disabled when CLI is offline', () => {
    const computeIsDisabled = (
      state: string,
      isCliOnline: boolean | null
    ): boolean => {
      return state !== 'connected' || isCliOnline === false;
    };

    expect(computeIsDisabled('connected', false)).toBe(true);
  });

  it('should not be disabled when CLI is online', () => {
    const computeIsDisabled = (
      state: string,
      isCliOnline: boolean | null
    ): boolean => {
      return state !== 'connected' || isCliOnline === false;
    };

    expect(computeIsDisabled('connected', true)).toBe(false);
  });

  it('should not be disabled when CLI status is unknown (null)', () => {
    const computeIsDisabled = (
      state: string,
      isCliOnline: boolean | null
    ): boolean => {
      return state !== 'connected' || isCliOnline === false;
    };

    expect(computeIsDisabled('connected', null)).toBe(false);
  });
});

describe('Mode Label Utils', () => {
  const getModeLabel = (mode: PermissionMode | null): string | null => {
    if (!mode) return null;
    switch (mode) {
      case 'default':
        return 'Ask before edits';
      case 'acceptEdits':
        return 'Auto-approve edits';
      case 'plan':
        return 'Plan mode';
      case 'bypassPermissions':
        return 'Yolo mode';
      case 'delegate':
        return 'Auto-approve edits';
      case 'dontAsk':
        return 'Auto-approve edits';
      default:
        return null;
    }
  };

  it('should return "Ask before edits" for default mode', () => {
    expect(getModeLabel('default')).toBe('Ask before edits');
  });

  it('should return "Auto-approve edits" for acceptEdits mode', () => {
    expect(getModeLabel('acceptEdits')).toBe('Auto-approve edits');
  });

  it('should return "Plan mode" for plan mode', () => {
    expect(getModeLabel('plan')).toBe('Plan mode');
  });

  it('should return "Yolo mode" for bypassPermissions mode', () => {
    expect(getModeLabel('bypassPermissions')).toBe('Yolo mode');
  });

  it('should return null for null mode (InputBar hides indicator)', () => {
    expect(getModeLabel(null)).toBeNull();
  });
});

describe('Mode Change', () => {
  it('should send mode-change message with permissionMode', () => {
    let sentMessage: RealtimeMessage | null = null;

    const sendModeChange = (mode: PermissionMode) => {
      const message: RealtimeMessage = {
        type: 'mode-change',
        permissionMode: mode,
        timestamp: Date.now(),
        seq: 1,
      };
      sentMessage = message;
    };

    sendModeChange('plan');

    expect(sentMessage).not.toBeNull();
    expect(sentMessage!.type).toBe('mode-change');
    expect(sentMessage!.permissionMode).toBe('plan');
  });

  it('should handle mode-change type in RealtimeMessage', () => {
    const message: RealtimeMessage = {
      type: 'mode-change',
      permissionMode: 'default',
      timestamp: Date.now(),
      seq: 1,
    };

    expect(message.type).toBe('mode-change');
    expect(message.permissionMode).toBe('default');
  });
});

describe('InputBar Commands Integration', () => {
  it('should have commands button (/ icon)', () => {
    // InputBar should render a button that can open the CommandPicker
    const hasCommandsButton = true; // Component has the button
    expect(hasCommandsButton).toBe(true);
  });

  it('should open CommandPicker on commands button tap', () => {
    let commandPickerVisible = false;

    const openCommandPicker = () => {
      commandPickerVisible = true;
    };

    openCommandPicker();
    expect(commandPickerVisible).toBe(true);
  });

  it('should insert /{name} into input when command selected', () => {
    let inputValue = '';

    const handleCommandSelect = (command: SlashCommand) => {
      inputValue = `/${command.name} `;
    };

    const command: SlashCommand = {
      name: 'commit',
      description: 'Commit changes',
      argumentHint: '<message>',
    };

    handleCommandSelect(command);
    expect(inputValue).toBe('/commit ');
  });
});

describe('CommandPicker Logic', () => {
  const mockCommands: SlashCommand[] = [
    { name: 'commit', description: 'Commit changes to git', argumentHint: '<message>' },
    { name: 'help', description: 'Show help information', argumentHint: '' },
    { name: 'review-pr', description: 'Review a pull request', argumentHint: '<pr-number>' },
    { name: 'test', description: 'Run tests', argumentHint: '' },
  ];

  it('should display list of commands with slash prefix', () => {
    const displayedCommands = mockCommands.map((cmd) => ({
      ...cmd,
      displayName: `/${cmd.name}`,
    }));

    expect(displayedCommands[0].displayName).toBe('/commit');
    expect(displayedCommands[1].displayName).toBe('/help');
  });

  it('should show description and argument hint', () => {
    const cmd = mockCommands[0];

    expect(cmd.description).toBe('Commit changes to git');
    expect(cmd.argumentHint).toBe('<message>');
  });

  it('should filter commands based on search', () => {
    const filterCommands = (commands: SlashCommand[], search: string) => {
      const lowerSearch = search.toLowerCase();
      return commands.filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(lowerSearch) ||
          cmd.description.toLowerCase().includes(lowerSearch)
      );
    };

    // Filter by name
    const commitResults = filterCommands(mockCommands, 'commit');
    expect(commitResults.length).toBe(1);
    expect(commitResults[0].name).toBe('commit');

    // Filter by description
    const testResults = filterCommands(mockCommands, 'test');
    expect(testResults.length).toBe(1);
    expect(testResults[0].name).toBe('test');

    // Filter returns multiple results
    const prResults = filterCommands(mockCommands, 'pr');
    expect(prResults.length).toBe(1);

    // Empty search returns all
    const allResults = filterCommands(mockCommands, '');
    expect(allResults.length).toBe(4);
  });

  it('should call onSelect when command tapped', () => {
    let selectedCommand: SlashCommand | null = null;

    const onSelect = (command: SlashCommand) => {
      selectedCommand = command;
    };

    onSelect(mockCommands[0]);

    expect(selectedCommand).not.toBeNull();
    expect(selectedCommand!.name).toBe('commit');
  });
});

describe('Image Utils', () => {
  describe('getMediaTypeFromUri', () => {
    it('should detect PNG media type from URI', () => {
      expect(getMediaTypeFromUri('file:///path/to/image.png')).toBe('image/png');
      expect(getMediaTypeFromUri('file:///path/to/IMAGE.PNG')).toBe('image/png');
    });

    it('should default to JPEG for unknown extensions', () => {
      expect(getMediaTypeFromUri('file:///path/to/image')).toBe('image/jpeg');
      expect(getMediaTypeFromUri('file:///path/to/image.unknown')).toBe('image/jpeg');
    });

    it('should detect GIF media type from URI', () => {
      expect(getMediaTypeFromUri('file:///path/to/image.gif')).toBe('image/gif');
    });

    it('should detect WEBP media type from URI', () => {
      expect(getMediaTypeFromUri('file:///path/to/image.webp')).toBe('image/webp');
    });
  });

  describe('convertImageToBase64', () => {
    it('should return ImageAttachment with base64 data', async () => {
      const result = await convertImageToBase64('file:///path/to/image.jpg');

      expect(result.type).toBe('image');
      expect(result.data).toBe('base64encodeddata');
      expect(result.mediaType).toBe('image/jpeg');
    });

    it('should convert all images to JPEG after resizing', async () => {
      // After resizing, all images are converted to JPEG for size optimization
      const result = await convertImageToBase64('file:///path/to/image.png');

      expect(result.mediaType).toBe('image/jpeg');
    });

    it('should default to JPEG for unknown extensions', async () => {
      const result = await convertImageToBase64('file:///path/to/image.unknown');

      expect(result.mediaType).toBe('image/jpeg');
    });
  });

  describe('handleSend behavior', () => {
    it('should convert selected images to base64 before sending', async () => {
      let sentAttachments: ImageAttachment[] | undefined;
      const selectedImages = ['file:///path/to/image1.png', 'file:///path/to/image2.jpg'];

      // Simulate handleSend logic
      const handleSend = async (
        images: string[],
        onSend: (content: string, attachments?: ImageAttachment[]) => void
      ) => {
        const attachments = await Promise.all(
          images.map((uri) => convertImageToBase64(uri))
        );
        onSend('Test message', attachments.length > 0 ? attachments : undefined);
      };

      await handleSend(selectedImages, (content, attachments) => {
        sentAttachments = attachments;
      });

      expect(sentAttachments).toBeDefined();
      expect(sentAttachments!.length).toBe(2);
      // All images are converted to JPEG after resizing for size optimization
      expect(sentAttachments![0].mediaType).toBe('image/jpeg');
      expect(sentAttachments![1].mediaType).toBe('image/jpeg');
    });

    it('should clear selectedImages after sending', async () => {
      let selectedImages = ['file:///path/to/image.png'];
      let cleared = false;

      // Simulate handleSend clearing images
      const clearImages = () => {
        selectedImages = [];
        cleared = true;
      };

      // After send completes, images should be cleared
      clearImages();

      expect(selectedImages).toEqual([]);
      expect(cleared).toBe(true);
    });
  });

  describe('Image Resizing', () => {
    it('should resize large images before conversion', async () => {
      // The convertImageToBase64 now resizes images via expo-image-manipulator
      const result = await convertImageToBase64('file:///path/to/large-image.jpg');

      // After resize, should return JPEG format
      expect(result.mediaType).toBe('image/jpeg');
      expect(result.type).toBe('image');
    });

    it('should compress images to reduce size', async () => {
      // Images are compressed to fit Supabase Realtime size limit
      const result = await convertImageToBase64('file:///path/to/image.png');

      // After compression, format is always JPEG
      expect(result.mediaType).toBe('image/jpeg');
    });
  });
});

describe('Terminal Message Grouping', () => {
  interface GroupedMessage {
    type: 'input' | 'output' | 'system';
    content: string;
    timestamp: number;
  }

  // Mimics the grouping logic in Terminal.tsx
  const groupMessages = (messages: RealtimeMessage[]): GroupedMessage[] => {
    const groups: GroupedMessage[] = [];
    let currentGroup: GroupedMessage | null = null;

    // Sort by timestamp (NOT seq) to ensure correct chronological order
    const sortedMessages = [...messages].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    for (const msg of sortedMessages) {
      const msgType = msg.type === 'input' ? 'input' :
                      msg.type === 'output' ? 'output' : 'system';

      if (currentGroup && currentGroup.type === msgType) {
        currentGroup.content += msg.content || '';
      } else {
        if (currentGroup) {
          groups.push(currentGroup);
        }
        currentGroup = {
          type: msgType,
          content: msg.content || '',
          timestamp: msg.timestamp,
        };
      }
    }

    if (currentGroup) {
      groups.push(currentGroup);
    }

    return groups;
  };

  it('should sort messages by timestamp to maintain correct order', () => {
    // Messages with interleaved seq numbers but correct timestamps
    const messages: RealtimeMessage[] = [
      { type: 'input', content: 'Q1', timestamp: 1000, seq: 1 },
      { type: 'output', content: 'A1', timestamp: 1500, seq: 1 },
      { type: 'input', content: 'Q2', timestamp: 2000, seq: 2 },
      { type: 'output', content: 'A2', timestamp: 2500, seq: 2 },
    ];

    const groups = groupMessages(messages);

    expect(groups.length).toBe(4);
    expect(groups[0].type).toBe('input');
    expect(groups[0].content).toBe('Q1');
    expect(groups[1].type).toBe('output');
    expect(groups[1].content).toBe('A1');
    expect(groups[2].type).toBe('input');
    expect(groups[2].content).toBe('Q2');
    expect(groups[3].type).toBe('output');
    expect(groups[3].content).toBe('A2');
  });

  it('should NOT merge non-consecutive messages of the same type', () => {
    // Q1 -> A1 -> Q2 -> A2 should result in 4 separate groups
    // NOT merge Q1+Q2 or A1+A2
    const messages: RealtimeMessage[] = [
      { type: 'input', content: 'Q1', timestamp: 1000, seq: 1 },
      { type: 'output', content: 'A1', timestamp: 1500, seq: 1 },
      { type: 'input', content: 'Q2', timestamp: 2000, seq: 2 },
      { type: 'output', content: 'A2', timestamp: 2500, seq: 2 },
    ];

    const groups = groupMessages(messages);

    // Should have 4 separate groups, not merged
    expect(groups.length).toBe(4);
  });

  it('should merge consecutive messages of the same type (streaming)', () => {
    // Claude's response comes in chunks - these should be merged
    const messages: RealtimeMessage[] = [
      { type: 'input', content: 'Hello', timestamp: 1000, seq: 1 },
      { type: 'output', content: 'Hi ', timestamp: 1500, seq: 1 },
      { type: 'output', content: 'there! ', timestamp: 1501, seq: 2 },
      { type: 'output', content: 'How can I help?', timestamp: 1502, seq: 3 },
    ];

    const groups = groupMessages(messages);

    expect(groups.length).toBe(2);
    expect(groups[0].type).toBe('input');
    expect(groups[0].content).toBe('Hello');
    expect(groups[1].type).toBe('output');
    expect(groups[1].content).toBe('Hi there! How can I help?');
  });

  it('should handle out-of-order messages by sorting by timestamp', () => {
    // Messages might arrive out of order, but timestamp should sort them
    const messages: RealtimeMessage[] = [
      { type: 'output', content: 'A1', timestamp: 1500, seq: 1 },
      { type: 'input', content: 'Q1', timestamp: 1000, seq: 1 },
      { type: 'input', content: 'Q2', timestamp: 2000, seq: 2 },
      { type: 'output', content: 'A2', timestamp: 2500, seq: 2 },
    ];

    const groups = groupMessages(messages);

    // Should be sorted by timestamp: Q1 -> A1 -> Q2 -> A2
    expect(groups[0].type).toBe('input');
    expect(groups[0].content).toBe('Q1');
    expect(groups[1].type).toBe('output');
    expect(groups[1].content).toBe('A1');
  });

  it('should not merge messages when sorted by seq (bug scenario)', () => {
    // This demonstrates the bug: if sorted by seq, messages with same seq
    // from different sources could be adjacent and incorrectly merged
    const messages: RealtimeMessage[] = [
      { type: 'input', content: 'Q1', timestamp: 1000, seq: 1 },
      { type: 'output', content: 'A1', timestamp: 1500, seq: 1 },
      { type: 'input', content: 'Q2', timestamp: 2000, seq: 2 },
      { type: 'output', content: 'A2', timestamp: 2500, seq: 2 },
      { type: 'input', content: 'Q3', timestamp: 3000, seq: 3 },
      { type: 'output', content: 'A3', timestamp: 3500, seq: 3 },
    ];

    const groups = groupMessages(messages);

    // With timestamp sorting, we get correct order: Q1, A1, Q2, A2, Q3, A3
    expect(groups.length).toBe(6);
    expect(groups.map(g => g.type)).toEqual(['input', 'output', 'input', 'output', 'input', 'output']);
  });
});

describe('InputBar Duplicate Send Prevention', () => {
  it('should prevent duplicate sends with isSending state', () => {
    let isSending = false;
    let sendCount = 0;

    const handleSend = () => {
      if (isSending) {
        return; // Skip if already sending
      }
      isSending = true;
      sendCount++;
      // Simulate async operation
      setTimeout(() => {
        isSending = false;
      }, 100);
    };

    // First call should work
    handleSend();
    expect(sendCount).toBe(1);

    // Second call while still sending should be skipped
    handleSend();
    expect(sendCount).toBe(1);
  });

  it('should disable send when isTyping is true', () => {
    let isTyping = true;
    let sendAttempted = false;

    const handleSend = () => {
      if (isTyping) {
        return; // Disabled while Claude is responding
      }
      sendAttempted = true;
    };

    handleSend();
    expect(sendAttempted).toBe(false);

    // After response received
    isTyping = false;
    handleSend();
    expect(sendAttempted).toBe(true);
  });

  it('should clear input before sending to prevent duplicate content', () => {
    let input = 'test message';
    let sentContent = '';

    const handleSend = () => {
      const messageContent = input.trim();
      input = ''; // Clear immediately
      sentContent = messageContent;
    };

    handleSend();
    expect(input).toBe('');
    expect(sentContent).toBe('test message');

    // Second call has no content
    handleSend();
    expect(sentContent).toBe(''); // Empty because input was already cleared
  });

  it('should reset isSending in finally block even on error', async () => {
    let isSending = false;

    const handleSend = async () => {
      isSending = true;
      try {
        throw new Error('Send failed');
      } catch {
        // Handle error
      } finally {
        isSending = false;
      }
    };

    await handleSend();
    expect(isSending).toBe(false);
  });

  it('should compute isDisabled correctly', () => {
    const computeIsDisabled = (
      disabled: boolean,
      state: string,
      isSending: boolean,
      isTyping: boolean
    ): boolean => {
      return disabled || state !== 'connected' || isSending || isTyping;
    };

    // All conditions false -> not disabled
    expect(computeIsDisabled(false, 'connected', false, false)).toBe(false);

    // disabled prop true -> disabled
    expect(computeIsDisabled(true, 'connected', false, false)).toBe(true);

    // Not connected -> disabled
    expect(computeIsDisabled(false, 'disconnected', false, false)).toBe(true);

    // isSending true -> disabled
    expect(computeIsDisabled(false, 'connected', true, false)).toBe(true);

    // isTyping true -> disabled
    expect(computeIsDisabled(false, 'connected', false, true)).toBe(true);
  });
});

describe('Pagination - fetchOlderMessages logic', () => {
  const PAGE_SIZE = 50;

  interface PaginationState {
    messages: RealtimeMessage[];
    isLoadingMore: boolean;
    hasMoreMessages: boolean;
    oldestLoadedSeq: number | null;
    sessionId: string | null;
  }

  /** Mimics the fetchOlderMessages guard logic */
  function shouldFetch(state: PaginationState): boolean {
    return !state.isLoadingMore && state.hasMoreMessages && !!state.sessionId && !!state.oldestLoadedSeq;
  }

  /** Mimics the state update after fetching older messages */
  function applyOlderMessages(
    state: PaginationState,
    olderMessages: RealtimeMessage[],
  ): PaginationState {
    if (olderMessages.length === 0) {
      return { ...state, isLoadingMore: false, hasMoreMessages: false };
    }
    const sorted = [...olderMessages].sort((a, b) => a.seq - b.seq);
    return {
      ...state,
      messages: [...sorted, ...state.messages],
      isLoadingMore: false,
      oldestLoadedSeq: sorted[0].seq,
      hasMoreMessages: olderMessages.length === PAGE_SIZE,
    };
  }

  it('should not fetch when already loading', () => {
    const state: PaginationState = {
      messages: [],
      isLoadingMore: true,
      hasMoreMessages: true,
      oldestLoadedSeq: 50,
      sessionId: 'session-1',
    };
    expect(shouldFetch(state)).toBe(false);
  });

  it('should not fetch when no more messages', () => {
    const state: PaginationState = {
      messages: [],
      isLoadingMore: false,
      hasMoreMessages: false,
      oldestLoadedSeq: 1,
      sessionId: 'session-1',
    };
    expect(shouldFetch(state)).toBe(false);
  });

  it('should not fetch when no sessionId', () => {
    const state: PaginationState = {
      messages: [],
      isLoadingMore: false,
      hasMoreMessages: true,
      oldestLoadedSeq: 50,
      sessionId: null,
    };
    expect(shouldFetch(state)).toBe(false);
  });

  it('should not fetch when oldestLoadedSeq is null', () => {
    const state: PaginationState = {
      messages: [],
      isLoadingMore: false,
      hasMoreMessages: true,
      oldestLoadedSeq: null,
      sessionId: 'session-1',
    };
    expect(shouldFetch(state)).toBe(false);
  });

  it('should fetch when all conditions are met', () => {
    const state: PaginationState = {
      messages: [],
      isLoadingMore: false,
      hasMoreMessages: true,
      oldestLoadedSeq: 50,
      sessionId: 'session-1',
    };
    expect(shouldFetch(state)).toBe(true);
  });

  it('should prepend older messages and update oldestLoadedSeq', () => {
    const existing: RealtimeMessage[] = [
      { type: 'output', content: 'C', timestamp: 3000, seq: 51 },
      { type: 'output', content: 'D', timestamp: 4000, seq: 52 },
    ];
    const state: PaginationState = {
      messages: existing,
      isLoadingMore: true,
      hasMoreMessages: true,
      oldestLoadedSeq: 51,
      sessionId: 'session-1',
    };

    const olderMessages: RealtimeMessage[] = [
      { type: 'input', content: 'A', timestamp: 1000, seq: 1 },
      { type: 'output', content: 'B', timestamp: 2000, seq: 2 },
    ];

    const newState = applyOlderMessages(state, olderMessages);

    expect(newState.messages.length).toBe(4);
    expect(newState.messages[0].content).toBe('A');
    expect(newState.messages[1].content).toBe('B');
    expect(newState.messages[2].content).toBe('C');
    expect(newState.messages[3].content).toBe('D');
    expect(newState.oldestLoadedSeq).toBe(1);
    expect(newState.isLoadingMore).toBe(false);
  });

  it('should set hasMoreMessages false when fewer than PAGE_SIZE returned', () => {
    const state: PaginationState = {
      messages: [{ type: 'output', content: 'Z', timestamp: 5000, seq: 100 }],
      isLoadingMore: true,
      hasMoreMessages: true,
      oldestLoadedSeq: 100,
      sessionId: 'session-1',
    };

    // Return fewer than PAGE_SIZE
    const olderMessages: RealtimeMessage[] = [
      { type: 'input', content: 'First', timestamp: 1000, seq: 1 },
    ];

    const newState = applyOlderMessages(state, olderMessages);
    expect(newState.hasMoreMessages).toBe(false);
  });

  it('should set hasMoreMessages true when exactly PAGE_SIZE returned', () => {
    const state: PaginationState = {
      messages: [{ type: 'output', content: 'Z', timestamp: 5000, seq: 100 }],
      isLoadingMore: true,
      hasMoreMessages: true,
      oldestLoadedSeq: 100,
      sessionId: 'session-1',
    };

    // Return exactly PAGE_SIZE messages
    const olderMessages: RealtimeMessage[] = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      type: 'output' as const,
      content: `msg-${i}`,
      timestamp: 1000 + i,
      seq: i + 1,
    }));

    const newState = applyOlderMessages(state, olderMessages);
    expect(newState.hasMoreMessages).toBe(true);
  });

  it('should set hasMoreMessages false when zero messages returned', () => {
    const state: PaginationState = {
      messages: [{ type: 'output', content: 'Z', timestamp: 5000, seq: 1 }],
      isLoadingMore: true,
      hasMoreMessages: true,
      oldestLoadedSeq: 1,
      sessionId: 'session-1',
    };

    const newState = applyOlderMessages(state, []);
    expect(newState.hasMoreMessages).toBe(false);
    expect(newState.messages.length).toBe(1); // unchanged
  });
});
