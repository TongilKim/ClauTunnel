import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const mockSetSession = vi.fn();
const mockSignOut = vi.fn();
const loggerInfo = vi.fn();
const loggerError = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      setSession: mockSetSession,
      signOut: mockSignOut,
    },
  })),
}));

vi.mock('../utils/logger.js', () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: loggerInfo,
    error: loggerError,
  })),
}));

const TEST_CONFIG_DIR = join(tmpdir(), `clautunnel-logout-test-${Date.now()}`);

vi.mock('../utils/config.js', async () => {
  const actual = await vi.importActual('../utils/config.js');
  return {
    ...actual,
    Config: class extends (actual as any).Config {
      constructor() {
        super(TEST_CONFIG_DIR);
      }
    },
  };
});

describe('logout command', () => {
  beforeEach(() => {
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';

    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }

    vi.clearAllMocks();
  });

  afterEach(() => {
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    vi.resetModules();
  });

  it('globally signs out the Supabase session before clearing local tokens', async () => {
    writeFileSync(
      join(TEST_CONFIG_DIR, 'config.json'),
      JSON.stringify({
        sessionTokens: {
          accessToken: 'stored-access-token',
          refreshToken: 'stored-refresh-token',
        },
      })
    );

    mockSetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'stored-access-token',
          refresh_token: 'stored-refresh-token',
        },
      },
      error: null,
    });
    mockSignOut.mockResolvedValue({ error: null });

    const { createLogoutCommand } = await import('../commands/logout.js');
    const command = createLogoutCommand();

    await command.parseAsync(['node', 'logout'], { from: 'user' });

    expect(mockSetSession).toHaveBeenCalledWith({
      access_token: 'stored-access-token',
      refresh_token: 'stored-refresh-token',
    });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'global' });

    const config = JSON.parse(readFileSync(join(TEST_CONFIG_DIR, 'config.json'), 'utf-8'));
    expect(config.sessionTokens).toBeUndefined();
    expect(loggerInfo).toHaveBeenCalledWith('Logged out successfully.');
  });
});
