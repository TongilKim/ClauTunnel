import { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, Stack, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectionStore } from '../../src/stores/connectionStore';
import { useSessionStore } from '../../src/stores/sessionStore';
import { Terminal } from '../../src/components/Terminal';
import { InputBar } from '../../src/components/InputBar';
import { UserQuestionPicker } from '../../src/components/UserQuestionPicker';
import { PermissionRequestPicker } from '../../src/components/PermissionRequestPicker';
import { TestModePanel } from '../../src/components/TestModePanel';
import { isTestMode, MOCK_MESSAGES } from '../../src/utils/testMode';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const {
    connect,
    disconnect,
    state,
    requestModels,
    pendingQuestion,
    sendUserAnswer,
    clearPendingQuestion,
    pendingPermissionRequest,
    sendPermissionResponse,
    clearPendingPermissionRequest,
  } = useConnectionStore();

  const { sessions, updateSessionTitle, sessionOnlineStatus } = useSessionStore();
  const isCliOnline = sessionOnlineStatus[id!] ?? null;
  const session = sessions.find((s) => s.id === id);

  const handleEditTitle = () => {
    Alert.prompt(
      'Rename Session',
      'Enter a new name for this session',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (value?: string) => {
            if (value !== undefined && id) {
              updateSessionTitle(id, value);
            }
          },
        },
      ],
      'plain-text',
      session?.title || ''
    );
  };

  // Compute effective status for badge display
  const effectiveStatus =
    state === 'connected' && isCliOnline === false
      ? 'cliOffline'
      : state === 'connected'
        ? 'online'
        : state === 'connecting' || state === 'reconnecting'
          ? 'connecting'
          : 'disconnected';

  useEffect(() => {
    if (isTestMode()) {
      // In test mode, inject mock connection state instead of connecting to Supabase
      useConnectionStore.setState({
        state: 'connected',
        sessionId: id || null,
        messages: MOCK_MESSAGES,
        lastSeq: 3,
        isTyping: false,
        isCliOnline: true,
      });
      return;
    }

    if (id) {
      connect(id);
    }

    return () => {
      if (!isTestMode()) {
        disconnect();
      }
    };
  }, [id]);

  // Request available models when connected
  useEffect(() => {
    if (isTestMode()) return;
    if (state === 'connected') {
      requestModels();
    }
  }, [state]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <Stack.Screen options={{ headerShown: false }} />
      {/* Custom Header */}
      <View style={[styles.header, isDark && styles.headerDark, { paddingTop: insets.top }]}>
        <TouchableOpacity testID="session-back-button" onPress={() => router.back()} style={styles.backButton}>
          <Text style={[styles.backText, isDark && styles.backTextDark]}>‹ Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleEditTitle} style={styles.titleButton}>
          <Text
            testID="session-title"
            style={[styles.headerTitle, isDark && styles.headerTitleDark]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {session?.title || 'Session'}
          </Text>
          <Text style={[styles.editIcon, isDark && styles.editIconDark]}>✎</Text>
        </TouchableOpacity>
        <View testID="session-status-badge" style={[styles.statusBadge, styles[`statusBadge_${effectiveStatus}`]]}>
          <View style={[styles.statusDot, styles[`statusDot_${effectiveStatus}`]]} />
          <Text style={[styles.statusText, styles[`statusText_${effectiveStatus}`]]}>
            {effectiveStatus === 'online'
              ? 'Online'
              : effectiveStatus === 'cliOffline'
                ? 'CLI Offline'
                : effectiveStatus === 'connecting'
                  ? 'Connecting'
                  : 'Disconnected'}
          </Text>
        </View>
      </View>
      <Terminal />
      <View style={{ paddingBottom: insets.bottom }}>
        <InputBar disabled={state !== 'connected' || isCliOnline === false} />
      </View>

      {/* User Question Picker (for AskUserQuestion tool) */}
      <UserQuestionPicker
        visible={pendingQuestion !== null}
        questionData={pendingQuestion}
        onSubmit={sendUserAnswer}
        onClose={clearPendingQuestion}
      />

      {/* Permission Request Picker (for SDK canUseTool callback) */}
      <PermissionRequestPicker
        visible={pendingPermissionRequest !== null}
        requestData={pendingPermissionRequest}
        onAllow={() => sendPermissionResponse('allow')}
        onDeny={(message) => sendPermissionResponse('deny', message)}
        onClose={clearPendingPermissionRequest}
      />

      {/* Test mode panel for E2E testing */}
      <TestModePanel />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  // Custom header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerDark: {
    backgroundColor: '#0a0a0a',
    borderBottomColor: '#374151',
  },
  backButton: {
    flexShrink: 0,
    paddingVertical: 8,
    marginRight: 10,
  },
  backText: {
    fontSize: 17,
    color: '#3b82f6',
  },
  backTextDark: {
    color: '#60a5fa',
  },
  titleButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginHorizontal: 8,
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
    flexShrink: 1,
    textAlign: 'center',
  },
  headerTitleDark: {
    color: '#ffffff',
  },
  editIcon: {
    fontSize: 14,
    color: '#6b7280',
  },
  editIconDark: {
    color: '#9ca3af',
  },
  // Status badge
  statusBadge: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 6,
  },
  statusBadge_online: {
    backgroundColor: '#dcfce7',
  },
  statusBadge_cliOffline: {
    backgroundColor: '#fef3c7',
  },
  statusBadge_connecting: {
    backgroundColor: '#fef3c7',
  },
  statusBadge_disconnected: {
    backgroundColor: '#f3f4f6',
  },
  // Status dot
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDot_online: {
    backgroundColor: '#22c55e',
  },
  statusDot_cliOffline: {
    backgroundColor: '#f59e0b',
  },
  statusDot_connecting: {
    backgroundColor: '#f59e0b',
  },
  statusDot_disconnected: {
    backgroundColor: '#9ca3af',
  },
  // Status text
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusText_online: {
    color: '#166534',
  },
  statusText_cliOffline: {
    color: '#92400e',
  },
  statusText_connecting: {
    color: '#92400e',
  },
  statusText_disconnected: {
    color: '#6b7280',
  },
});
