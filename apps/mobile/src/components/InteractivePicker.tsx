import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type {
  InteractiveCommandData,
  InteractiveOption,
  InteractiveApplyPayload,
} from 'clautunnel-shared';

interface InteractivePickerProps {
  visible: boolean;
  data: InteractiveCommandData | null;
  isLoading: boolean;
  error: string | null;
  onApply: (payload: InteractiveApplyPayload) => void;
  onClose: () => void;
}

export function InteractivePicker({
  visible,
  data,
  isLoading,
  error,
  onApply,
  onClose,
}: InteractivePickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  // For nested navigation
  const [navigationStack, setNavigationStack] = useState<InteractiveOption[]>([]);

  // For multi-select, track selected items
  const [multiSelected, setMultiSelected] = useState<Set<string>>(new Set());

  // Reset state when data changes
  React.useEffect(() => {
    if (data) {
      setNavigationStack([]);
      // Initialize multi-select with currently selected items
      if (data.uiType === 'multi-select') {
        const initialSelected = new Set(
          data.options
            .filter((opt) => opt.selected)
            .map((opt) => opt.id)
        );
        setMultiSelected(initialSelected);
      }
    }
  }, [data]);

  const currentOptions = navigationStack.length > 0
    ? navigationStack[navigationStack.length - 1].children || []
    : data?.options || [];

  const currentTitle = navigationStack.length > 0
    ? navigationStack[navigationStack.length - 1].label
    : data?.title || 'Settings';

  const handleOptionPress = (option: InteractiveOption) => {
    if (!data) return;

    // If option has children, navigate into it
    if (option.children && option.children.length > 0) {
      setNavigationStack([...navigationStack, option]);
      return;
    }

    // Handle different UI types
    switch (data.uiType) {
      case 'select':
        onApply({
          command: data.command,
          action: 'set',
          key: navigationStack.length > 0 ? navigationStack[navigationStack.length - 1].id : undefined,
          value: option.value,
        });
        onClose();
        break;

      case 'toggle':
        onApply({
          command: data.command,
          action: 'toggle',
          value: option.value,
        });
        onClose();
        break;

      case 'multi-select':
        // Toggle selection locally
        const newSelected = new Set(multiSelected);
        if (newSelected.has(option.id)) {
          newSelected.delete(option.id);
        } else {
          newSelected.add(option.id);
        }
        setMultiSelected(newSelected);
        break;

      case 'nested':
        // For nested items without children
        // Check if this is a boolean toggle (value is true/false)
        if (typeof option.value === 'boolean') {
          // Toggle the boolean value
          onApply({
            command: data.command,
            action: 'set',
            key: option.id,
            value: !option.value,
          });
          onClose();
        } else {
          // For non-boolean values, apply as-is
          onApply({
            command: data.command,
            action: 'set',
            key: navigationStack.length > 0 ? navigationStack[navigationStack.length - 1].id : option.id,
            value: option.value,
          });
          onClose();
        }
        break;
    }
  };

  const handleMultiSelectApply = () => {
    if (!data) return;
    const selectedValues = data.options
      .filter((opt) => multiSelected.has(opt.id))
      .map((opt) => opt.value);
    onApply({
      command: data.command,
      action: 'set',
      value: selectedValues,
    });
    onClose();
  };

  const handleBack = () => {
    if (navigationStack.length > 0) {
      setNavigationStack(navigationStack.slice(0, -1));
    }
  };

  const handleClose = () => {
    setNavigationStack([]);
    setMultiSelected(new Set());
    onClose();
  };

  const renderOption = (option: InteractiveOption) => {
    const isSelected = data?.uiType === 'multi-select'
      ? multiSelected.has(option.id)
      : option.selected || option.value === data?.currentValue;
    const hasChildren = option.children && option.children.length > 0;
    const isBooleanOption = typeof option.value === 'boolean' && !hasChildren && data?.uiType === 'nested';

    // For boolean options in nested view, render with a switch
    if (isBooleanOption) {
      return (
        <View
          key={option.id}
          style={[styles.toggleContainer, isDark && styles.toggleContainerDark]}
        >
          <View style={styles.toggleContent}>
            <Text style={[styles.toggleLabel, isDark && styles.toggleLabelDark]}>
              {option.label}
            </Text>
            {option.description && (
              <Text style={[styles.toggleDescription, isDark && styles.toggleDescriptionDark]}>
                {option.description}
              </Text>
            )}
          </View>
          <Switch
            value={Boolean(option.value)}
            onValueChange={() => handleOptionPress(option)}
            trackColor={{ false: '#767577', true: '#6d28d9' }}
            thumbColor={option.value ? '#ffffff' : '#f4f3f4'}
          />
        </View>
      );
    }

    return (
      <TouchableOpacity
        key={option.id}
        style={[
          styles.option,
          isDark && styles.optionDark,
          isSelected && !hasChildren && styles.optionSelected,
          isSelected && !hasChildren && isDark && styles.optionSelectedDark,
        ]}
        onPress={() => handleOptionPress(option)}
        activeOpacity={0.7}
      >
        <View style={styles.optionContent}>
          <View style={styles.optionHeader}>
            <Text
              style={[
                styles.optionLabel,
                isDark && styles.optionLabelDark,
                isSelected && !hasChildren && styles.optionLabelSelected,
              ]}
            >
              {option.label}
            </Text>
            {isSelected && !hasChildren && data?.uiType !== 'multi-select' && (
              <Text style={styles.checkmark}>✓</Text>
            )}
            {data?.uiType === 'multi-select' && (
              <View style={[
                styles.checkbox,
                isDark && styles.checkboxDark,
                isSelected && styles.checkboxSelected,
              ]}>
                {isSelected && <Text style={styles.checkboxCheck}>✓</Text>}
              </View>
            )}
            {hasChildren && (
              <Text style={[styles.chevron, isDark && styles.chevronDark]}>›</Text>
            )}
          </View>
          {option.description && (
            <Text
              style={[
                styles.optionDescription,
                isDark && styles.optionDescriptionDark,
              ]}
            >
              {option.description}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderToggle = () => {
    if (!data || data.options.length === 0) return null;
    const option = data.options[0];
    const isEnabled = Boolean(data.currentValue);

    return (
      <View style={[styles.toggleContainer, isDark && styles.toggleContainerDark]}>
        <View style={styles.toggleContent}>
          <Text style={[styles.toggleLabel, isDark && styles.toggleLabelDark]}>
            {option.label}
          </Text>
          {option.description && (
            <Text style={[styles.toggleDescription, isDark && styles.toggleDescriptionDark]}>
              {option.description}
            </Text>
          )}
        </View>
        <Switch
          value={isEnabled}
          onValueChange={() => handleOptionPress(option)}
          trackColor={{ false: '#767577', true: '#6d28d9' }}
          thumbColor={isEnabled ? '#ffffff' : '#f4f3f4'}
        />
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View
          style={[
            styles.sheet,
            isDark && styles.sheetDark,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.handle} />

          {/* Header with back button */}
          <View style={styles.header}>
            {navigationStack.length > 0 ? (
              <TouchableOpacity onPress={handleBack} style={styles.backButton}>
                <Text style={[styles.backText, isDark && styles.backTextDark]}>‹ Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.backButton} />
            )}
            <Text style={[styles.title, isDark && styles.titleDark]}>
              {currentTitle}
            </Text>
            <View style={styles.backButton} />
          </View>

          {/* Description */}
          {data?.description && navigationStack.length === 0 && (
            <Text style={[styles.description, isDark && styles.descriptionDark]}>
              {data.description}
            </Text>
          )}

          {/* Loading state */}
          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={isDark ? '#8b5cf6' : '#6d28d9'} />
              <Text style={[styles.loadingText, isDark && styles.loadingTextDark]}>
                Loading...
              </Text>
            </View>
          )}

          {/* Error state */}
          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Content */}
          {!isLoading && !error && data && (
            <>
              {data.uiType === 'toggle' ? (
                renderToggle()
              ) : (
                <ScrollView
                  style={styles.optionsList}
                  showsVerticalScrollIndicator={false}
                >
                  {currentOptions.map(renderOption)}
                </ScrollView>
              )}

              {/* Apply button for multi-select */}
              {data.uiType === 'multi-select' && (
                <TouchableOpacity
                  style={[styles.applyButton, isDark && styles.applyButtonDark]}
                  onPress={handleMultiSelectApply}
                >
                  <Text style={styles.applyButtonText}>
                    Apply ({multiSelected.size} selected)
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* Cancel button */}
          <TouchableOpacity
            style={[styles.cancelButton, isDark && styles.cancelButtonDark]}
            onPress={handleClose}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  backButton: {
    width: 60,
  },
  backText: {
    fontSize: 16,
    color: '#6d28d9',
  },
  backTextDark: {
    color: '#8b5cf6',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    textAlign: 'center',
    flex: 1,
  },
  titleDark: {
    color: '#f9fafb',
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 16,
  },
  descriptionDark: {
    color: '#9ca3af',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 12,
  },
  loadingTextDark: {
    color: '#9ca3af',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
  },
  errorText: {
    fontSize: 14,
    color: '#ef4444',
    textAlign: 'center',
  },
  optionsList: {
    maxHeight: 400,
  },
  option: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
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
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
  },
  optionLabelDark: {
    color: '#f9fafb',
  },
  optionLabelSelected: {
    color: '#6d28d9',
  },
  optionDescription: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  optionDescriptionDark: {
    color: '#6b7280',
  },
  checkmark: {
    fontSize: 16,
    color: '#6d28d9',
    fontWeight: '600',
  },
  chevron: {
    fontSize: 20,
    color: '#9ca3af',
  },
  chevronDark: {
    color: '#6b7280',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDark: {
    borderColor: '#4b5563',
  },
  checkboxSelected: {
    backgroundColor: '#6d28d9',
    borderColor: '#6d28d9',
  },
  checkboxCheck: {
    fontSize: 14,
    color: '#ffffff',
    fontWeight: '600',
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  toggleContainerDark: {
    backgroundColor: '#2d2d2d',
  },
  toggleContent: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  toggleLabelDark: {
    color: '#f9fafb',
  },
  toggleDescription: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  toggleDescriptionDark: {
    color: '#9ca3af',
  },
  applyButton: {
    backgroundColor: '#6d28d9',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  applyButtonDark: {
    backgroundColor: '#8b5cf6',
  },
  applyButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
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
