import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { type ChildProcess } from 'child_process';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(),
  execSync: vi.fn(),
}));

// Mock readline
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn(),
    close: vi.fn(),
  })),
}));

// Mock fs
vi.mock('fs', () => ({
  readdirSync: vi.fn(),
}));

import { readdirSync } from 'fs';

import {
  enableSleepPrevention,
  disableSleepPrevention,
  startCaffeinate,
  stopCaffeinate,
  cleanup,
  isMacOS,
  checkFullDiskAccess,
  getFullDiskAccessStatus,
  getTerminalAppName,
  openFullDiskAccessSettings,
  type SleepPreventionState,
} from '../utils/sleep-prevention.js';
import { execSync, spawn } from 'child_process';

describe('Sleep Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enableSleepPrevention', () => {
    it('should call sudo pmset with disablesleep 1', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      const result = enableSleepPrevention();

      expect(execSync).toHaveBeenCalledWith('sudo pmset -a disablesleep 1', { stdio: 'inherit' });
      expect(result).toBe(true);
    });

    it('should return false when execSync throws', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('sudo failed');
      });

      const result = enableSleepPrevention();

      expect(result).toBe(false);
    });
  });

  describe('disableSleepPrevention', () => {
    it('should call sudo pmset with disablesleep 0', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      disableSleepPrevention();

      expect(execSync).toHaveBeenCalledWith('sudo pmset -a disablesleep 0', { stdio: 'inherit' });
    });

    it('should not throw when execSync fails', () => {
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('sudo failed');
      });

      expect(() => disableSleepPrevention()).not.toThrow();
    });
  });

  describe('startCaffeinate', () => {
    it('should spawn caffeinate with -i and -s flags', () => {
      const mockProcess = {
        on: vi.fn(),
        kill: vi.fn(),
      };
      vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);

      const result = startCaffeinate();

      expect(spawn).toHaveBeenCalledWith('caffeinate', ['-i', '-s'], {
        stdio: 'ignore',
        detached: false,
      });
      expect(result).toBe(mockProcess);
    });
  });

  describe('stopCaffeinate', () => {
    it('should kill the process if provided', () => {
      const mockProcess = {
        kill: vi.fn(),
      } as unknown as ChildProcess;

      stopCaffeinate(mockProcess);

      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should do nothing if process is null', () => {
      expect(() => stopCaffeinate(null)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    it('should stop caffeinate and disable pmset when enabled', () => {
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));
      const mockProcess = {
        kill: vi.fn(),
      } as unknown as ChildProcess;

      const state: SleepPreventionState = {
        caffeinateProcess: mockProcess,
        pmsetEnabled: true,
      };

      cleanup(state);

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(execSync).toHaveBeenCalledWith('sudo pmset -a disablesleep 0', { stdio: 'inherit' });
    });

    it('should only stop caffeinate when pmset is not enabled', () => {
      const mockProcess = {
        kill: vi.fn(),
      } as unknown as ChildProcess;

      const state: SleepPreventionState = {
        caffeinateProcess: mockProcess,
        pmsetEnabled: false,
      };

      cleanup(state);

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(execSync).not.toHaveBeenCalled();
    });

    it('should handle null caffeinate process', () => {
      const state: SleepPreventionState = {
        caffeinateProcess: null,
        pmsetEnabled: false,
      };

      expect(() => cleanup(state)).not.toThrow();
    });
  });

  describe('isMacOS', () => {
    it('should return true on darwin platform', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'darwin' });

      expect(isMacOS()).toBe(true);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return false on non-darwin platform', () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'linux' });

      expect(isMacOS()).toBe(false);

      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });
  });

  describe('checkFullDiskAccess', () => {
    let originalPlatform: string;

    beforeEach(() => {
      originalPlatform = process.platform;
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should return true on non-macOS platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      expect(checkFullDiskAccess()).toBe(true);
      expect(readdirSync).not.toHaveBeenCalled();
    });

    it('should return true on macOS when FDA is granted', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(readdirSync).mockReturnValue([]);

      expect(checkFullDiskAccess()).toBe(true);
    });

    it('should attempt to read a TCC-protected directory on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(readdirSync).mockReturnValue([]);

      checkFullDiskAccess();

      expect(readdirSync).toHaveBeenCalledTimes(1);
      const calledPath = vi.mocked(readdirSync).mock.calls[0][0] as string;
      expect(calledPath).toContain('Library/Safari');
    });

    it('should return false on macOS when FDA is not granted (access denied)', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(readdirSync).mockImplementation(() => {
        throw new Error('EPERM: operation not permitted');
      });

      expect(checkFullDiskAccess()).toBe(false);
    });

    it('should return false on macOS for any filesystem error', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(readdirSync).mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(checkFullDiskAccess()).toBe(false);
    });
  });

  describe('getFullDiskAccessStatus', () => {
    it('should return enabled status with short message when FDA is granted', () => {
      const status = getFullDiskAccessStatus(true);

      expect(status.enabled).toBe(true);
      expect(status.label).toBe('Enabled');
    });

    it('should return disabled status with detailed warning when FDA is not granted', () => {
      const status = getFullDiskAccessStatus(false);

      expect(status.enabled).toBe(false);
      expect(status.label).toBe('Not enabled');
      expect(status.warning).toBeDefined();
      expect(status.warning).toContain('permission dialogs');
      expect(status.warning).toContain('mobile app');
      expect(status.warning).toContain('System Settings');
      expect(status.warning).toContain('Privacy & Security');
      expect(status.warning).toContain('Full Disk Access');
    });

    it('should include instructions to enable FDA in warning', () => {
      const status = getFullDiskAccessStatus(false);

      expect(status.warning).toContain('System Settings');
      expect(status.warning).toContain('Full Disk Access');
    });

    it('should mention that operations may silently hang without FDA', () => {
      const status = getFullDiskAccessStatus(false);

      expect(status.warning).toContain('silently hang');
    });

    it('should include specific terminal app name in warning when provided', () => {
      const status = getFullDiskAccessStatus(false, 'Visual Studio Code');

      expect(status.warning).toContain('Visual Studio Code');
    });

    it('should use generic fallback in warning when no terminal app provided', () => {
      const status = getFullDiskAccessStatus(false);

      expect(status.warning).toContain('your terminal app');
    });
  });

  describe('getTerminalAppName', () => {
    let originalTermProgram: string | undefined;

    beforeEach(() => {
      originalTermProgram = process.env.TERM_PROGRAM;
    });

    afterEach(() => {
      if (originalTermProgram === undefined) {
        delete process.env.TERM_PROGRAM;
      } else {
        process.env.TERM_PROGRAM = originalTermProgram;
      }
    });

    it('should return "Visual Studio Code" for vscode', () => {
      process.env.TERM_PROGRAM = 'vscode';
      expect(getTerminalAppName()).toBe('Visual Studio Code');
    });

    it('should return "Terminal" for Apple_Terminal', () => {
      process.env.TERM_PROGRAM = 'Apple_Terminal';
      expect(getTerminalAppName()).toBe('Terminal');
    });

    it('should return "iTerm2" for iTerm.app', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      expect(getTerminalAppName()).toBe('iTerm2');
    });

    it('should return "Warp" for WarpTerminal', () => {
      process.env.TERM_PROGRAM = 'WarpTerminal';
      expect(getTerminalAppName()).toBe('Warp');
    });

    it('should return "Hyper" for Hyper', () => {
      process.env.TERM_PROGRAM = 'Hyper';
      expect(getTerminalAppName()).toBe('Hyper');
    });

    it('should return "your terminal app" when TERM_PROGRAM is not set', () => {
      delete process.env.TERM_PROGRAM;
      expect(getTerminalAppName()).toBe('your terminal app');
    });

    it('should return "your terminal app" for unknown TERM_PROGRAM values', () => {
      process.env.TERM_PROGRAM = 'SomeUnknownTerminal';
      expect(getTerminalAppName()).toBe('your terminal app');
    });
  });

  describe('openFullDiskAccessSettings', () => {
    let originalPlatform: string;

    beforeEach(() => {
      originalPlatform = process.platform;
    });

    afterEach(() => {
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should run open command with correct URL scheme on macOS', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      openFullDiskAccessSettings();

      expect(execSync).toHaveBeenCalledWith(
        'open "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"'
      );
    });

    it('should return true on success', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(execSync).mockReturnValue(Buffer.from(''));

      expect(openFullDiskAccessSettings()).toBe(true);
    });

    it('should return false when open command fails', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      vi.mocked(execSync).mockImplementation(() => {
        throw new Error('open failed');
      });

      expect(openFullDiskAccessSettings()).toBe(false);
    });

    it('should return false on non-macOS platforms', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });

      expect(openFullDiskAccessSettings()).toBe(false);
      expect(execSync).not.toHaveBeenCalled();
    });
  });
});
