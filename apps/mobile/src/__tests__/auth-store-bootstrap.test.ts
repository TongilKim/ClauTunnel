import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();
const mockRefreshSession = vi.fn();
const mockInvoke = vi.fn();

vi.mock('../services/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      refreshSession: mockRefreshSession,
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
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  it('claims a bootstrap code and signs in with the returned refresh token', async () => {
    mockInvoke.mockResolvedValue({
      data: { refreshToken: 'server-refresh-token' },
      error: null,
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

    const success = await useAuthStore.getState().claimBootstrapCode('one-time-code');

    expect(success).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith('mobile-auth-bootstrap', {
      body: { action: 'claim', code: 'one-time-code' },
    });
    expect(mockRefreshSession).toHaveBeenCalledWith({
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
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });
});
