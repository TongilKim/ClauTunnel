import { describe, it, expect, vi, beforeEach } from 'vitest';
import { restoreSession } from '../utils/supabase.js';

describe('restoreSession', () => {
  let mockSupabase: any;
  let mockConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      auth: {
        setSession: vi.fn(),
        getUser: vi.fn(),
      },
    };

    mockConfig = {
      getSessionTokens: vi.fn(),
      clearSessionTokens: vi.fn(),
    };
  });

  it('should return null when no session tokens are stored', async () => {
    mockConfig.getSessionTokens.mockReturnValue(null);

    const result = await restoreSession(mockSupabase, mockConfig);

    expect(result).toBeNull();
    expect(mockSupabase.auth.setSession).not.toHaveBeenCalled();
  });

  it('should return null and clear tokens when session is expired', async () => {
    mockConfig.getSessionTokens.mockReturnValue({
      accessToken: 'expired-token',
      refreshToken: 'expired-refresh',
    });
    mockSupabase.auth.setSession.mockResolvedValue({
      error: new Error('Session expired'),
    });

    const result = await restoreSession(mockSupabase, mockConfig);

    expect(result).toBeNull();
    expect(mockConfig.clearSessionTokens).toHaveBeenCalled();
  });

  it('should return null when getUser fails', async () => {
    mockConfig.getSessionTokens.mockReturnValue({
      accessToken: 'valid-token',
      refreshToken: 'valid-refresh',
    });
    mockSupabase.auth.setSession.mockResolvedValue({ error: null });
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Auth error'),
    });

    const result = await restoreSession(mockSupabase, mockConfig);

    expect(result).toBeNull();
  });

  it('should return user on successful session restoration', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' };

    mockConfig.getSessionTokens.mockReturnValue({
      accessToken: 'valid-token',
      refreshToken: 'valid-refresh',
    });
    mockSupabase.auth.setSession.mockResolvedValue({ error: null });
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    const result = await restoreSession(mockSupabase, mockConfig);

    expect(result).toEqual({ user: mockUser });
    expect(mockSupabase.auth.setSession).toHaveBeenCalledWith({
      access_token: 'valid-token',
      refresh_token: 'valid-refresh',
    });
  });
});
