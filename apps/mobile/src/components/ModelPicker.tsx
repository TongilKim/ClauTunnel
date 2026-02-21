import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ModelInfo } from 'clautunnel-shared';

interface ModelPickerProps {
  visible: boolean;
  models: ModelInfo[];
  currentModel: string | null;
  onSelect: (model: ModelInfo) => void;
  onClose: () => void;
}

// Check if currentModel matches a model option (handles both shorthand and full identifiers)
function isModelSelected(currentModel: string | null, modelValue: string): boolean {
  if (!currentModel) return false;

  // Direct match
  if (currentModel === modelValue) return true;

  // Shorthand to full identifier matching
  if (modelValue === 'opus' && currentModel.includes('opus')) return true;
  if (modelValue === 'sonnet' && currentModel.includes('sonnet')) return true;
  if (modelValue === 'haiku' && currentModel.includes('haiku')) return true;

  // Full identifier to shorthand matching
  if (currentModel === 'opus' && modelValue.includes('opus')) return true;
  if (currentModel === 'sonnet' && modelValue.includes('sonnet')) return true;
  if (currentModel === 'haiku' && modelValue.includes('haiku')) return true;

  return false;
}

export function ModelPicker({
  visible,
  models,
  currentModel,
  onSelect,
  onClose,
}: ModelPickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheet,
            isDark && styles.sheetDark,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.handle} />
          <Text style={[styles.title, isDark && styles.titleDark]}>
            Select Model
          </Text>

          {models.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
                Models will be available after sending your first message to Claude.
              </Text>
              <Text style={[styles.defaultModelText, isDark && styles.defaultModelTextDark]}>
                Default model: Opus 4.6
              </Text>
            </View>
          ) : (
            <View style={styles.optionsList}>
              {models.map((model) => {
                const isSelected = isModelSelected(currentModel, model.value);
                return (
                  <TouchableOpacity
                    key={model.value}
                    style={[
                      styles.option,
                      isDark && styles.optionDark,
                      isSelected && styles.optionSelected,
                      isSelected && isDark && styles.optionSelectedDark,
                    ]}
                    onPress={() => onSelect(model)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionContent}>
                      <View style={styles.optionHeader}>
                        <Text
                          style={[
                            styles.modelName,
                            isDark && styles.modelNameDark,
                            isSelected && styles.modelNameSelected,
                          ]}
                        >
                          {model.displayName}
                        </Text>
                        {isSelected && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.modelVersion,
                          isDark && styles.modelVersionDark,
                        ]}
                      >
                        {model.value === 'opus'
                          ? 'claude-opus-4-6'
                          : model.value === 'haiku'
                          ? 'claude-3-5-haiku-20241022'
                          : model.value}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <TouchableOpacity
            style={[styles.cancelButton, isDark && styles.cancelButtonDark]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, isDark && styles.cancelTextDark]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </View>
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
    maxHeight: '80%',
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
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 16,
  },
  titleDark: {
    color: '#f9fafb',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyTextDark: {
    color: '#9ca3af',
  },
  defaultModelText: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 8,
  },
  defaultModelTextDark: {
    color: '#6b7280',
  },
  optionsList: {
    gap: 8,
  },
  option: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionDark: {
    backgroundColor: '#2d2d2d',
  },
  optionSelected: {
    borderColor: '#6d28d9',
    backgroundColor: '#ede9fe',
  },
  optionSelectedDark: {
    borderColor: '#8b5cf6',
    backgroundColor: '#4c1d95',
  },
  optionContent: {
    gap: 4,
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modelName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  modelNameDark: {
    color: '#f9fafb',
  },
  modelNameSelected: {
    color: '#6d28d9',
  },
  modelVersion: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  modelVersionDark: {
    color: '#6b7280',
  },
  checkmark: {
    fontSize: 16,
    color: '#6d28d9',
    fontWeight: '600',
  },
  cancelButton: {
    marginTop: 16,
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
