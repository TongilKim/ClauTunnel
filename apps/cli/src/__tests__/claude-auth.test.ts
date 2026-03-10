import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { checkClaudeCliAuth } from '../utils/claude-auth.js';
import { execSync } from 'child_process';

const mockedExecSync = vi.mocked(execSync);

/**
 * Helper to simulate execSync throwing on non-zero exit code,
 * matching Node's real behavior where error.stdout contains the process output.
 */
function createExecError(message: string, stdout?: string): Error & { stdout?: string } {
  const err = new Error(message) as Error & { stdout?: string };
  if (stdout !== undefined) {
    err.stdout = stdout;
  }
  return err;
}

describe('checkClaudeCliAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loggedIn true when CLI exits 0 with logged-in JSON', () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({ loggedIn: true, authMethod: 'oauth', apiProvider: 'firstParty' })
    );

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(true);
    expect(result.authMethod).toBe('oauth');
    expect(result.apiProvider).toBe('firstParty');
    expect(result.failure).toBeUndefined();
  });

  it('should return not_logged_in when CLI exits 0 with loggedIn false', () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' })
    );

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('not_logged_in');
  });

  it('should return not_logged_in when CLI exits non-zero with JSON in stdout', () => {
    // Real CLI behavior: exit 1 + stdout has {"loggedIn": false, ...}
    mockedExecSync.mockImplementation(() => {
      throw createExecError(
        'Command failed with exit code 1',
        JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' })
      );
    });

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('not_logged_in');
  });

  it('should return loggedIn true when CLI exits non-zero but stdout says loggedIn true', () => {
    // Edge case: non-zero exit but stdout reports logged in
    mockedExecSync.mockImplementation(() => {
      throw createExecError(
        'Command failed with exit code 1',
        JSON.stringify({ loggedIn: true, authMethod: 'oauth', apiProvider: 'firstParty' })
      );
    });

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(true);
    expect(result.authMethod).toBe('oauth');
    expect(result.failure).toBeUndefined();
  });

  it('should return cli_not_found when claude is not installed', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('command not found: claude');
    });

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('cli_not_found');
  });

  it('should return cli_not_found for ENOENT errors', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('spawnSync claude ENOENT');
    });

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('cli_not_found');
  });

  it('should return subcommand_not_supported for older CLI versions', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('Unknown command: auth');
    });

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('subcommand_not_supported');
  });

  it('should return unknown for invalid JSON output on exit 0', () => {
    mockedExecSync.mockReturnValue('not valid json');

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('unknown');
  });

  it('should fall through to message detection when stdout has invalid JSON', () => {
    mockedExecSync.mockImplementation(() => {
      throw createExecError('Unknown command: auth', 'not valid json');
    });

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('subcommand_not_supported');
  });

  it('should return unknown for unexpected errors', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('some unexpected error');
    });

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('unknown');
  });
});
