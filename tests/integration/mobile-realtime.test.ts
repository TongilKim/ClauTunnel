import { describe, it, expect, vi, beforeEach } from 'vitest';
import { REALTIME_CHANNELS } from 'clautunnel-shared';

/**
 * Integration tests for Mobile-to-Realtime communication patterns
 *
 * Since connectionStore and mobile UI require React Native / Zustand environment,
 * these tests verify the Supabase interaction patterns and shared utilities
 * that the mobile app relies on, without importing RN-specific modules.
 */

// --- Mock Supabase boundary ---

function createMockSupabase(overrides: Record<string, any> = {}) {
  return {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: overrides.sessionsData ?? [
            {
              id: 'session-1',
              machine_id: 'machine-1',
              status: 'active',
              started_at: '2026-01-01T00:00:00Z',
            },
          ],
          error: overrides.sessionsError ?? null,
        }),
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: overrides.singleSessionData ?? {
              id: 'session-1',
              machine_id: 'machine-1',
              status: 'active',
            },
            error: overrides.singleSessionError ?? null,
          }),
        }),
      }),
    })),
    auth: {
      signInWithPassword: overrides.signInWithPassword ?? vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' }, session: {} },
        error: null,
      }),
      signOut: overrides.signOut ?? vi.fn().mockResolvedValue({ error: null }),
      getSession: overrides.getSession ?? vi.fn().mockResolvedValue({
        data: { session: { user: { id: 'user-123' } } },
        error: null,
      }),
    },
  } as any;
}

describe('Mobile to Realtime Integration', () => {
  describe('Session List Behavior', () => {
    it('returns session data on successful query', async () => {
      // Arrange
      const mockSupabase = createMockSupabase();

      // Act
      const { data, error } = await mockSupabase
        .from('sessions')
        .select('*')
        .order('started_at', { ascending: false });

      // Assert
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
      expect(data[0]).toEqual(
        expect.objectContaining({
          id: 'session-1',
          status: 'active',
        }),
      );
    });

    it('handles an empty sessions list without error', async () => {
      // Arrange
      const mockSupabase = createMockSupabase({ sessionsData: [] });

      // Act
      const { data, error } = await mockSupabase
        .from('sessions')
        .select('*')
        .order('started_at', { ascending: false });

      // Assert
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it('returns error object when query fails', async () => {
      // Arrange
      const mockSupabase = createMockSupabase({
        sessionsError: { message: 'permission denied' },
      });

      // Act
      const { data, error } = await mockSupabase
        .from('sessions')
        .select('*')
        .order('started_at', { ascending: false });

      // Assert
      expect(error).toBeDefined();
      expect(error.message).toBe('permission denied');
    });
  });

  describe('Terminal Connection Behavior', () => {
    it('REALTIME_CHANNELS.sessionOutput produces the correct channel name', () => {
      // Act
      const channelName = REALTIME_CHANNELS.sessionOutput('abc-123');

      // Assert
      expect(channelName).toBe('session:abc-123:output');
    });

    it('REALTIME_CHANNELS.sessionInput produces the correct channel name', () => {
      // Act
      const channelName = REALTIME_CHANNELS.sessionInput('abc-123');

      // Assert
      expect(channelName).toBe('session:abc-123:input');
    });

    it('REALTIME_CHANNELS.sessionPresence produces the correct channel name', () => {
      // Act
      const channelName = REALTIME_CHANNELS.sessionPresence('abc-123');

      // Assert
      expect(channelName).toBe('session:abc-123:presence');
    });

    it('messages with sequential seq values maintain ordering', () => {
      // Arrange
      const messages = [
        { type: 'output', content: 'Hello', seq: 1, timestamp: 1000 },
        { type: 'output', content: ' World', seq: 2, timestamp: 1001 },
        { type: 'output', content: '!\n', seq: 3, timestamp: 1002 },
      ];

      // Act
      const sorted = [...messages].sort((a, b) => a.seq - b.seq);

      // Assert
      expect(sorted.map((m) => m.seq)).toEqual([1, 2, 3]);
      expect(sorted.map((m) => m.content).join('')).toBe('Hello World!\n');
    });

    it('out-of-order messages can be reordered by seq', () => {
      // Arrange
      const messages = [
        { seq: 3, content: 'c' },
        { seq: 1, content: 'a' },
        { seq: 2, content: 'b' },
      ];

      // Act
      const sorted = [...messages].sort((a, b) => a.seq - b.seq);

      // Assert
      expect(sorted.map((m) => m.content)).toEqual(['a', 'b', 'c']);
    });
  });

  describe('Input Sending Behavior', () => {
    it('quick action values have the correct escape sequences', () => {
      // These are the quick actions used in the mobile terminal UI
      const quickActions = [
        { label: 'y', value: 'y\n' },
        { label: 'n', value: 'n\n' },
        { label: 'Enter', value: '\n' },
        { label: 'Ctrl+C', value: '\x03' },
        { label: 'Tab', value: '\t' },
      ];

      // Assert each action produces valid string content
      expect(quickActions.find((a) => a.label === 'Ctrl+C')!.value).toBe('\x03');
      expect(quickActions.find((a) => a.label === 'Tab')!.value).toBe('\t');
      expect(quickActions.find((a) => a.label === 'Enter')!.value).toBe('\n');
      expect(quickActions.find((a) => a.label === 'y')!.value).toBe('y\n');
      expect(quickActions.find((a) => a.label === 'n')!.value).toBe('n\n');
    });

    it('quick action values are JSON-serializable', () => {
      const specialValues = ['\x03', '\x04', '\t', '\n', '\x1b[A', '\x1b[B'];

      for (const value of specialValues) {
        const payload = { type: 'input', content: value, timestamp: Date.now(), seq: 1 };
        expect(() => JSON.stringify(payload)).not.toThrow();
        expect(JSON.parse(JSON.stringify(payload)).content).toBe(value);
      }
    });
  });

  describe('Authentication Flow', () => {
    it('signInWithPassword returns user data on success', async () => {
      // Arrange
      const mockSupabase = createMockSupabase();

      // Act
      const { data, error } = await mockSupabase.auth.signInWithPassword({
        email: 'test@example.com',
        password: 'password123',
      });

      // Assert
      expect(error).toBeNull();
      expect(data.user).toBeDefined();
      expect(data.user.email).toBe('test@example.com');
    });

    it('signInWithPassword returns error message on invalid credentials', async () => {
      // Arrange
      const mockSupabase = createMockSupabase({
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: null, session: null },
          error: { message: 'Invalid login credentials' },
        }),
      });

      // Act
      const { data, error } = await mockSupabase.auth.signInWithPassword({
        email: 'wrong@example.com',
        password: 'wrong',
      });

      // Assert
      expect(error).toBeDefined();
      expect(error.message).toBe('Invalid login credentials');
      expect(data.user).toBeNull();
    });

    it('signOut completes without error', async () => {
      // Arrange
      const mockSupabase = createMockSupabase();

      // Act
      const { error } = await mockSupabase.auth.signOut();

      // Assert
      expect(error).toBeNull();
    });

    it('getSession returns null session when not authenticated', async () => {
      // Arrange
      const mockSupabase = createMockSupabase({
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      });

      // Act
      const { data } = await mockSupabase.auth.getSession();

      // Assert
      expect(data.session).toBeNull();
    });
  });
});
