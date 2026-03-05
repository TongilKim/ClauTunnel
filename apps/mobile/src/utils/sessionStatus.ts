import type { SessionStatus } from 'clautunnel-shared';

/**
 * UI policy:
 * - Active sessions are treated as online unless CLI is explicitly reported offline.
 * - Unknown presence (undefined) stays optimistic to avoid false offline in list view.
 */
export function isSessionOnlineForUI(
  status: SessionStatus,
  cliOnline: boolean | undefined,
): boolean {
  return status === 'active' && cliOnline !== false;
}

export function getSessionActivityLabel(
  status: SessionStatus,
  cliOnline: boolean | undefined,
): 'Active' | 'Offline' | 'Ended' {
  if (status !== 'active') return 'Ended';
  return cliOnline === false ? 'Offline' : 'Active';
}
