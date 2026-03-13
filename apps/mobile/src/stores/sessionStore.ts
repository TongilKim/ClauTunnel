import { create } from 'zustand';
import { supabase } from '../services/supabase';
import type { Session, Machine, MachineCommand } from 'clautunnel-shared';
import { REALTIME_CHANNELS } from 'clautunnel-shared';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { setupPresenceHandlers } from '../utils/presenceUtils';
import {
  buildMockMachines,
  buildMockSessions,
  buildMockStartedSession,
  consumeMockMutationFailure,
  isTestMode,
} from '../utils/testMode';

interface SessionStoreState {
  sessions: Session[];
  machines: Machine[];
  isLoading: boolean;
  error: string | null;
  pendingSessionId: string | null; // Session being disconnected/deleted
  openSwipeableId: string | null; // Currently open swipeable session
  sessionOnlineStatus: Record<string, boolean>; // sessionId -> isCliOnline
  machineOnlineStatus: Record<string, boolean>; // machineId -> isListenerOnline
  isStartingSession: string | null; // machineId being started
  startSessionError: string | null;

  // Actions
  fetchSessions: (silent?: boolean) => Promise<void>;
  fetchMachines: () => Promise<void>;
  refreshSessions: () => Promise<void>;
  endSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  deleteEndedSessions: () => Promise<void>;
  deleteEndedSessionsForMachine: (machineId: string) => Promise<void>;
  clearError: () => void;
  setOpenSwipeableId: (id: string | null) => void;
  subscribeToPresence: () => void;
  unsubscribeFromPresence: () => void;
  subscribeMachinePresence: () => void;
  unsubscribeMachinePresence: () => void;
  updateSessionTitle: (sessionId: string, title: string) => Promise<void>;
  startSessionOnMachine: (machineId: string, onSuccess: (sessionId: string) => void) => void;
}

// Keep track of presence channels outside the store
const presenceChannels: Map<string, RealtimeChannel> = new Map();
const machinePresenceChannels: Map<string, RealtimeChannel> = new Map();

