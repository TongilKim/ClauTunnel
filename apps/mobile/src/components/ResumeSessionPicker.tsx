import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../services/supabase';
import type { Session } from 'clautunnel-shared';
import {
  getSessionLabel,
  canResumeSession,
  filterResumableSessions,
} from '../utils/resumeSessionUtils';
import { isTestMode } from '../utils/testMode';
import { useSessionStore } from '../stores/sessionStore';

interface ResumeSessionPickerProps {
  visible: boolean;
  currentSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onClose: () => void;
}

export function ResumeSessionPicker({
  visible,
  currentSessionId,
  onSelect,
  onClose,
}: ResumeSessionPickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      fetchRecentSessions();
    }
  }, [visible]);

  const fetchRecentSessions = async () => {
    setIsLoading(true);
    setError(null);

    if (isTestMode()) {
      const sessions = useSessionStore
        .getState()
        .sessions.filter((session) => session.status !== 'active');
      setSessions(filterResumableSessions(sessions, currentSessionId));
      setIsLoading(false);
      return;
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('sessions')
        .select('*')
        .neq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(20);

      if (fetchError) {
        setError('Failed to fetch sessions');
        return;
      }

      setSessions(filterResumableSessions(data || [], currentSessionId));
    } catch {
      setError('Failed to fetch sessions');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          testID="resume-session-modal"
          style={[styles.content, isDark && styles.contentDark]}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, isDark && styles.titleDark]}>
            Resume Session
          </Text>
          <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
            Select a previous session to continue
          </Text>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={isDark ? '#9ca3af' : '#6b7280'} />
                <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
                  Loading sessions...
                </Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={[styles.errorText, isDark && styles.errorTextDark]}>
                  {error}
                </Text>
                <TouchableOpacity
                  style={[styles.retryButton, isDark && styles.retryButtonDark]}
                  onPress={fetchRecentSessions}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : sessions.length === 0 ? (
              <View testID="resume-session-empty" style={styles.emptyContainer}>
                <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
                  No previous sessions found
                </Text>
                <Text style={[styles.emptyHint, isDark && styles.emptyHintDark]}>
                  Only ended sessions can be resumed. End a session first, then come back here.
                </Text>
              </View>
            ) : (
              sessions.map((session) => {
                const canResume = canResumeSession(session);
                return (
                  <TouchableOpacity
                    key={session.id}
                    testID={`resume-session-option-${session.id}`}
                    style={[
                      styles.sessionItem,
                      isDark && styles.sessionItemDark,
                      !canResume && styles.sessionItemDisabled,
                    ]}
                    onPress={() => canResume && session.sdk_session_id && onSelect(session.sdk_session_id)}
                    activeOpacity={canResume ? 0.7 : 1}
                    disabled={!canResume}
                  >
                    <View style={styles.sessionHeader}>
                      <Text
                        style={[
                          styles.sessionName,
                          isDark && styles.sessionNameDark,
                          !canResume && styles.sessionNameDisabled,
                        ]}
                      >
                        {getSessionLabel(session)}
                      </Text>
                      <Text style={[styles.sessionTime, isDark && styles.sessionTimeDark]}>
                        {formatDate(session.started_at)}
                      </Text>
                    </View>
                    {session.working_directory && (
                      <Text
                        style={[styles.sessionPath, isDark && styles.sessionPathDark]}
                        numberOfLines={1}
                      >
                        {session.working_directory}
                      </Text>
                    )}
                    <View style={styles.sessionMeta}>
                      <View style={[styles.statusBadge, styles[`status_${session.status}`]]}>
                        <Text style={styles.statusText}>{session.status}</Text>
                      </View>
                      {session.model && (
                        <Text style={[styles.modelText, isDark && styles.modelTextDark]}>
                          {session.model}
                        </Text>
                      )}
                      {!canResume && (
                        <Text style={[styles.modelText, isDark && styles.modelTextDark]}>
                          No conversation
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: 300,
    maxHeight: '70%',
    paddingBottom: 34,
  },
  contentDark: {
    backgroundColor: '#1f1f1f',
  },
  handle: {
    width: 36,
    height: 5,
    backgroundColor: '#d1d5db',
    borderRadius: 2.5,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  titleDark: {
    color: '#f3f4f6',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 200,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  loadingContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },
  loadingTextDark: {
    color: '#9ca3af',
  },
  errorContainer: {
    padding: 32,
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
  },
  errorTextDark: {
    color: '#f87171',
  },
  retryButton: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryButtonDark: {
    backgroundColor: '#2563eb',
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
  emptyTextDark: {
    color: '#9ca3af',
  },
  emptyHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
  },
  emptyHintDark: {
    color: '#6b7280',
  },
  sessionItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  sessionItemDark: {
    backgroundColor: '#2d2d2d',
  },
  sessionItemDisabled: {
    opacity: 0.5,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  sessionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
    marginRight: 8,
  },
  sessionNameDark: {
    color: '#f3f4f6',
  },
  sessionNameDisabled: {
    color: '#9ca3af',
  },
  sessionTime: {
    fontSize: 12,
    color: '#6b7280',
    flexShrink: 0,
  },
  sessionTimeDark: {
    color: '#9ca3af',
  },
  sessionPath: {
    fontSize: 12,
    color: '#6b7280',
    fontFamily: 'monospace',
    marginBottom: 8,
  },
  sessionPathDark: {
    color: '#9ca3af',
  },
  sessionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  status_ended: {
    backgroundColor: '#fee2e2',
  },
  status_paused: {
    backgroundColor: '#fef3c7',
  },
  status_active: {
    backgroundColor: '#dcfce7',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
  },
  modelText: {
    fontSize: 12,
    color: '#6b7280',
  },
  modelTextDark: {
    color: '#9ca3af',
  },
});
