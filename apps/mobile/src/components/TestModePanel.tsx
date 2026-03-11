import React, { useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import {
  buildMockMarkdownOverflowRiskMessage,
  buildMockToolUseWidthMessage,
  isTestMode,
  MOCK_QUESTION_DATA,
  MOCK_PERMISSION_REQUEST,
} from '../utils/testMode';
import { useConnectionStore } from '../stores/connectionStore';

export function TestModePanel() {
  const [expanded, setExpanded] = useState(false);

  if (!isTestMode()) return null;

  const injectQuestion = () => {
    useConnectionStore.setState({ pendingQuestion: MOCK_QUESTION_DATA });
  };

  const injectPermission = () => {
    useConnectionStore.setState({ pendingPermissionRequest: MOCK_PERMISSION_REQUEST });
  };

  const injectMarkdownOverflowRisk = () => {
    const { messages, lastSeq, scrollToBottom } = useConnectionStore.getState();
    const nextMessage = buildMockMarkdownOverflowRiskMessage(lastSeq + 1);

    useConnectionStore.setState({
      messages: [...messages, nextMessage],
      lastSeq: nextMessage.seq,
    });

    setTimeout(() => {
      scrollToBottom();
    }, 50);
  };

  const injectToolUseWidthPreview = () => {
    const { messages, lastSeq, scrollToBottom } = useConnectionStore.getState();
    const nextMessage = buildMockToolUseWidthMessage(lastSeq + 1);

    useConnectionStore.setState({
      messages: [...messages, nextMessage],
      lastSeq: nextMessage.seq,
    });

    setTimeout(() => {
      scrollToBottom();
    }, 50);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        testID="test-mode-toggle"
        style={styles.toggleButton}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.toggleText}>T</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.panel}>
          <TouchableOpacity
            testID="test-mode-trigger-question"
            style={styles.button}
            onPress={injectQuestion}
          >
            <Text style={styles.buttonText}>Inject Question</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="test-mode-trigger-permission"
            style={styles.button}
            onPress={injectPermission}
          >
            <Text style={styles.buttonText}>Inject Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="test-mode-trigger-markdown-overflow"
            style={styles.button}
            onPress={injectMarkdownOverflowRisk}
          >
            <Text style={styles.buttonText}>Inject Markdown Wrap</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="test-mode-trigger-tool-use-width"
            style={styles.button}
            onPress={injectToolUseWidthPreview}
          >
            <Text style={styles.buttonText}>Inject Tool Use</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 120,
    right: 16,
    zIndex: 9999,
    alignItems: 'flex-end',
  },
  toggleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  panel: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    borderRadius: 12,
    padding: 8,
    marginTop: 8,
    gap: 6,
  },
  button: {
    backgroundColor: 'rgba(59, 130, 246, 0.8)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
});
