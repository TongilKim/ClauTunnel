import { describe, it, expect } from 'vitest';
import type { Session } from 'termbridge-shared';
import {
  getSessionLabel,
  canResumeSession,
  filterResumableSessions,
} from '../utils/resumeSessionUtils';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'session-1',
    machine_id: 'machine-1',
    status: 'ended',
    started_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('getSessionLabel', () => {
  it('should use session.title when present', () => {
    const session = makeSession({ title: 'My Project', working_directory: '/home/user/code' });
    expect(getSessionLabel(session)).toBe('My Project');
  });

  it('should fall back to last directory segment when title is null', () => {
    const session = makeSession({ title: undefined, working_directory: '/home/user/my-app' });
    expect(getSessionLabel(session)).toBe('my-app');
  });

  it('should use full directory when last segment is empty', () => {
    const session = makeSession({ title: undefined, working_directory: '/' });
    expect(getSessionLabel(session)).toBe('/');
  });

  it('should return "Session" when both title and working_directory are absent', () => {
    const session = makeSession({ title: undefined, working_directory: undefined });
    expect(getSessionLabel(session)).toBe('Session');
  });

  it('should prefer title over working_directory', () => {
    const session = makeSession({ title: 'hey', working_directory: '/Users/user/cli' });
    expect(getSessionLabel(session)).toBe('hey');
  });
});

describe('canResumeSession', () => {
  it('should return true when sdk_session_id is present', () => {
    const session = makeSession({ sdk_session_id: 'sdk-abc-123' });
    expect(canResumeSession(session)).toBe(true);
  });

  it('should return false when sdk_session_id is undefined', () => {
    const session = makeSession({ sdk_session_id: undefined });
    expect(canResumeSession(session)).toBe(false);
  });

  it('should return false when sdk_session_id is empty string', () => {
    const session = makeSession({ sdk_session_id: '' });
    expect(canResumeSession(session)).toBe(false);
  });
});

describe('filterResumableSessions', () => {
  it('should exclude the current session', () => {
    const sessions = [
      makeSession({ id: 'session-1' }),
      makeSession({ id: 'session-2' }),
      makeSession({ id: 'session-3' }),
    ];
    const result = filterResumableSessions(sessions, 'session-2');
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id)).toEqual(['session-1', 'session-3']);
  });

  it('should return all sessions when currentSessionId is null', () => {
    const sessions = [
      makeSession({ id: 'session-1' }),
      makeSession({ id: 'session-2' }),
    ];
    const result = filterResumableSessions(sessions, null);
    expect(result).toHaveLength(2);
  });

  it('should return empty array when no sessions match', () => {
    const result = filterResumableSessions([], 'session-1');
    expect(result).toEqual([]);
  });

  it('should include sessions without sdk_session_id', () => {
    const sessions = [
      makeSession({ id: 'session-1', sdk_session_id: 'sdk-123' }),
      makeSession({ id: 'session-2', sdk_session_id: undefined }),
    ];
    const result = filterResumableSessions(sessions, null);
    expect(result).toHaveLength(2);
  });
});
