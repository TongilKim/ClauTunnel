import React, { useState, useCallback } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  NativeSyntheticEvent,
  TextInputContentSizeChangeEventData,
  Alert,
  Image,
  ScrollView,
  Text,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useConnectionStore } from '../stores/connectionStore';
import { convertImageToBase64 } from '../utils/imageUtils';
import { getModelBadgeState } from '../utils/modelBadgeState';
import { getPermissionModeBadgeState } from '../utils/permissionModeBadgeState';
import { CommandPicker } from './CommandPicker';
import { ModelPicker } from './ModelPicker';
import { InteractivePicker } from './InteractivePicker';
import { ResumeSessionPicker } from './ResumeSessionPicker';
import type { SlashCommand, InteractiveCommandType } from 'clautunnel-shared';
import { MIN_INPUT_HEIGHT, MAX_INPUT_HEIGHT } from '../utils/inputBarConstants';

// Commands that require interactive UI instead of text input
const INTERACTIVE_COMMANDS = new Set<string>([
  'config',
  'permissions',
  'allowed-tools',
  'vim',
  'mcp',
  'agents',
  'hooks',
]);

interface InputBarProps {
  disabled?: boolean;
}

export function InputBar({ disabled }: InputBarProps) {
  const [input, setInput] = useState('');
  const [isScrollEnabled, setIsScrollEnabled] = useState(false);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [showCommandPicker, setShowCommandPicker] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [showInteractivePicker, setShowInteractivePicker] = useState(false);
  const [showResumeSessionPicker, setShowResumeSessionPicker] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const {
    sendInput,
    sendModelChange,
    sendCancelRequest,
    sendClearRequest,
    sendResumeRequest,
    state,
    commands,
    isTyping,
    model,
    availableModels,
    isModelChanging,
    permissionMode,
    interactiveData,
    isInteractiveLoading,
    interactiveError,
    requestInteractiveCommand,
    applyInteractiveChange,
    clearInteractive,
    clearMessages,
    sessionId,
  } = useConnectionStore();
  const isDisabled = disabled || state !== 'connected' || isSending || isTyping;

  // Compute model badge state
  const modelBadge = getModelBadgeState({
    model,
    availableModels,
    isModelChanging,
  });
  const permissionModeBadge = getPermissionModeBadgeState(permissionMode);

  const permissionModeBadgeToneStyle =
    permissionModeBadge.tone === 'warning'
      ? styles.modeBadge_warning
      : permissionModeBadge.tone === 'info'
        ? styles.modeBadge_info
        : permissionModeBadge.tone === 'danger'
          ? styles.modeBadge_danger
          : styles.modeBadge_neutral;
  const permissionModeTextToneStyle =
    permissionModeBadge.tone === 'warning'
      ? styles.modeText_warning
      : permissionModeBadge.tone === 'info'
        ? styles.modeText_info
        : permissionModeBadge.tone === 'danger'
          ? styles.modeText_danger
          : styles.modeText_neutral;

  // Placeholder text based on connection state (not typing/sending state)
  const placeholderText =
    state !== 'connected'
      ? 'Session disconnected'
      : disabled
        ? 'CLI offline'
        : 'Message Claude...';

  const handleSend = async () => {
    if (!input.trim() || isDisabled || isSending) {
      return;
    }

    setIsSending(true);

    try {
      // Convert images to base64 attachments
      const attachments = await Promise.all(
        selectedImages.map((uri) => convertImageToBase64(uri))
      );

      const messageContent = input.trim();
      setInput('');
      setSelectedImages([]);

      await sendInput(messageContent + '\n', attachments.length > 0 ? attachments : undefined);
    } catch {
      // Error handling - silently fail
    } finally {
      setIsSending(false);
    }
  };

  const takePhoto = async () => {
    try {
      let permission = await ImagePicker.getCameraPermissionsAsync();

      if (!permission.granted) {
        if (permission.canAskAgain) {
          permission = await ImagePicker.requestCameraPermissionsAsync();
        }
        if (!permission.granted) {
          Alert.alert(
            'Camera Access Required',
            'Please enable camera access in your device settings to take photos.',
          );
          return;
        }
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });
      if (!result.canceled && result.assets[0]) {
        setSelectedImages((prev) => [...prev, result.assets[0].uri]);
      }
    } catch (error) {
      console.error('[InputBar] Take photo error:', error);
      Alert.alert('Error', `Failed to open camera: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const chooseFromLibrary = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Photo Library Access Required',
          'Please enable photo library access in your device settings.',
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (!result.canceled) {
        const uris = result.assets.map(asset => asset.uri);
        setSelectedImages((prev) => [...prev, ...uris]);
      }
    } catch (error) {
      console.error('[InputBar] Choose from library error:', error);
      Alert.alert('Error', `Failed to open photo library: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleAttachment = async () => {
    Alert.alert(
      'Add Attachment',
      'Choose an option',
      [
        {
          text: 'Take Photo',
          onPress: () => { takePhoto(); },
        },
        {
          text: 'Choose from Library',
          onPress: () => { chooseFromLibrary(); },
        },
        {
          text: 'Cancel',
          style: 'cancel',
        },
      ]
    );
  };

  const handleContentSizeChange = useCallback(
    (event: NativeSyntheticEvent<TextInputContentSizeChangeEventData>) => {
      const contentHeight = event.nativeEvent.contentSize.height;
      setIsScrollEnabled(contentHeight >= MAX_INPUT_HEIGHT);
    },
    []
  );

  const handleCancel = async () => {
    await sendCancelRequest();
  };

  const canSend = input.trim() && !isDisabled;

  const removeImage = (index: number) => {
    setSelectedImages(selectedImages.filter((_, i) => i !== index));
  };

  const handleCommandSelect = (command: SlashCommand) => {
    // Handle /model command - open ModelPicker
    if (command.name === 'model') {
      setShowModelPicker(true);
      setShowCommandPicker(false);
      return;
    }

    // Handle /clear command - show confirmation
    if (command.name === 'clear') {
      setShowCommandPicker(false);
      Alert.alert(
        'Clear Conversation',
        'This will clear all messages and reset the conversation with Claude. This cannot be undone.',
        [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Clear',
            style: 'destructive',
            onPress: async () => {
              // Clear local messages
              clearMessages();
              // Send clear request to CLI to reset Claude's session
              await sendClearRequest();
            },
          },
        ]
      );
      return;
    }

    // Handle /resume command - show session picker
    if (command.name === 'resume') {
      setShowResumeSessionPicker(true);
      setShowCommandPicker(false);
      return;
    }

    // Check if this is an interactive command
    if (INTERACTIVE_COMMANDS.has(command.name)) {
      requestInteractiveCommand(command.name as InteractiveCommandType);
      setShowInteractivePicker(true);
      setShowCommandPicker(false);
      return;
    }

    // Regular command - insert into input
    setInput(`/${command.name} `);
    setShowCommandPicker(false);
  };

  const handleInteractiveClose = () => {
    setShowInteractivePicker(false);
    clearInteractive();
  };

  const handleResumeSessionSelect = async (selectedSessionId: string) => {
    setShowResumeSessionPicker(false);
    // Send resume request (doesn't appear in chat)
    await sendResumeRequest(selectedSessionId);
  };

  const handleCommandsPress = () => {
    setShowCommandPicker(true);
  };

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={[styles.inputCard, isDark && styles.inputCardDark]}>
        {/* Input area */}
        <TextInput
          style={[
            styles.input,
            isDark && styles.inputDark,
          ]}
          value={input}
          onChangeText={setInput}
          placeholder={placeholderText}
          placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
          editable={!isDisabled}
          autoCapitalize="sentences"
          autoCorrect={true}
          multiline={true}
          textAlignVertical="top"
          onContentSizeChange={handleContentSizeChange}
          blurOnSubmit={false}
          scrollEnabled={isScrollEnabled}
        />

        {/* Image previews */}
        {selectedImages.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.imagePreviewContainer}
            contentContainerStyle={styles.imagePreviewContent}
          >
            {selectedImages.map((uri, index) => (
              <View key={index} style={styles.imagePreviewWrapper}>
                <Image source={{ uri }} style={styles.imagePreview} />
                <TouchableOpacity
                  style={styles.removeImageButton}
                  onPress={() => removeImage(index)}
                >
                  <Text style={styles.removeImageText}>×</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Bottom toolbar */}
        <View style={[styles.toolbar, isDark && styles.toolbarDark]}>
          <View style={styles.toolbarLeft}>
            <TouchableOpacity
              style={[styles.attachButton, isDisabled && styles.attachButtonDisabled]}
              onPress={handleAttachment}
              disabled={isDisabled}
            >
              <View style={[styles.imageIcon, isDark && styles.imageIconDark]}>
                <View style={[styles.imageIconMountain, isDark && styles.imageIconMountainDark]} />
                <View style={[styles.imageIconSun, isDark && styles.imageIconSunDark]} />
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.commandsButton, isDisabled && styles.commandsButtonDisabled]}
              onPress={handleCommandsPress}
              disabled={isDisabled}
            >
              <Text style={[styles.commandsButtonText, isDark && styles.commandsButtonTextDark]}>/</Text>
            </TouchableOpacity>
            {modelBadge.visible && (
              <View style={[styles.modelBadge, isDark && styles.modelBadgeDark]}>
                {modelBadge.showSpinner ? (
                  <ActivityIndicator size="small" color={isDark ? '#9ca3af' : '#6b7280'} />
                ) : (
                  <Text style={[styles.modelBadgeText, isDark && styles.modelBadgeTextDark]}>
                    {modelBadge.displayText}
                  </Text>
                )}
              </View>
            )}
            {permissionModeBadge.visible && (
              <View style={[styles.modeBadge, permissionModeBadgeToneStyle]}>
                <Text style={[styles.modeText, permissionModeTextToneStyle]} numberOfLines={1}>
                  {permissionModeBadge.label}
                </Text>
              </View>
            )}
          </View>
          {isTyping ? (
            <TouchableOpacity
              style={[styles.sendButton, styles.stopButtonActive]}
              onPress={handleCancel}
            >
              <View style={styles.stopSquare} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                styles.sendButton,
                isDark && styles.sendButtonDark,
                canSend && styles.sendButtonActive,
              ]}
              onPress={handleSend}
              disabled={!canSend}
            >
              <View style={[styles.sendArrow, canSend && styles.sendArrowActive]}>
                <View style={[styles.arrowUp, canSend && styles.arrowUpActive]} />
                <View style={[styles.arrowStem, canSend && styles.arrowStemActive]} />
              </View>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <CommandPicker
        visible={showCommandPicker}
        commands={commands}
        onSelect={handleCommandSelect}
        onClose={() => setShowCommandPicker(false)}
      />

      <ModelPicker
        visible={showModelPicker}
        models={availableModels}
        currentModel={model}
        onSelect={(selectedModel) => {
          sendModelChange(selectedModel.value);
          setShowModelPicker(false);
        }}
        onClose={() => setShowModelPicker(false)}
      />

      <InteractivePicker
        visible={showInteractivePicker}
        data={interactiveData}
        isLoading={isInteractiveLoading}
        error={interactiveError}
        onApply={applyInteractiveChange}
        onClose={handleInteractiveClose}
      />

      <ResumeSessionPicker
        visible={showResumeSessionPicker}
        currentSessionId={sessionId}
        onSelect={handleResumeSessionSelect}
        onClose={() => setShowResumeSessionPicker(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  inputCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 8,
  },
  inputCardDark: {
    backgroundColor: '#1f1f1f',
    borderColor: '#374151',
  },
  input: {
    minHeight: MIN_INPUT_HEIGHT,
    maxHeight: MAX_INPUT_HEIGHT,
    fontSize: 15,
    color: '#1f2937',
    lineHeight: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  inputDark: {
    color: '#e5e5e5',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 8,
  },
  toolbarDark: {
    borderTopColor: '#374151',
  },
  toolbarLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sendButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDark: {
    backgroundColor: '#374151',
  },
  sendButtonActive: {
    backgroundColor: '#d4a574',
  },
  stopButtonActive: {
    backgroundColor: '#ef4444',
  },
  stopSquare: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
  sendArrow: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendArrowActive: {},
  arrowUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 5,
    borderRightWidth: 5,
    borderBottomWidth: 6,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#9ca3af',
  },
  arrowUpActive: {
    borderBottomColor: '#ffffff',
  },
  arrowStem: {
    width: 2,
    height: 6,
    backgroundColor: '#9ca3af',
    marginTop: -1,
  },
  arrowStemActive: {
    backgroundColor: '#ffffff',
  },
  // Image preview
  imagePreviewContainer: {
    marginTop: 8,
    marginBottom: 4,
  },
  imagePreviewContent: {
    gap: 8,
  },
  imagePreviewWrapper: {
    position: 'relative',
  },
  imagePreview: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  removeImageButton: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeImageText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 16,
  },
  // Attachment button
  attachButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attachButtonDisabled: {
    opacity: 0.5,
  },
  // Commands button
  commandsButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 4,
  },
  commandsButtonDisabled: {
    opacity: 0.5,
  },
  commandsButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
  },
  commandsButtonTextDark: {
    color: '#9ca3af',
  },
  // Model badge
  modelBadge: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelBadgeDark: {
    backgroundColor: '#374151',
  },
  modelBadgeText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  modelBadgeTextDark: {
    color: '#9ca3af',
  },
  // Permission mode badge
  modeBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 8,
    maxWidth: 130,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modeBadge_neutral: {
    backgroundColor: '#f3f4f6',
  },
  modeBadge_warning: {
    backgroundColor: '#fef3c7',
  },
  modeBadge_info: {
    backgroundColor: '#dbeafe',
  },
  modeBadge_danger: {
    backgroundColor: '#fee2e2',
  },
  modeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  modeText_neutral: {
    color: '#4b5563',
  },
  modeText_warning: {
    color: '#92400e',
  },
  modeText_info: {
    color: '#1e40af',
  },
  modeText_danger: {
    color: '#b91c1c',
  },
  imageIcon: {
    width: 20,
    height: 16,
    borderWidth: 1.5,
    borderColor: '#6b7280',
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  imageIconDark: {
    borderColor: '#9ca3af',
  },
  imageIconMountain: {
    position: 'absolute',
    bottom: 1,
    left: 2,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#6b7280',
  },
  imageIconMountainDark: {
    borderBottomColor: '#9ca3af',
  },
  imageIconSun: {
    position: 'absolute',
    top: 2,
    right: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#6b7280',
  },
  imageIconSunDark: {
    backgroundColor: '#9ca3af',
  },
});
