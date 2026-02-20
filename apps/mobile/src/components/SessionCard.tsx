import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Animated,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import type { Session } from 'termbridge-shared';
import { useSessionStore } from '../stores/sessionStore';

interface SessionCardProps {
  session: Session & {
    machines?: {
      id: string;
      name: string;
      hostname?: string;
      status: string;
    };
  };
}

export function SessionCard({ session }: SessionCardProps) {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const swipeableRef = useRef<Swipeable>(null);
  const { endSession, deleteSession, pendingSessionId, openSwipeableId, setOpenSwipeableId, sessionOnlineStatus } = useSessionStore();
  const isPending = pendingSessionId === session.id;
  const isCliOnline = sessionOnlineStatus[session.id] ?? false;

  // Close this swipeable if another one is opened or if cleared
  useEffect(() => {
    if (openSwipeableId !== session.id) {
      swipeableRef.current?.close();
    }
  }, [openSwipeableId, session.id]);

  // Close swipeable when pending (loading) starts
  useEffect(() => {
    if (isPending) {
      swipeableRef.current?.close();
      setOpenSwipeableId(null);
    }
  }, [isPending]);

  const handleSwipeableOpen = () => {
    setOpenSwipeableId(session.id);
  };

  const machine = session.machines;
  const isActive = session.status === 'active';
  const machineOnline = machine?.status === 'online';

  const handleDisconnect = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      'Disconnect Session',
      'Are you sure you want to disconnect this session? This will end the CLI session.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            swipeableRef.current?.close();
            setOpenSwipeableId(null);
          },
        },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            endSession(session.id);
          },
        },
      ]
    );
  };

  const handleDelete = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      'Delete Session',
      'Are you sure you want to delete this session? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            swipeableRef.current?.close();
            setOpenSwipeableId(null);
          },
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            deleteSession(session.id);
          },
        },
      ]
    );
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const translateX = dragX.interpolate({
      inputRange: [-100, 0],
      outputRange: [0, 100],
      extrapolate: 'clamp',
    });

    if (isActive) {
      return (
        <View style={styles.swipeActions}>
          <Animated.View style={[styles.actionButton, styles.disconnectButton, { transform: [{ translateX }] }]}>
            <TouchableOpacity
              style={styles.actionButtonInner}
              onPress={handleDisconnect}
            >
              <Text style={styles.actionButtonText}>Disconnect</Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      );
    }

    return (
      <View style={styles.swipeActions}>
        <Animated.View style={[styles.actionButton, styles.deleteButton, { transform: [{ translateX }] }]}>
          <TouchableOpacity
            style={styles.actionButtonInner}
            onPress={handleDelete}
          >
            <Text style={styles.actionButtonText}>Delete</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const handleCardPress = () => {
    // Close any open swipeable before navigating
    if (openSwipeableId) {
      setOpenSwipeableId(null);
      return;
    }
    router.push(`/session/${session.id}`);
  };

  const cardContent = (
    <TouchableOpacity
      style={[styles.container, isDark && styles.containerDark]}
      onPress={handleCardPress}
      activeOpacity={0.7}
      disabled={isPending}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text
            style={[styles.machineName, isDark && styles.machineNameDark]}
            numberOfLines={2}
          >
            {session.title || machine?.name || 'Unknown Machine'}
          </Text>
          <View
            style={[
              styles.statusDot,
              isActive && isCliOnline
                ? styles.statusActive
                : isActive
                  ? styles.statusOffline
                  : styles.statusInactive,
            ]}
          />
        </View>
        <Text style={[styles.statusText, isDark && styles.statusTextDark]}>
          {isActive ? (isCliOnline ? 'Active' : 'Offline') : 'Ended'}
        </Text>
      </View>

      {session.working_directory && (
        <Text
          style={[styles.directory, isDark && styles.directoryDark]}
          numberOfLines={1}
        >
          {session.working_directory}
        </Text>
      )}

      <View style={styles.footer}>
        <Text style={[styles.timestamp, isDark && styles.timestampDark]}>
          Started {formatTime(session.started_at)}
        </Text>
        {session.ended_at && (
          <Text style={[styles.timestamp, isDark && styles.timestampDark]}>
            • Ended {formatTime(session.ended_at)}
          </Text>
        )}
      </View>

      {/* Loading overlay */}
      {isPending && (
        <View style={[styles.loadingOverlay, isDark && styles.loadingOverlayDark]}>
          <ActivityIndicator size="small" color={isDark ? '#ffffff' : '#3b82f6'} />
          <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
            {isActive ? 'Disconnecting...' : 'Deleting...'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  // Wrap all sessions in Swipeable (active = disconnect, ended = delete)
  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      friction={2}
      rightThreshold={40}
      onSwipeableWillOpen={handleSwipeableOpen}
    >
      {cardContent}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  containerDark: {
    backgroundColor: '#1f1f1f',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  machineName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flexShrink: 1,
  },
  machineNameDark: {
    color: '#f3f4f6',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: '#22c55e',
  },
  statusOffline: {
    backgroundColor: '#f59e0b', // Orange for active but offline
  },
  statusInactive: {
    backgroundColor: '#9ca3af',
  },
  statusText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
  },
  statusTextDark: {
    color: '#9ca3af',
  },
  directory: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#4b5563',
    marginBottom: 8,
  },
  directoryDark: {
    color: '#9ca3af',
  },
  footer: {
    flexDirection: 'row',
    gap: 4,
  },
  timestamp: {
    fontSize: 12,
    color: '#9ca3af',
  },
  timestampDark: {
    color: '#6b7280',
  },
  // Swipe actions
  swipeActions: {
    marginVertical: 6,
    marginRight: 16,
    justifyContent: 'center',
  },
  actionButton: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: '100%',
    borderRadius: 12,
  },
  disconnectButton: {
    backgroundColor: '#f59e0b',
  },
  deleteButton: {
    backgroundColor: '#ef4444',
  },
  actionButtonInner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  // Loading overlay
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  loadingOverlayDark: {
    backgroundColor: 'rgba(31, 31, 31, 0.9)',
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3b82f6',
  },
  loadingTextDark: {
    color: '#ffffff',
  },
});
