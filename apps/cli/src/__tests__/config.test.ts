import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// Mock environment and filesystem for tests
const TEST_CONFIG_DIR = join(tmpdir(), 'clautunnel-test-' + Date.now());

describe('Config', () => {
  beforeEach(() => {
    // Clean env vars
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    // Create test config dir
    if (!existsSync(TEST_CONFIG_DIR)) {
      mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test config dir
    if (existsSync(TEST_CONFIG_DIR)) {
      rmSync(TEST_CONFIG_DIR, { recursive: true, force: true });
    }
    vi.resetModules();
  });

  describe('Environment Loading', () => {
    it('should load Supabase URL from environment', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-key';

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(config.getSupabaseUrl()).toBe('https://test.supabase.co');
    });

    it('should load Supabase anon key from environment', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(config.getSupabaseAnonKey()).toBe('test-anon-key');
    });

    it('should throw error when SUPABASE_URL missing', async () => {
      process.env.SUPABASE_ANON_KEY = 'test-key';
      // SUPABASE_URL not set

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(() => config.getSupabaseUrl()).toThrow('SUPABASE_URL');
    });

    it('should throw error when SUPABASE_ANON_KEY missing', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      // SUPABASE_ANON_KEY not set

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(() => config.getSupabaseAnonKey()).toThrow('SUPABASE_ANON_KEY');
    });

    it('should validate SUPABASE_URL format (must be valid URL)', async () => {
      process.env.SUPABASE_URL = 'not-a-valid-url';
      process.env.SUPABASE_ANON_KEY = 'test-key';

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(() => config.getSupabaseUrl()).toThrow('valid URL');
    });
  });

  describe('Supabase Credentials Persistence', () => {
    it('should save Supabase credentials to config file', async () => {
      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      config.setSupabaseCredentials({
        url: 'https://saved.supabase.co',
        anonKey: 'saved-anon-key',
      });

      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      expect(existsSync(configFile)).toBe(true);

      const savedData = JSON.parse(readFileSync(configFile, 'utf-8'));
      expect(savedData.supabaseUrl).toBe('https://saved.supabase.co');
      expect(savedData.supabaseAnonKey).toBe('saved-anon-key');
    });

    it('should load Supabase URL from config file when env var not set', async () => {
      // Pre-create config file with credentials
      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          supabaseUrl: 'https://config-file.supabase.co',
          supabaseAnonKey: 'config-file-key',
        })
      );

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(config.getSupabaseUrl()).toBe('https://config-file.supabase.co');
    });

    it('should load Supabase anon key from config file when env var not set', async () => {
      // Pre-create config file with credentials
      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          supabaseUrl: 'https://config-file.supabase.co',
          supabaseAnonKey: 'config-file-key',
        })
      );

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(config.getSupabaseAnonKey()).toBe('config-file-key');
    });

    it('should prefer env var over config file for Supabase URL', async () => {
      process.env.SUPABASE_URL = 'https://env-var.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'env-key';

      // Pre-create config file with different credentials
      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          supabaseUrl: 'https://config-file.supabase.co',
          supabaseAnonKey: 'config-file-key',
        })
      );

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(config.getSupabaseUrl()).toBe('https://env-var.supabase.co');
    });

    it('should return true from isConfigured when credentials exist in config file', async () => {
      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        })
      );

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(config.isConfigured()).toBe(true);
    });

    it('should return true from isConfigured when credentials exist in env vars', async () => {
      process.env.SUPABASE_URL = 'https://env.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'env-key';

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(config.isConfigured()).toBe(true);
    });

    it('should return false from isConfigured when no credentials exist', async () => {
      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(config.isConfigured()).toBe(false);
    });
  });

  describe('Machine ID Persistence', () => {
    it('should save machine ID to file', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-key';

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      config.setMachineId('machine-123');

      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      expect(existsSync(configFile)).toBe(true);

      const savedData = JSON.parse(readFileSync(configFile, 'utf-8'));
      expect(savedData.machineId).toBe('machine-123');
    });

    it('should load machine ID from file', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-key';

      // Pre-create config file
      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      writeFileSync(configFile, JSON.stringify({ machineId: 'existing-machine' }));

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(config.getMachineId()).toBe('existing-machine');
    });

    it('should create config directory if not exists', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-key';

      const newConfigDir = join(TEST_CONFIG_DIR, 'nested', 'config', 'dir');

      const { Config } = await import('../utils/config.js');
      const config = new Config(newConfigDir);

      config.setMachineId('test-machine');

      expect(existsSync(newConfigDir)).toBe(true);
    });
  });

  describe('requireConfiguration', () => {
    it('should not throw when config file has credentials', async () => {
      const configFile = join(TEST_CONFIG_DIR, 'config.json');
      writeFileSync(
        configFile,
        JSON.stringify({
          supabaseUrl: 'https://test.supabase.co',
          supabaseAnonKey: 'test-key',
        })
      );

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(() => config.requireConfiguration()).not.toThrow();
    });

    it('should not throw when env vars are set', async () => {
      process.env.SUPABASE_URL = 'https://env.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'env-key';

      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(() => config.requireConfiguration()).not.toThrow();
    });

    it('should throw ConfigurationError when no credentials exist', async () => {
      const { Config, ConfigurationError } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(() => config.requireConfiguration()).toThrow(ConfigurationError);
    });

    it('should throw error with helpful message', async () => {
      const { Config } = await import('../utils/config.js');
      const config = new Config(TEST_CONFIG_DIR);

      expect(() => config.requireConfiguration()).toThrow('clautunnel setup');
    });
  });
});
