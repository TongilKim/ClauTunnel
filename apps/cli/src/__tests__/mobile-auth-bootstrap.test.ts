import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();

describe('createMobileAuthBootstrap', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('creates a one-time mobile bootstrap code via the Edge Function', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        code: 'bootstrap-code-123',
        expiresAt: '2026-03-12T00:00:00.000Z',
      }),
    });

    const { createMobileAuthBootstrap } = await import('../utils/mobile-auth-bootstrap.js');

    const result = await createMobileAuthBootstrap({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'anon-key',
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://test.supabase.co/functions/v1/mobile-auth-bootstrap',
      {
        method: 'POST',
        headers: {
          apikey: 'anon-key',
          Authorization: 'Bearer anon-key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'create',
          accessToken: 'access-token',
          refreshToken: 'refresh-token',
        }),
      }
    );
    expect(result).toEqual({
      code: 'bootstrap-code-123',
      expiresAt: '2026-03-12T00:00:00.000Z',
    });
  });

  it('throws a readable error when bootstrap creation fails', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'bootstrap unavailable' }),
    });

    const { createMobileAuthBootstrap } = await import('../utils/mobile-auth-bootstrap.js');

    await expect(
      createMobileAuthBootstrap({
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'anon-key',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    ).rejects.toThrow('bootstrap unavailable');
  });
});
