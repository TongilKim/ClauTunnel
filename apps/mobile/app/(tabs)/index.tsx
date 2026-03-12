import { useCallback, useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  SectionList,
  ScrollView,
  StyleSheet,
  useColorScheme,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSessionStore } from '../../src/stores/sessionStore';
import { SessionCard } from '../../src/components/SessionCard';
import { EmptyState } from '../../src/components/EmptyState';
import { TestModePanel } from '../../src/components/TestModePanel';
import { isSessionOnlineForUI } from '../../src/utils/sessionStatus';
import { isTestMode } from '../../src/utils/testMode';

interface MachineSection {
  id: string;
  title: string;
  hostname?: string;
  data: any[];
  onlineCount: number;
  offlineCount: number;
  endedCount: number;
  hasListener: boolean;
}

export default function SessionsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const {
    sessions,
    machines,
    isLoading,
    error,
    fetchSessions,
    fetchMachines,
    refreshSessions,
    clearError,
    deleteEndedSessionsForMachine,
    setOpenSwipeableId,
    subscribeToPresence,
    subscribeMachinePresence,
    sessionOnlineStatus,
    machineOnlineStatus,
    isStartingSession,
    startSessionError,
    startSessionOnMachine,
  } = useSessionStore();

  // Refresh sessions silently and subscribe to presence whenever the screen gains focus
  useFocusEffect(
    useCallback(() => {
      if (isTestMode()) return;
      fetchMachines();
      fetchSessions(true).then(() => {
        subscribeToPresence();
        subscribeMachinePresence();
      });
    }, [fetchSessions, fetchMachines, subscribeToPresence, subscribeMachinePresence])
  );

  // Also subscribe when sessions or machines change
  useEffect(() => {
    if (isTestMode()) return;
    if (sessions.length > 0 || machines.length > 0) {
      subscribeToPresence();
      subscribeMachinePresence();
    }
  }, [sessions, machines, subscribeToPresence, subscribeMachinePresence]);

  // Show error alert when startSessionError changes
  useEffect(() => {
    if (startSessionError) {
      Alert.alert('Failed to Start Session', startSessionError);
    }
  }, [startSessionError]);

  useEffect(() => {
    if (error) {
      Alert.alert('Session Error', error, [
        { text: 'OK', onPress: clearError },
      ]);
    }
  }, [error, clearError]);

  const onRefresh = useCallback(() => {
    fetchMachines();
    refreshSessions();
  }, [fetchMachines, refreshSessions]);

  // Group sessions by machine, including machines with no sessions
  const sections: MachineSection[] = useMemo(() => {
    const machineMap = new Map<string, MachineSection>();

    // First, add machines from the machines list (includes those with no sessions)
    for (const machine of machines) {
      if (!machineMap.has(machine.id)) {
        machineMap.set(machine.id, {
          id: machine.id,
          title: machine.name,
          hostname: machine.hostname,
          data: [],
          onlineCount: 0,
          offlineCount: 0,
          endedCount: 0,
          hasListener: !!machineOnlineStatus[machine.id],
        });
      }
    }

    // Then add sessions
    sessions.forEach((session: any) => {
      const machineId = session.machines?.id || session.machine_id || 'unknown';
      const machineName = session.machines?.name || 'Unknown Machine';
      const hostname = session.machines?.hostname;

      if (!machineMap.has(machineId)) {
        machineMap.set(machineId, {
          id: machineId,
          title: machineName,
          hostname,
          data: [],
          onlineCount: 0,
          offlineCount: 0,
          endedCount: 0,
          hasListener: !!machineOnlineStatus[machineId],
        });
      }

      const section = machineMap.get(machineId)!;
      section.data.push(session);
      // Match chat room semantics: explicit false means offline, unknown stays optimistic.
      if (isSessionOnlineForUI(session.status, sessionOnlineStatus[session.id])) {
        section.onlineCount++;
      } else {
        section.offlineCount++;
      }
      if (session.status === 'ended') {
        section.endedCount++;
      }
    });

    // Filter out machines that have no sessions and no active listener
    return Array.from(machineMap.values()).filter(
      (section) => section.data.length > 0 || section.hasListener
    );
  }, [sessions, machines, sessionOnlineStatus, machineOnlineStatus]);

  // Calculate total session counts based on presence status
  const sessionCounts = useMemo(() => {
    const total = sessions.length;
    // Count sessions where CLI is actually online (active + presence confirmed)
    const online = sessions.filter((s: any) =>
      isSessionOnlineForUI(s.status, sessionOnlineStatus[s.id])
    ).length;
    const offline = total - online;
    return { total, online, offline };
  }, [sessions, sessionOnlineStatus]);

  const onClearEndedForMachine = useCallback((machineId: string, machineName: string, count: number) => {
    Alert.alert(
      'Clear Ended Sessions',
      `Delete ${count} ended session${count !== 1 ? 's' : ''} from ${machineName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteEndedSessionsForMachine(machineId) },
      ]
    );
  }, [deleteEndedSessionsForMachine]);

  const onStartSession = useCallback((machineId: string) => {
    if (isStartingSession) return;
    startSessionOnMachine(machineId, (sessionId: string) => {
      router.push(`/session/${sessionId}`);
    });
  }, [isStartingSession, startSessionOnMachine, router]);

  const toggleSection = (sectionId: string) => {
    // Close any open swipeable
    setOpenSwipeableId(null);

    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  if (isLoading && sessions.length === 0) {
    return (
      <View style={[styles.loading, isDark && styles.loadingDark]}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (sessions.length === 0 && sections.length === 0) {
    return (
      <ScrollView
        style={[styles.container, isDark && styles.containerDark]}
        contentContainerStyle={styles.emptyContainer}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={isDark ? '#ffffff' : '#000000'}
          />
        }
      >
        <EmptyState
          title="No Sessions"
          message="Start a Claude Code session using 'clautunnel start' or run 'clautunnel listen' to start sessions from this app. Pull down to refresh."
          icon="💻"
          testID="sessions-empty-state"
        />
      </ScrollView>
    );
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      {/* Session Stats */}
      <View style={[styles.statsContainer, isDark && styles.statsContainerDark]}>
        <Pressable
          style={styles.statsContent}
          onPress={() => setOpenSwipeableId(null)}
        >
          <View style={styles.statItem}>
            <Text testID="sessions-stats-total" style={[styles.statNumber, isDark && styles.statNumberDark]}>
              {sessionCounts.total}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <View style={[styles.statusDot, styles.statusDotOnline]} />
              <Text testID="sessions-stats-online" style={[styles.statNumber, styles.statNumberOnline]}>
                {sessionCounts.online}
              </Text>
            </View>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Online</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <View style={styles.statRow}>
              <View style={[styles.statusDot, styles.statusDotOffline]} />
              <Text testID="sessions-stats-offline" style={[styles.statNumber, isDark && styles.statNumberDark]}>
                {sessionCounts.offline}
              </Text>
            </View>
            <Text style={[styles.statLabel, isDark && styles.statLabelDark]}>Offline</Text>
          </View>
        </Pressable>
        <View style={styles.statDivider} />
        <TouchableOpacity
          testID="sessions-refresh-button"
          style={styles.refreshButton}
          onPress={onRefresh}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator size="small" color={isDark ? '#9ca3af' : '#6b7280'} />
          ) : (
            <Text style={[styles.refreshIcon, isDark && styles.refreshIconDark]}>↻</Text>
          )}
        </TouchableOpacity>
      </View>
      <SectionList
        testID="sessions-section-list"
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, section }) =>
          collapsedSections.has(section.id) ? null : <SessionCard session={item} />
        }
        renderSectionHeader={({ section }) => {
          const showAdd = section.hasListener && isStartingSession !== section.id;
          const isStarting = isStartingSession === section.id;

          return (
            <View>
              <TouchableOpacity
                testID={`machine-section-${section.id}`}
                style={[styles.sectionHeader, isDark && styles.sectionHeaderDark]}
                onPress={() => toggleSection(section.id)}
                activeOpacity={0.7}
              >
                <View style={styles.sectionHeaderLeft}>
                  <Text style={[styles.sectionChevron, isDark && styles.sectionChevronDark]}>
                    {collapsedSections.has(section.id) ? '▶' : '▼'}
                  </Text>
                  <View>
                    <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
                      {section.title}
                    </Text>
                    {section.hostname && (
                      <Text style={[styles.sectionHostname, isDark && styles.sectionHostnameDark]}>
                        {section.hostname}
                      </Text>
                    )}
                  </View>
                </View>
                <View style={styles.sectionHeaderRight}>
                  <View style={styles.sectionBadges}>
                    {section.onlineCount > 0 && (
                      <View style={[styles.sectionBadge, styles.sectionBadgeOnline, isDark && styles.sectionBadgeOnlineDark]}>
                        <Text style={[styles.sectionBadgeText, isDark && styles.sectionBadgeTextDark]}>{section.onlineCount}</Text>
                      </View>
                    )}
                    {section.endedCount > 0 && (
                      <View style={[styles.sectionBadge, styles.sectionBadgeOffline, isDark && styles.sectionBadgeOfflineDark]}>
                        <Text style={[styles.sectionBadgeText, styles.sectionBadgeTextOffline, isDark && styles.sectionBadgeTextOfflineDark]}>
                          {section.endedCount}
                        </Text>
                      </View>
                    )}
                  </View>
                  {section.endedCount > 0 && (
                    <TouchableOpacity
                      testID={`machine-clear-ended-${section.id}`}
                      style={styles.sectionClearButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        onClearEndedForMachine(section.id, section.title, section.endedCount);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={[styles.sectionClearIcon, isDark && styles.sectionClearIconDark]}>🗑</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
              {(showAdd || isStarting) && (
                <TouchableOpacity
                  testID={`machine-add-session-${section.id}`}
                  style={[styles.addSessionButton, isDark && styles.addSessionButtonDark]}
                  onPress={() => onStartSession(section.id)}
                  disabled={isStarting}
                >
                  {isStarting ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={styles.addSessionButtonText}>+ New Session</Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          );
        }}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={onRefresh}
            tintColor={isDark ? '#ffffff' : '#000000'}
          />
        }
        stickySectionHeadersEnabled={false}
        onScrollBeginDrag={() => setOpenSwipeableId(null)}
        ListFooterComponent={
          <Pressable
            style={styles.listFooter}
            onPress={() => setOpenSwipeableId(null)}
          />
        }
      />
      <TestModePanel />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingDark: {
    backgroundColor: '#0a0a0a',
  },
  list: {
    paddingVertical: 8,
    flexGrow: 1,
  },
  listFooter: {
    flex: 1,
    minHeight: 200,
  },
  // Session stats
  statsContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 12,
    alignItems: 'center',
  },
  statsContainerDark: {
    backgroundColor: '#1f1f1f',
  },
  statsContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  refreshIcon: {
    fontSize: 22,
    color: '#6b7280',
    fontWeight: '600',
  },
  refreshIconDark: {
    color: '#9ca3af',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  statNumberDark: {
    color: '#f3f4f6',
  },
  statNumberOnline: {
    color: '#22c55e',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  statLabelDark: {
    color: '#9ca3af',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#e5e7eb',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOnline: {
    backgroundColor: '#22c55e',
  },
  statusDotOffline: {
    backgroundColor: '#9ca3af',
  },
  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#e0e7ff',
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
  },
  sectionHeaderDark: {
    backgroundColor: '#1e1b4b',
    borderLeftColor: '#818cf8',
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sectionChevron: {
    fontSize: 12,
    color: '#6b7280',
  },
  sectionChevronDark: {
    color: '#9ca3af',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  sectionTitleDark: {
    color: '#f3f4f6',
  },
  sectionHostname: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  sectionHostnameDark: {
    color: '#9ca3af',
  },
  sectionHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionClearButton: {
    padding: 4,
  },
  sectionClearIcon: {
    fontSize: 14,
    opacity: 0.7,
  },
  sectionClearIconDark: {
    opacity: 0.8,
  },
  sectionBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  sectionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    minWidth: 24,
    alignItems: 'center',
  },
  sectionBadgeOnline: {
    backgroundColor: '#dcfce7',
  },
  sectionBadgeOnlineDark: {
    backgroundColor: '#14532d',
  },
  sectionBadgeOffline: {
    backgroundColor: '#f3f4f6',
  },
  sectionBadgeOfflineDark: {
    backgroundColor: '#374151',
  },
  sectionBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
  sectionBadgeTextDark: {
    color: '#4ade80',
  },
  sectionBadgeTextOffline: {
    color: '#6b7280',
  },
  sectionBadgeTextOfflineDark: {
    color: '#9ca3af',
  },
  // Add session button (between header and cards)
  addSessionButton: {
    marginHorizontal: 16,
    marginTop: 4,
    backgroundColor: '#6366f1',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  addSessionButtonDark: {
    backgroundColor: '#818cf8',
  },
  addSessionButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
