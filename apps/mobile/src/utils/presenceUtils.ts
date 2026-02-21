import type { RealtimeChannel } from '@supabase/supabase-js';
import type { PresencePayload } from 'clautunnel-shared';

export type PresenceStatusCallback = (
  entityId: string,
  isOnline: boolean,
  entries: unknown[][]
) => void;

export function setupPresenceHandlers(
  channel: RealtimeChannel,
  entityId: string,
  onStatusChange: PresenceStatusCallback
): void {
  channel
    .on('presence', { event: 'sync' }, () => {
      const state = channel.presenceState();
      const entries = Object.values(state);
      const isCliOnline = entries.some((presences) =>
        (presences as PresencePayload[]).some((p) => p.type === 'cli')
      );
      onStatusChange(entityId, isCliOnline, entries);
    })
    .on('presence', { event: 'join' }, ({ newPresences }) => {
      const cliJoined = (newPresences as PresencePayload[]).some(
        (p) => p.type === 'cli'
      );
      if (cliJoined) {
        onStatusChange(entityId, true, []);
      }
    })
    .on('presence', { event: 'leave' }, ({ leftPresences }) => {
      const cliLeft = (leftPresences as PresencePayload[]).some(
        (p) => p.type === 'cli'
      );
      if (cliLeft) {
        const state = channel.presenceState();
        const entries = Object.values(state);
        const isCliOnline = entries.some((presences) =>
          (presences as PresencePayload[]).some((p) => p.type === 'cli')
        );
        onStatusChange(entityId, isCliOnline, entries);
      }
    });
}