const _testMode = isTestMode();

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: _testMode ? (buildMockSessions() as any) : [],
  machines: _testMode ? (buildMockMachines() as any) : [],
  isLoading: false,
  error: null,
  pendingSessionId: null,
  openSwipeableId: null,
  sessionOnlineStatus: _testMode ? { 'test-session-1': true } : {},
  machineOnlineStatus: _testMode ? { 'test-machine-1': true } : {},
  isStartingSession: null,
  startSessionError: null,

  fetchSessions: async (silent = false) => {
    // Prevent duplicate fetches
    if (get().isLoading) return;

    try {
      if (!silent) {
        set({ isLoading: true, error: null });
      }

      const { data, error } = await supabase
        .from('sessions')
        .select(
          `
          *,
          machines (
            id,
            name,
            hostname,
            status
          )
        `
        )
        .order('started_at', { ascending: false });

      if (error) throw error;

      set({
        sessions: data as Session[],
        isLoading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch sessions',
        isLoading: false,
      });
    }
  },

  fetchMachines: async () => {
    try {
      const { data, error } = await supabase
        .from('machines')
        .select('*')
        .order('last_seen_at', { ascending: false });

      if (error) throw error;

      set({ machines: (data as Machine[]) || [] });
    } catch {
      // Non-critical - machines are also loaded via sessions
    }
  },

  refreshSessions: async () => {
    // Same as fetchSessions but can be called when pull-to-refresh
    await get().fetchSessions();
  },

  endSession: async (sessionId: string) => {
    if (_testMode) {
      set({ pendingSessionId: sessionId });
      setTimeout(() => {
        const failure = consumeMockMutationFailure('end-session');
        if (failure) {
          set({ pendingSessionId: null, error: failure });
          return;
        }
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId
              ? { ...session, status: 'ended' as const, ended_at: new Date().toISOString() }
              : session
          ),
          pendingSessionId: null,
          sessionOnlineStatus: {
            ...state.sessionOnlineStatus,
            [sessionId]: false,
          },
        }));
      }, 150);
      return;
    }

    try {
      set({ pendingSessionId: sessionId });

      // Send disconnect notification to CLI via realtime
      try {
        const inputChannelName = REALTIME_CHANNELS.sessionInput(sessionId);
        const tempChannel = supabase.channel(inputChannelName);

        // Subscribe and send disconnect message
        await new Promise<void>((resolve) => {
          tempChannel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
              await tempChannel.send({
                type: 'broadcast',
                event: 'input',
                payload: {
                  type: 'mobile-disconnect',
                  timestamp: Date.now(),
                  seq: 0,
                },
              });
              // Wait for message to be delivered
              await new Promise((r) => setTimeout(r, 200));
              resolve();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              resolve(); // Continue even if channel fails
            }
          });
          // Timeout after 2 seconds
          setTimeout(resolve, 2000);
        });

        await supabase.removeChannel(tempChannel);
      } catch {
        // Ignore realtime errors - still proceed with database update
      }

      const { error } = await supabase
        .from('sessions')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', sessionId);

      if (error) throw error;

      // Update local state
      set((state) => ({
        sessions: state.sessions.map((session) =>
          session.id === sessionId
            ? { ...session, status: 'ended' as const, ended_at: new Date().toISOString() }
            : session
        ),
        pendingSessionId: null,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to end session',
        pendingSessionId: null,
      });
    }
  },

  deleteSession: async (sessionId: string) => {
    if (_testMode) {
      set({ pendingSessionId: sessionId });
      setTimeout(() => {
        const failure = consumeMockMutationFailure('delete-session');
        if (failure) {
          set({ pendingSessionId: null, error: failure });
          return;
        }
        set((state) => {
          const nextOnlineStatus = { ...state.sessionOnlineStatus };
          delete nextOnlineStatus[sessionId];
          return {
            sessions: state.sessions.filter((session) => session.id !== sessionId),
            pendingSessionId: null,
            sessionOnlineStatus: nextOnlineStatus,
          };
        });
      }, 150);
      return;
    }

    try {
      set({ pendingSessionId: sessionId });

      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      // Remove from local state
      set((state) => ({
        sessions: state.sessions.filter((session) => session.id !== sessionId),
        pendingSessionId: null,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete session',
        pendingSessionId: null,
      });
    }
  },

  deleteEndedSessions: async () => {
    if (_testMode) {
      set((state) => ({
        sessions: state.sessions.filter((session) => session.status !== 'ended'),
      }));
      return;
    }

    try {
      set({ isLoading: true });

      const { error } = await supabase
        .from('sessions')
        .delete()
        .eq('status', 'ended');

      if (error) throw error;

      // Remove ended sessions from local state
      set((state) => ({
        sessions: state.sessions.filter((session) => session.status !== 'ended'),
        isLoading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete ended sessions',
        isLoading: false,
      });
    }
  },

  deleteEndedSessionsForMachine: async (machineId: string) => {
    if (_testMode) {
      set((state) => ({
        sessions: state.sessions.filter(
          (session) => !(session.machine_id === machineId && session.status === 'ended')
        ),
      }));
      return;
    }

    try {
      // Get ended session IDs for this machine
      const endedSessionIds = get()
        .sessions.filter((s) => s.machine_id === machineId && s.status === 'ended')
        .map((s) => s.id);

      if (endedSessionIds.length === 0) return;

      const { error } = await supabase
        .from('sessions')
        .delete()
        .in('id', endedSessionIds);

      if (error) throw error;

      // Remove from local state
      set((state) => ({
        sessions: state.sessions.filter(
          (session) => !(session.machine_id === machineId && session.status === 'ended')
        ),
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete ended sessions',
      });
    }
  },

  clearError: () => set({ error: null }),

  setOpenSwipeableId: (id: string | null) => set({ openSwipeableId: id }),

  subscribeToPresence: () => {
    const { sessions } = get();
    const activeSessions = sessions.filter((s) => s.status === 'active');

    // Unsubscribe from sessions that are no longer active
    for (const [sessionId, channel] of presenceChannels) {
      if (!activeSessions.find((s) => s.id === sessionId)) {
        supabase.removeChannel(channel);
        presenceChannels.delete(sessionId);
      }
    }

    // Clear sessionOnlineStatus for sessions that are no longer active
    const activeSessionIds = new Set(activeSessions.map((s) => s.id));
    const updatedStatus = { ...get().sessionOnlineStatus };
    let changed = false;
    for (const sessionId of Object.keys(updatedStatus)) {
      if (!activeSessionIds.has(sessionId)) {
        delete updatedStatus[sessionId];
        changed = true;
      }
    }
    if (changed) {
      set({ sessionOnlineStatus: updatedStatus });
    }

    // Subscribe to presence for active sessions
    for (const session of activeSessions) {
      if (presenceChannels.has(session.id)) continue;

      const channelName = REALTIME_CHANNELS.sessionPresence(session.id);
      const channel = supabase.channel(channelName);

      setupPresenceHandlers(channel, session.id, (entityId, isOnline, entries) => {
        set((s) => {
          // Preserve optimistic true on empty initial sync
          // (CLI presence may not have propagated yet)
          if (!isOnline && entries.length === 0 && s.sessionOnlineStatus[entityId] === true) {
            return s;
          }
          return {
            sessionOnlineStatus: { ...s.sessionOnlineStatus, [entityId]: isOnline },
          };
        });
      });

      channel.subscribe();

      presenceChannels.set(session.id, channel);
    }
  },

  unsubscribeFromPresence: () => {
    for (const [, channel] of presenceChannels) {
      supabase.removeChannel(channel);
    }
    presenceChannels.clear();
    set({ sessionOnlineStatus: {} });
  },

  subscribeMachinePresence: () => {
    const { machines } = get();

    // Also collect unique machine IDs from sessions (for machines that have sessions)
    const { sessions } = get();
    const machineIds = new Set<string>();
    for (const machine of machines) {
      machineIds.add(machine.id);
    }
    for (const session of sessions) {
      if (session.machine_id) {
        machineIds.add(session.machine_id);
      }
    }

    // Unsubscribe from machines no longer relevant
    for (const [machineId, channel] of machinePresenceChannels) {
      if (!machineIds.has(machineId)) {
        supabase.removeChannel(channel);
        machinePresenceChannels.delete(machineId);
      }
    }

    // Subscribe to presence for each machine
    for (const machineId of machineIds) {
      if (machinePresenceChannels.has(machineId)) continue;

      const channelName = REALTIME_CHANNELS.machinePresence(machineId);
      const channel = supabase.channel(channelName);

      setupPresenceHandlers(channel, machineId, (entityId, isOnline) => {
        set((s) => ({
          machineOnlineStatus: { ...s.machineOnlineStatus, [entityId]: isOnline },
        }));
      });

      channel.subscribe();
      machinePresenceChannels.set(machineId, channel);
    }
  },

  unsubscribeMachinePresence: () => {
    for (const [, channel] of machinePresenceChannels) {
      supabase.removeChannel(channel);
    }
    machinePresenceChannels.clear();
    set({ machineOnlineStatus: {} });
  },

  updateSessionTitle: async (sessionId: string, title: string) => {
    const dbTitle = title.trim() === '' ? null : title;

    if (_testMode) {
      const failure = consumeMockMutationFailure('update-title');
      if (failure) {
        set({ error: failure });
        return;
      }
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId
            ? { ...s, title: dbTitle ?? undefined }
            : s
        ),
      }));
      return;
    }

    const { error } = await supabase
      .from('sessions')
      .update({ title: dbTitle })
      .eq('id', sessionId);

    if (error) throw error;

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? { ...s, title: dbTitle ?? undefined }
          : s
      ),
    }));
  },

  startSessionOnMachine: (machineId: string, onSuccess: (sessionId: string) => void) => {
    if (_testMode) {
      set({ isStartingSession: machineId, startSessionError: null });
      setTimeout(() => {
        const failure = consumeMockMutationFailure('start-session');
        if (failure) {
          set({
            isStartingSession: null,
            startSessionError: failure,
          });
          return;
        }
        const nextIndex = get().sessions.length + 1;
        const newSession = buildMockStartedSession(nextIndex);
        set((state) => ({
          sessions: [newSession as any, ...state.sessions],
          isStartingSession: null,
          startSessionError: null,
          sessionOnlineStatus: {
            ...state.sessionOnlineStatus,
            [newSession.id]: true,
          },
        }));
        onSuccess(newSession.id);
      }, 150);
      return;
    }

    set({ isStartingSession: machineId, startSessionError: null });

    const inputChannelName = REALTIME_CHANNELS.machineInput(machineId);
    const outputChannelName = REALTIME_CHANNELS.machineOutput(machineId);

    const inputChannel = supabase.channel(inputChannelName);
    const outputChannel = supabase.channel(outputChannelName);

    let timeoutId: ReturnType<typeof setTimeout>;

    const cleanup = () => {
      clearTimeout(timeoutId);
      supabase.removeChannel(inputChannel);
      supabase.removeChannel(outputChannel);
    };

    // Listen for response on output channel
    outputChannel.on('broadcast', { event: 'machine-command' }, (payload) => {
      const cmd = payload.payload as MachineCommand;

      if (cmd.type === 'session-started' && cmd.sessionId) {
        cleanup();
        // Mark session as online immediately — CLI just responded, so it's online
        set((s) => ({
          isStartingSession: null,
          startSessionError: null,
          sessionOnlineStatus: { ...s.sessionOnlineStatus, [cmd.sessionId!]: true },
        }));

        // Refresh sessions so the new session appears in the list
        get().fetchSessions(true).then(() => {
          get().subscribeToPresence();
        });

        onSuccess(cmd.sessionId);
      }

      if (cmd.type === 'start-session-error') {
        cleanup();
        set({
          isStartingSession: null,
          startSessionError: cmd.error || 'Failed to start session',
        });
      }
    });

    // Subscribe to output channel first, then send command on input channel
    outputChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        inputChannel.subscribe((inputStatus) => {
          if (inputStatus === 'SUBSCRIBED') {
            const command: MachineCommand = {
              type: 'start-session',
              timestamp: Date.now(),
            };

            inputChannel.send({
              type: 'broadcast',
              event: 'machine-command',
              payload: command,
            });
          }
        });
      }
    });

    // Timeout after 15 seconds
    timeoutId = setTimeout(() => {
      cleanup();
      set({
        isStartingSession: null,
        startSessionError: 'Timed out waiting for session to start.',
      });
    }, 15000);
  },
}));
