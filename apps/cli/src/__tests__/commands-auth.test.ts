import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => ({
    onData: vi.fn(),
    onExit: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
  })),
}));

// Mock sleep-prevention to prevent prompt blocking in tests
vi.mock('../utils/sleep-prevention.js', () => ({
  promptYesNo: vi.fn().mockResolvedValue(false),
  enableSleepPrevention: vi.fn().mockReturnValue(false),
  disableSleepPrevention: vi.fn(),
  startCaffeinate: vi.fn().mockReturnValue({ on: vi.fn() }),
  stopCaffeinate: vi.fn(),
  isMacOS: vi.fn().mockReturnValue(false),
  checkFullDiskAccess: vi.fn().mockReturnValue(true),
  getFullDiskAccessStatus: vi.fn().mockReturnValue({ enabled: true, label: 'Enabled' }),
  getTerminalAppName: vi.fn().mockReturnValue('Terminal'),
  openFullDiskAccessSettings: vi.fn().mockReturnValue(true),
}));

// Mock process.exit to prevent test from exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
  throw new Error('process.exit called');
});

// Mock @supabase/supabase-js
const mockSetSession = vi.fn();
const mockGetUser = vi.fn();
const mockSupabaseClient = {
  auth: {
    setSession: mockSetSession,
    getUser: mockGetUser,
  },
  channel: vi.fn(() => ({
    on: vi.fn().mockReturnThis(),
    subscribe: vi.fn(),
  })),
  from: vi.fn(() => ({
    insert: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
  })),
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

// Test config directory - unique per test run
const TEST_CONFIG_DIR = join(tmpdir(), 'clautunnel-auth-test-' + Date.now());

describe('Command Authentication', () => {
  beforeEach(() => {
    // Set up environment
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';

    // Create test config dir
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }

    // Reset mocks
    vi.clearAllMocks();
    mockExit.mockClear();
  });

  afterEach(() => {
    // Cleanup test config dir
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    vi.resetModules();
  });

  describe('start command', () => {
    it('should exit when no session tokens are stored', async () => {
      // Import fresh modules
      const { createStartCommand } = await import('../commands/start.js');

      const cmd = createStartCommand();

      // Execute the command action directly
      // The command should call process.exit(1) when no tokens
      await expect(
        cmd.parseAsync(['node', 'test', 'claude'], { from: 'user' })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
    });

    it('should call setSession when tokens are stored', async () => {
      // Pre-create config file with tokens
      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          sessionTokens: {
            accessToken: 'test-access-token',
            refreshToken: 'test-refresh-token',
          },
        })
      );

      // Mock successful session restoration
      mockSetSession.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      // Mock Config to use our test directory
      vi.doMock('../utils/config.js', async () => {
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

      const { createStartCommand } = await import('../commands/start.js');
      const cmd = createStartCommand();

      // This will fail for other reasons (daemon setup) but we can verify setSession was called
      try {
        await cmd.parseAsync(['node', 'test', 'claude'], { from: 'user' });
      } catch {
        // Expected to fail due to daemon setup, but setSession should have been called
      }

      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      });
    });

    it('should exit with error when session is expired', async () => {
      // Pre-create config file with tokens
      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          sessionTokens: {
            accessToken: 'expired-token',
            refreshToken: 'expired-refresh',
          },
        })
      );

      // Mock session expiration
      mockSetSession.mockResolvedValue({
        error: { message: 'Invalid refresh token' },
      });

      vi.doMock('../utils/config.js', async () => {
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

      const { createStartCommand } = await import('../commands/start.js');
      const cmd = createStartCommand();

      await expect(
        cmd.parseAsync(['node', 'test', 'claude'], { from: 'user' })
      ).rejects.toThrow('process.exit called');

      expect(mockExit).toHaveBeenCalledWith(1);
    });
  });

  describe('status command', () => {
    it('should report not authenticated when no tokens stored', async () => {
      const { createStatusCommand } = await import('../commands/status.js');
      const cmd = createStatusCommand();

      // Should not throw, just log status
      await cmd.parseAsync(['node', 'test'], { from: 'user' });

      // setSession should NOT have been called since there are no tokens
      expect(mockSetSession).not.toHaveBeenCalled();
    });

    it('should call setSession when tokens exist', async () => {
      // Pre-create config file with tokens
      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          sessionTokens: {
            accessToken: 'valid-access-token',
            refreshToken: 'valid-refresh-token',
          },
        })
      );

      mockSetSession.mockResolvedValue({ error: null });
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      vi.doMock('../utils/config.js', async () => {
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

      const { createStatusCommand } = await import('../commands/status.js');
      const cmd = createStatusCommand();

      await cmd.parseAsync(['node', 'test'], { from: 'user' });

      expect(mockSetSession).toHaveBeenCalledWith({
        access_token: 'valid-access-token',
        refresh_token: 'valid-refresh-token',
      });
    });
  });
});
