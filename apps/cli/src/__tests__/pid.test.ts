import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';
import { acquirePidFile, removePidFile, readPidFile, isProcessAlive } from '../utils/pid.js';

const TEST_DIR = path.join(tmpdir(), `clautunnel-pid-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const TEST_PID_FILE = path.join(TEST_DIR, 'daemon.pid');

describe('pid', () => {
  beforeEach(() => {
    if (!fs.existsSync(TEST_DIR)) {
      fs.mkdirSync(TEST_DIR, { recursive: true });
    }
    if (fs.existsSync(TEST_PID_FILE)) {
      fs.unlinkSync(TEST_PID_FILE);
    }
    vi.restoreAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('isProcessAlive', () => {
    it('should return true for current process', () => {
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it('should return false for non-existent PID', () => {
      expect(isProcessAlive(999999)).toBe(false);
    });
  });

  describe('acquirePidFile', () => {
    it('should create PID file with current process PID', () => {
      const result = acquirePidFile(TEST_PID_FILE);

      expect(result).toBe(null);
      expect(fs.existsSync(TEST_PID_FILE)).toBe(true);

      const content = fs.readFileSync(TEST_PID_FILE, 'utf-8').trim();
      expect(content).toMatch(/^\d+:\d+$/); // pid:timestamp format
      expect(readPidFile(TEST_PID_FILE)).toBe(process.pid);
    });

    it('should return existing PID when owning process is alive', () => {
      // Write PID file with current process PID (simulating another clautunnel)
      // Since process.pid is alive, acquirePidFile should detect it
      fs.writeFileSync(TEST_PID_FILE, `${process.pid}:${Date.now()}`);

      const result = acquirePidFile(TEST_PID_FILE);
      expect(result).toBe(process.pid);
    });

    it('should clean up stale PID file when process is dead', () => {
      // Write PID file with a dead PID
      fs.writeFileSync(TEST_PID_FILE, '999999:1234567890');

      const result = acquirePidFile(TEST_PID_FILE);
      expect(result).toBe(null); // Acquired after cleanup
      expect(readPidFile(TEST_PID_FILE)).toBe(process.pid);
    });

    it('should clean up invalid PID file and acquire lock', () => {
      fs.writeFileSync(TEST_PID_FILE, 'not-a-number');

      const result = acquirePidFile(TEST_PID_FILE);
      expect(result).toBe(null);
      expect(readPidFile(TEST_PID_FILE)).toBe(process.pid);
    });

    it('should handle legacy PID file format (pid only, no timestamp)', () => {
      // Dead process with legacy format
      fs.writeFileSync(TEST_PID_FILE, '999999');

      const result = acquirePidFile(TEST_PID_FILE);
      expect(result).toBe(null); // Cleaned up stale file
      expect(readPidFile(TEST_PID_FILE)).toBe(process.pid);
    });
  });

  describe('removePidFile', () => {
    it('should remove PID file when it was written by this process', () => {
      // acquirePidFile writes pid:startTimestamp for current process
      acquirePidFile(TEST_PID_FILE);
      expect(fs.existsSync(TEST_PID_FILE)).toBe(true);

      removePidFile(TEST_PID_FILE);
      expect(fs.existsSync(TEST_PID_FILE)).toBe(false);
    });

    it('should not remove PID file when it belongs to different process', () => {
      fs.writeFileSync(TEST_PID_FILE, '99999:1234567890');

      removePidFile(TEST_PID_FILE);
      expect(fs.existsSync(TEST_PID_FILE)).toBe(true);
    });

    it('should not remove PID file when PID matches but timestamp differs', () => {
      // Same PID but different timestamp — written by a different instance
      fs.writeFileSync(TEST_PID_FILE, `${process.pid}:99999`);

      removePidFile(TEST_PID_FILE);
      expect(fs.existsSync(TEST_PID_FILE)).toBe(true);
    });

    it('should do nothing when PID file does not exist', () => {
      expect(() => removePidFile(TEST_PID_FILE)).not.toThrow();
    });
  });

  describe('readPidFile', () => {
    it('should read PID from pid:timestamp format', () => {
      fs.writeFileSync(TEST_PID_FILE, '12345:9999999');
      expect(readPidFile(TEST_PID_FILE)).toBe(12345);
    });

    it('should read PID from legacy format', () => {
      fs.writeFileSync(TEST_PID_FILE, '12345');
      expect(readPidFile(TEST_PID_FILE)).toBe(12345);
    });

    it('should return null for non-existent file', () => {
      expect(readPidFile(TEST_PID_FILE)).toBe(null);
    });

    it('should return null for invalid content', () => {
      fs.writeFileSync(TEST_PID_FILE, 'garbage');
      expect(readPidFile(TEST_PID_FILE)).toBe(null);
    });
  });
});
