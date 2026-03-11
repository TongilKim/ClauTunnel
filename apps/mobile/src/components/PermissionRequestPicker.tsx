import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PermissionRequestData } from 'clautunnel-shared';

interface PermissionRequestPickerProps {
  visible: boolean;
  requestData: PermissionRequestData | null;
  onAllow: () => void;
  onDeny: (message?: string) => void;
  onClose: () => void;
}

export function PermissionRequestPicker({
  visible,
  requestData,
  onAllow,
  onDeny,
  onClose,
}: PermissionRequestPickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const handleAllow = () => {
    onAllow();
  };

  const handleDeny = () => {
    onDeny('Permission denied by user');
  };

  if (!requestData) return null;

  // Format tool input for display
  const formatInput = (input: Record<string, unknown>): string => {
    try {
      return JSON.stringify(input, null, 2);
    } catch {
      return String(input);
    }
  };

  // Get a human-readable description based on tool name
  const getToolDescription = (toolName: string): string => {
    const descriptions: Record<string, string> = {
      WebSearch: 'Search the web for information',
      WebFetch: 'Fetch content from a URL',
      Bash: 'Execute a shell command',
      Read: 'Read a file',
      Write: 'Write to a file',
      Edit: 'Edit a file',
      Glob: 'Search for files',
      Grep: 'Search file contents',
      Task: 'Run a background task',
    };
    return descriptions[toolName] || `Use the ${toolName} tool`;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.backdrop} />
        <View
          testID="permission-request-modal"
          style={[
            styles.sheet,
            isDark && styles.sheetDark,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.handle} />

          <Text style={[styles.title, isDark && styles.titleDark]}>
            Permission Required
          </Text>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.requestBlock}>
              {/* Tool name badge */}
              <View style={[styles.headerBadge, isDark && styles.headerBadgeDark]}>
                <Text testID="permission-tool-name" style={[styles.headerText, isDark && styles.headerTextDark]}>
                  {requestData.toolName}
                </Text>
              </View>

              {/* Description */}
              <Text style={[styles.questionText, isDark && styles.questionTextDark]}>
                {getToolDescription(requestData.toolName)}
              </Text>

              {/* Decision reason if available */}
              {requestData.decisionReason && (
                <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
                  <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>
                    Reason
                  </Text>
                  <Text style={[styles.infoText, isDark && styles.infoTextDark]}>
                    {requestData.decisionReason}
                  </Text>
                </View>
              )}

              {/* Blocked path if available */}
              {requestData.blockedPath && (
                <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
                  <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>
                    Path
                  </Text>
                  <Text style={[styles.pathText, isDark && styles.pathTextDark]}>
                    {requestData.blockedPath}
                  </Text>
                </View>
              )}

              {/* Tool input preview */}
              <View style={[styles.infoCard, isDark && styles.infoCardDark]}>
                <Text style={[styles.infoLabel, isDark && styles.infoLabelDark]}>
                  Input
                </Text>
                <ScrollView
                  style={styles.inputScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  <Text style={[styles.codeText, isDark && styles.codeTextDark]}>
                    {formatInput(requestData.toolInput)}
                  </Text>
                </ScrollView>
              </View>
            </View>
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              testID="permission-allow-button"
              style={[styles.allowButton, isDark && styles.allowButtonDark]}
              onPress={handleAllow}
            >
              <Text style={styles.allowButtonText}>Allow</Text>
            </TouchableOpacity>

            <TouchableOpacity
              testID="permission-deny-button"
              style={[styles.denyButton, isDark && styles.denyButtonDark]}
              onPress={handleDeny}
            >
              <Text style={[styles.denyButtonText, isDark && styles.denyButtonTextDark]}>
                Deny
              </Text>
            </TouchableOpacity>
          </View>

          {/* Cancel button */}
          <TouchableOpacity
            style={[styles.cancelButton, isDark && styles.cancelButtonDark]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, isDark && styles.cancelTextDark]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 16,
    maxHeight: '85%',
  },
  sheetDark: {
    backgroundColor: '#1f1f1f',
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#d1d5db',
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  titleDark: {
    color: '#f9fafb',
  },
  content: {
    maxHeight: 400,
  },
  requestBlock: {
    marginBottom: 24,
  },
  // Badge - matches UserQuestionPicker headerBadge
  headerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  headerBadgeDark: {
    backgroundColor: '#374151',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
    textTransform: 'uppercase',
  },
  headerTextDark: {
    color: '#9ca3af',
  },
  // Description - matches UserQuestionPicker questionText
  questionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
    marginBottom: 12,
    lineHeight: 22,
  },
  questionTextDark: {
    color: '#e5e7eb',
  },
  // Info cards - matches UserQuestionPicker option cards
  infoCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  infoCardDark: {
    backgroundColor: '#2d2d2d',
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoLabelDark: {
    color: '#9ca3af',
  },
  infoText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  infoTextDark: {
    color: '#d1d5db',
  },
  pathText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#374151',
  },
  pathTextDark: {
    color: '#d1d5db',
  },
  inputScroll: {
    maxHeight: 120,
  },
  codeText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#374151',
    lineHeight: 18,
  },
  codeTextDark: {
    color: '#d1d5db',
  },
  // Buttons
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  allowButton: {
    flex: 1,
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  allowButtonDark: {
    backgroundColor: '#2563eb',
  },
  allowButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  denyButton: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  denyButtonDark: {
    backgroundColor: '#2d2d2d',
    borderColor: '#374151',
  },
  denyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  denyButtonTextDark: {
    color: '#9ca3af',
  },
  cancelButton: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  cancelButtonDark: {
    backgroundColor: '#374151',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  cancelTextDark: {
    color: '#d1d5db',
  },
});
