import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStartCommand } from '../commands/start.js';
import { createStopCommand } from '../commands/stop.js';
import { createStatusCommand } from '../commands/status.js';
import { createLoginCommand } from '../commands/login.js';
import { createSetupCommand } from '../commands/setup.js';

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

describe('CLI Commands', () => {
  describe('start command', () => {
    it('should create start command', () => {
      const cmd = createStartCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toBe('start');
    });

    it('should have name option', () => {
      const cmd = createStartCommand();
      const nameOption = cmd.options.find((opt) => opt.long === '--name');
      expect(nameOption).toBeDefined();
    });

    it('should have prevent-sleep option', () => {
      const cmd = createStartCommand();
      const preventSleepOption = cmd.options.find((opt) => opt.long === '--prevent-sleep');
      expect(preventSleepOption).toBeDefined();
    });

    it('should have description', () => {
      const cmd = createStartCommand();
      expect(cmd.description()).toBe('Start ClauTunnel and listen for session requests from mobile app');
    });
  });

  describe('stop command', () => {
    it('should create stop command', () => {
      const cmd = createStopCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toBe('stop');
    });

    it('should have description', () => {
      const cmd = createStopCommand();
      expect(cmd.description()).toBe('Stop the running daemon');
    });
  });

  describe('status command', () => {
    it('should create status command', () => {
      const cmd = createStatusCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toBe('status');
    });

    it('should have description', () => {
      const cmd = createStatusCommand();
      expect(cmd.description()).toBe('Show connection status');
    });
  });

  describe('login command', () => {
    it('should create login command', () => {
      const cmd = createLoginCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toBe('login');
    });

    it('should have description', () => {
      const cmd = createLoginCommand();
      expect(cmd.description()).toBe('Authenticate with ClauTunnel');
    });
  });

  describe('setup command', () => {
    it('should create setup command', () => {
      const cmd = createSetupCommand();
      expect(cmd).toBeDefined();
      expect(cmd.name()).toBe('setup');
    });

    it('should have description', () => {
      const cmd = createSetupCommand();
      expect(cmd.description()).toBe('Configure ClauTunnel with Supabase credentials');
    });
  });
});
