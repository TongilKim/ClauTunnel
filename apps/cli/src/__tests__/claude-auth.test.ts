import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('child_process', () => ({
  execSync: vi.fn(),
}));

import { checkClaudeCliAuth } from '../utils/claude-auth.js';
import { execSync } from 'child_process';

const mockedExecSync = vi.mocked(execSync);

describe('checkClaudeCliAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return loggedIn true when claude reports logged in', () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({ loggedIn: true, authMethod: 'oauth', apiProvider: 'firstParty' })
    );

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(true);
    expect(result.authMethod).toBe('oauth');
    expect(result.apiProvider).toBe('firstParty');
    expect(result.failure).toBeUndefined();
  });

  it('should return not_logged_in when claude reports not logged in', () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' })
    );

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('not_logged_in');
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

  it('should return unknown for invalid JSON output', () => {
    mockedExecSync.mockReturnValue('not valid json');

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
    expect(result.failure).toBe('unknown');
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
