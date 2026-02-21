import type { Session } from 'clautunnel-shared';

/**
 * Get a display label for a session.
 * Priority: title > last directory segment > 'Session'
 */
export function getSessionLabel(session: Session): string {
  if (session.title) {
    return session.title;
  }
  const dir = session.working_directory;
  if (dir) {
    const parts = dir.split('/');
    return parts[parts.length - 1] || dir;
  }
  return 'Session';
}

/**
 * Whether a session can be resumed (has an SDK session ID).
 */
export function canResumeSession(session: Session): boolean {
  return !!session.sdk_session_id;
}

/**
 * Filter sessions for the resume picker.
 * Excludes the current session.
 */
export function filterResumableSessions(
  sessions: Session[],
  currentSessionId: string | null
): Session[] {
  return sessions.filter((s) => s.id !== currentSessionId);
}
