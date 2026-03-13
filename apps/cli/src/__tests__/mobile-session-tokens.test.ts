import { describe, expect, it, vi } from 'vitest';
import { getMobileBootstrapTokens } from '../utils/supabase.js';

describe('getMobileBootstrapTokens', () => {
  it('prefers the current Supabase auth session over stored config tokens', async () => {
    const mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: {
            session: {
              access_token: 'fresh-access-token',
              refresh_token: 'fresh-refresh-token',
            },
          },
          error: null,
        }),
      },
    } as any;

    const mockConfig = {
      getSessionTokens: vi.fn().mockReturnValue({
        accessToken: 'stale-access-token',
        refreshToken: 'stale-refresh-token',
      }),
    };

    await expect(getMobileBootstrapTokens(mockSupabase, mockConfig)).resolves.toEqual({
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
    });
  });

  it('falls back to stored config tokens when the Supabase session is unavailable', async () => {
    const mockSupabase = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: null },
          error: null,
        }),
      },
    } as any;

    const mockConfig = {
      getSessionTokens: vi.fn().mockReturnValue({
        accessToken: 'stored-access-token',
        refreshToken: 'stored-refresh-token',
      }),
    };

    await expect(getMobileBootstrapTokens(mockSupabase, mockConfig)).resolves.toEqual({
      accessToken: 'stored-access-token',
      refreshToken: 'stored-refresh-token',
    });
  });
});
