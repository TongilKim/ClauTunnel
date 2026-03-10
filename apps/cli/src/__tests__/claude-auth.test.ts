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
  });

  it('should return loggedIn false when claude reports not logged in', () => {
    mockedExecSync.mockReturnValue(
      JSON.stringify({ loggedIn: false, authMethod: 'none', apiProvider: 'firstParty' })
    );

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
  });

  it('should return loggedIn false when command throws (claude not installed)', () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error('command not found: claude');
    });

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
  });

  it('should return loggedIn false when command returns invalid JSON', () => {
    mockedExecSync.mockReturnValue('not valid json');

    const result = checkClaudeCliAuth();

    expect(result.loggedIn).toBe(false);
  });
});
