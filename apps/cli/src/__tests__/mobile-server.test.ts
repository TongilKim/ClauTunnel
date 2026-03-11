import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventEmitter, Readable } from 'events';
import { PassThrough } from 'stream';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

// Mock http
vi.mock('http', () => ({
  get: vi.fn(),
}));

import { spawn, execSync } from 'child_process';
import { get } from 'http';

const mockedSpawn = vi.mocked(spawn);
const mockedExecSync = vi.mocked(execSync);
const mockedGet = vi.mocked(get);

const TEST_DIR = join(tmpdir(), 'clautunnel-mobile-test-' + Date.now());
const MOBILE_DIR = join(TEST_DIR, 'apps', 'mobile');
const LOG_DIR = join(TEST_DIR, 'logs');

function createMockProcess(): any {
  const proc = new EventEmitter() as any;
  proc.stdout = new PassThrough();
  proc.stderr = new PassThrough();
  proc.kill = vi.fn();
  proc.pid = 12345;
  proc.exitCode = null;
  return proc;
}

function createMockResponse(data: string): any {
  const res = new EventEmitter() as any;
  setTimeout(() => {
    res.emit('data', data);
    res.emit('end');
  }, 0);
  return res;
}

describe('MobileServerManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mkdirSync(MOBILE_DIR, { recursive: true });
    mkdirSync(LOG_DIR, { recursive: true });
    // Create package.json so ensureMobileProject recognizes the dir
    writeFileSync(join(MOBILE_DIR, 'package.json'), '{}');
  });

  afterEach(async () => {
    // Wait for any pending async operations (log streams, etc.)
    await new Promise((resolve) => setTimeout(resolve, 50));
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('ensureMobileProject', () => {
    it('should return ready when package.json exists', async () => {
      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.ensureMobileProject();
      expect(result.ready).toBe(true);
      expect(result.cloned).toBe(false);
    });

    it('should return error when custom path does not exist', async () => {
      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: '/nonexistent/path',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.ensureMobileProject();
      expect(result.ready).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('checkPrerequisites', () => {
    it('should pass when ngrok is installed and authtoken configured', async () => {
      mockedExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('ngrok config check')) {
          return Buffer.from('Valid configuration file at /path/to/ngrok.yml');
        }
        return Buffer.from('/usr/local/bin/ngrok');
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.checkPrerequisites();
      expect(result.ready).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should report missing ngrok', async () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('not found');
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.checkPrerequisites();
      expect(result.ready).toBe(false);
      expect(result.issues[0]).toContain('ngrok is not installed');
    });

    it('should report missing ngrok authtoken', async () => {
      mockedExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('ngrok config check')) {
          throw new Error('no authtoken');
        }
        return Buffer.from('/usr/local/bin/ngrok');
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.checkPrerequisites();
      expect(result.ready).toBe(false);
      expect(result.issues[0]).toContain('authtoken is not configured');
    });

    it('should flag needsInstall when node_modules missing', async () => {
      mockedExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('ngrok config check')) {
          return Buffer.from('Valid configuration file');
        }
        return Buffer.from('/usr/local/bin/ngrok');
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.checkPrerequisites();
      expect(result.needsInstall).toBe(true);
    });

    it('should not flag needsInstall when node_modules exists', async () => {
      mockedExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('ngrok config check')) {
          return Buffer.from('Valid configuration file');
        }
        return Buffer.from('/usr/local/bin/ngrok');
      });
      mkdirSync(join(MOBILE_DIR, 'node_modules'), { recursive: true });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.checkPrerequisites();
      expect(result.needsInstall).toBe(false);
    });
  });

  describe('ensureEnvFile', () => {
    it('should write .env file with Supabase credentials', async () => {
      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-anon-key',
        logDir: LOG_DIR,
      });

      manager.ensureEnvFile();

      const envPath = join(MOBILE_DIR, '.env');
      expect(existsSync(envPath)).toBe(true);

      const content = readFileSync(envPath, 'utf-8');
      expect(content).toContain('EXPO_PUBLIC_SUPABASE_URL=https://test.supabase.co');
      expect(content).toContain('EXPO_PUBLIC_SUPABASE_ANON_KEY=test-anon-key');
    });

    it('should overwrite existing .env file', async () => {
      writeFileSync(join(MOBILE_DIR, '.env'), 'OLD_CONTENT=old');

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://new.supabase.co',
        supabaseAnonKey: 'new-key',
        logDir: LOG_DIR,
      });

      manager.ensureEnvFile();

      const content = readFileSync(join(MOBILE_DIR, '.env'), 'utf-8');
      expect(content).not.toContain('OLD_CONTENT');
      expect(content).toContain('https://new.supabase.co');
    });
  });

  describe('installDependencies', () => {
    // Repo root is two levels up from MOBILE_DIR (apps/mobile -> repo root)
    const REPO_ROOT = join(MOBILE_DIR, '..', '..');
    const SHARED_DIST = join(REPO_ROOT, 'packages', 'shared', 'dist', 'index.js');

    it('should skip install if node_modules and shared dist exist', async () => {
      mkdirSync(join(MOBILE_DIR, 'node_modules'), { recursive: true });
      mkdirSync(join(REPO_ROOT, 'packages', 'shared', 'dist'), { recursive: true });
      writeFileSync(SHARED_DIST, '');

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.installDependencies();
      expect(result).toBe(true);
      expect(mockedExecSync).not.toHaveBeenCalledWith('pnpm install', expect.anything());
    });

    it('should run pnpm install at repo root and build shared if node_modules missing', async () => {
      // Create shared tsconfig so build step runs
      mkdirSync(join(REPO_ROOT, 'packages', 'shared'), { recursive: true });
      writeFileSync(join(REPO_ROOT, 'packages', 'shared', 'tsconfig.json'), '{}');

      mockedExecSync.mockReturnValue(Buffer.from(''));

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.installDependencies();
      expect(result).toBe(true);
      expect(mockedExecSync).toHaveBeenCalledWith('pnpm install', expect.objectContaining({
        cwd: REPO_ROOT,
      }));
      expect(mockedExecSync).toHaveBeenCalledWith('pnpm build', expect.objectContaining({
        cwd: join(REPO_ROOT, 'packages', 'shared'),
      }));
    });

    it('should return false if pnpm install fails', async () => {
      mockedExecSync.mockImplementation((cmd) => {
        if (cmd === 'pnpm install') throw new Error('install failed');
        return Buffer.from('');
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = manager.installDependencies();
      expect(result).toBe(false);
    });
  });

  describe('startNgrok', () => {
    it('should spawn ngrok and return tunnel URL', async () => {
      const mockProc = createMockProcess();
      mockedSpawn.mockReturnValue(mockProc);

      const tunnelResponse = JSON.stringify({
        tunnels: [
          { proto: 'https', public_url: 'https://abc123.ngrok-free.app' },
          { proto: 'http', public_url: 'http://abc123.ngrok-free.app' },
        ],
      });

      mockedGet.mockImplementation((_url: any, cb: any) => {
        const res = createMockResponse(tunnelResponse);
        cb(res);
        const req = new EventEmitter() as any;
        req.setTimeout = vi.fn();
        req.destroy = vi.fn();
        return req;
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const url = await manager.startNgrok();
      expect(url).toBe('https://abc123.ngrok-free.app');
      expect(mockedSpawn).toHaveBeenCalledWith(
        'ngrok',
        ['http', '8081'],
        expect.objectContaining({ stdio: ['ignore', 'pipe', 'pipe'] })
      );
    });

    it('should return null if tunnel URL not found within retries', async () => {
      const mockProc = createMockProcess();
      mockedSpawn.mockReturnValue(mockProc);

      mockedGet.mockImplementation((_url: any, _cb: any) => {
        const req = new EventEmitter() as any;
        req.setTimeout = vi.fn();
        req.destroy = vi.fn();
        // Emit error to simulate connection refused
        setTimeout(() => req.emit('error', new Error('ECONNREFUSED')), 0);
        return req;
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
        expoPort: 8081,
      });

      // Override sleep to speed up test
      (manager as any).sleep = () => Promise.resolve();

      const url = await manager.startNgrok();
      expect(url).toBeNull();
      expect(mockProc.kill).toHaveBeenCalled();
    }, 10000);
  });

  describe('stop', () => {
    it('should kill ngrok and expo processes', async () => {
      const ngrokProc = createMockProcess();
      const expoProc = createMockProcess();
      mockedSpawn.mockReturnValueOnce(ngrokProc).mockReturnValueOnce(expoProc);

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      // Set internal state by accessing private fields
      (manager as any).ngrokProcess = ngrokProc;
      (manager as any).expoProcess = expoProc;

      await manager.stop();

      expect(ngrokProc.kill).toHaveBeenCalledWith('SIGTERM');
      expect(expoProc.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should handle already-exited processes gracefully', async () => {
      const mockProc = createMockProcess();
      mockProc.kill.mockImplementation(() => {
        throw new Error('Process already exited');
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      (manager as any).ngrokProcess = mockProc;

      // Should not throw
      await expect(manager.stop()).resolves.toBeUndefined();
    });
  });

  describe('start (integration)', () => {
    it('should return error when prerequisites fail (ngrok missing)', async () => {
      mockedExecSync.mockImplementation((cmd) => {
        if (cmd === 'which ngrok') throw new Error('not found');
        return Buffer.from('');
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = await manager.start();
      expect(result.started).toBe(false);
      expect(result.error).toContain('ngrok');
    });

    it('should return error when custom path not found', async () => {
      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: '/nonexistent/custom/path',
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      const result = await manager.start();
      expect(result.started).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return error when ngrok tunnel fails', async () => {
      // Prerequisites pass
      mockedExecSync.mockImplementation((cmd) => {
        if (typeof cmd === 'string' && cmd.includes('ngrok config check')) {
          return Buffer.from('Valid configuration file');
        }
        return Buffer.from('/usr/local/bin/ngrok');
      });
      mkdirSync(join(MOBILE_DIR, 'node_modules'), { recursive: true });

      // ngrok spawn succeeds
      const ngrokProc = createMockProcess();
      mockedSpawn.mockReturnValue(ngrokProc);

      // But tunnel URL polling fails
      mockedGet.mockImplementation((_url: any, _cb: any) => {
        const req = new EventEmitter() as any;
        req.setTimeout = vi.fn();
        req.destroy = vi.fn();
        setTimeout(() => req.emit('error', new Error('ECONNREFUSED')), 0);
        return req;
      });

      const { MobileServerManager } = await import('../mobile/mobile-server.js');
      const manager = new MobileServerManager({
        mobileProjectPath: MOBILE_DIR,
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-key',
        logDir: LOG_DIR,
      });

      // Speed up test
      (manager as any).sleep = () => Promise.resolve();

      const result = await manager.start();
      expect(result.started).toBe(false);
      expect(result.error).toContain('ngrok tunnel');
    }, 10000);
  });
});
