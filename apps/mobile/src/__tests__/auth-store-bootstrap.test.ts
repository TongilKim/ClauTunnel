import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockRefreshSession = vi.fn();
const mockSetSession = vi.fn();
const mockInvoke = vi.fn();

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      refreshSession: mockRefreshSession,
      setSession: mockSetSession,
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signOut: vi.fn(),
    },
    functions: {
      invoke: mockInvoke,
    },
  },
}));

vi.mock('../utils/testMode', () => ({
  isTestMode: () => false,
  MOCK_TEST_CREDENTIALS: {
    email: 'test@clautunnel.com',
    password: 'password123',
  },
  MOCK_USER: {
    id: 'test-user-id',
    email: 'test@clautunnel.com',
  },
  MOCK_SESSION: {
    access_token: 'test-token',
    refresh_token: 'test-refresh',
    user: {
      id: 'test-user-id',
      email: 'test@clautunnel.com',
    },
  },
}));

describe('AuthStore bootstrap auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('claims a bootstrap code and signs in with the returned refresh token', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        accessToken: 'server-access-token',
        refreshToken: 'server-refresh-token',
      },
      error: null,
    });
    mockSetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          user: { id: 'user-1', email: 'user@example.com' },
        },
      },
      error: null,
    });

    const { useAuthStore } = await import('../stores/authStore');

    const success = await useAuthStore.getState().claimBootstrapCode('one-time-code');

    expect(success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('mobile-auth-bootstrap', {
      body: { action: 'claim', code: 'one-time-code' },
    });
    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'server-access-token',
      refresh_token: 'server-refresh-token',
    });
    expect(useAuthStore.getState().user?.email).toBe('user@example.com');
  });

  it('sets an error when bootstrap code claim fails', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'code expired' },
    });

    const { useAuthStore } = await import('../stores/authStore');

    const success = await useAuthStore.getState().claimBootstrapCode('expired-code');

    expect(success).toBe(false);
    expect(useAuthStore.getState().error).toBe('code expired');
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('replaces the auth listener when token sign-in runs again', async () => {
    const unsubscribeFirst = vi.fn();
    const unsubscribeSecond = vi.fn();

    mockOnAuthStateChange
      .mockReturnValueOnce({
        data: { subscription: { unsubscribe: unsubscribeFirst } },
      })
      .mockReturnValueOnce({
        data: { subscription: { unsubscribe: unsubscribeSecond } },
      });

    mockRefreshSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          user: { id: 'user-1', email: 'user@example.com' },
        },
      },
      error: null,
    });

    const { useAuthStore } = await import('../stores/authStore');

    await useAuthStore.getState().signInWithToken('first-refresh-token');
    await useAuthStore.getState().signInWithToken('second-refresh-token');

    expect(unsubscribeFirst).toHaveBeenCalledTimes(1);
    expect(unsubscribeSecond).not.toHaveBeenCalled();
    expect(mockOnAuthStateChange).toHaveBeenCalledTimes(2);
  });

  it('does not continue into refresh auth when bootstrap claim is aborted mid-flight', async () => {
    let resolveInvoke: ((value: unknown) => void) | null = null;
    mockInvoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveInvoke = resolve;
        })
    );

    const { useAuthStore } = await import('../stores/authStore');
    const controller = new AbortController();

    const pending = useAuthStore.getState().claimBootstrapCode('one-time-code', {
      signal: controller.signal,
    });
    controller.abort();
    resolveInvoke?.({
      data: {
        accessToken: 'server-access-token',
        refreshToken: 'server-refresh-token',
      },
      error: null,
    });

    await expect(pending).resolves.toBe(false);
    expect(mockSetSession).not.toHaveBeenCalled();
    expect(mockRefreshSession).not.toHaveBeenCalled();
    expect(useAuthStore.getState().error).toBeNull();
    expect(useAuthStore.getState().isLoading).toBe(false);
  });
});
