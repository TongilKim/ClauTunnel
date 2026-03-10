import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { UserQuestionData } from 'clautunnel-shared';

interface UserQuestionPickerProps {
  visible: boolean;
  questionData: UserQuestionData | null;
  onSubmit: (answers: Record<string, string>) => void;
  onClose: () => void;
}

export function UserQuestionPicker({
  visible,
  questionData,
  onSubmit,
  onClose,
}: UserQuestionPickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const insets = useSafeAreaInsets();

  const scrollViewRef = useRef<ScrollView>(null);

  // Track selected options for each question
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string>>({});
  // Track "Other" text input for each question
  const [otherText, setOtherText] = useState<Record<number, string>>({});
  // Track which questions have "Other" selected
  const [usingOther, setUsingOther] = useState<Record<number, boolean>>({});

  // Reset state when data changes
  React.useEffect(() => {
    if (questionData) {
      setSelectedOptions({});
      setOtherText({});
      setUsingOther({});
    }
  }, [questionData]);

  const handleOptionSelect = useCallback((questionIndex: number, optionLabel: string) => {
    setSelectedOptions(prev => ({ ...prev, [questionIndex]: optionLabel }));
    setUsingOther(prev => ({ ...prev, [questionIndex]: false }));
  }, []);

  const handleOtherSelect = useCallback((questionIndex: number) => {
    setUsingOther(prev => ({ ...prev, [questionIndex]: true }));
    setSelectedOptions(prev => {
      const newSelected = { ...prev };
      delete newSelected[questionIndex];
      return newSelected;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!questionData) return;

    // Build answers object
    const answers: Record<string, string> = {};
    questionData.questions.forEach((_, index) => {
      if (usingOther[index] && otherText[index]) {
        answers[String(index)] = otherText[index];
      } else if (selectedOptions[index]) {
        answers[String(index)] = selectedOptions[index];
      }
    });

    onSubmit(answers);
  }, [questionData, selectedOptions, usingOther, otherText, onSubmit]);

  // Check if all questions have been answered
  const isComplete = questionData?.questions.every((_, index) =>
    selectedOptions[index] !== undefined || (usingOther[index] && otherText[index]?.trim())
  ) ?? false;

  if (!questionData) return null;

  return (
    <Modal
      testID="user-question-modal"
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
          style={[
            styles.sheet,
            isDark && styles.sheetDark,
            { paddingBottom: insets.bottom + 16 },
          ]}
        >
          <View style={styles.handle} />

          <Text testID="user-question-title" style={[styles.title, isDark && styles.titleDark]}>
            Claude is asking...
          </Text>

          <ScrollView
            ref={scrollViewRef}
            style={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {questionData.questions.map((question, qIndex) => (
              <View key={qIndex} style={styles.questionBlock}>
                <View style={[styles.headerBadge, isDark && styles.headerBadgeDark]}>
                  <Text style={[styles.headerText, isDark && styles.headerTextDark]}>
                    {question.header}
                  </Text>
                </View>

                <Text style={[styles.questionText, isDark && styles.questionTextDark]}>
                  {question.question}
                </Text>

                <View style={styles.optionsContainer}>
                  {question.options.map((option, oIndex) => {
                    const isSelected = selectedOptions[qIndex] === option.label;
                    return (
                      <TouchableOpacity
                        key={oIndex}
                        testID={`user-question-option-${qIndex}-${oIndex}`}
                        style={[
                          styles.option,
                          isDark && styles.optionDark,
                          isSelected && styles.optionSelected,
                          isSelected && isDark && styles.optionSelectedDark,
                        ]}
                        onPress={() => handleOptionSelect(qIndex, option.label)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.optionContent}>
                          <View style={styles.optionHeader}>
                            <Text
                              style={[
                                styles.optionLabel,
                                isDark && styles.optionLabelDark,
                                isSelected && styles.optionLabelSelected,
                              ]}
                            >
                              {option.label}
                            </Text>
                            {isSelected && (
                              <Text style={styles.checkmark}>✓</Text>
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
                  })}

                  {/* Other option */}
                  <TouchableOpacity
                    testID={`user-question-other-${qIndex}`}
                    style={[
                      styles.option,
                      isDark && styles.optionDark,
                      usingOther[qIndex] && styles.optionSelected,
                      usingOther[qIndex] && isDark && styles.optionSelectedDark,
                    ]}
                    onPress={() => handleOtherSelect(qIndex)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.optionContent}>
                      <View style={styles.optionHeader}>
                        <Text
                          style={[
                            styles.optionLabel,
                            isDark && styles.optionLabelDark,
                            usingOther[qIndex] && styles.optionLabelSelected,
                          ]}
                        >
                          Other
                        </Text>
                        {usingOther[qIndex] && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.optionDescription,
                          isDark && styles.optionDescriptionDark,
                        ]}
                      >
                        Enter a custom response
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Text input for Other option */}
                  {usingOther[qIndex] && (
                    <TextInput
                      testID={`user-question-other-input-${qIndex}`}
                      style={[styles.otherInput, isDark && styles.otherInputDark]}
                      placeholder="Type your answer..."
                      placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
                      value={otherText[qIndex] || ''}
                      onChangeText={(text) => setOtherText(prev => ({ ...prev, [qIndex]: text }))}
                      onFocus={() => {
                        // Scroll to bottom so the input is visible above keyboard
                        setTimeout(() => {
                          scrollViewRef.current?.scrollToEnd({ animated: true });
                        }, 300);
                      }}
                      autoFocus
                    />
                  )}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Submit button */}
          <TouchableOpacity
            testID="user-question-submit"
            style={[
              styles.submitButton,
              isDark && styles.submitButtonDark,
              !isComplete && styles.submitButtonDisabled,
            ]}
            onPress={handleSubmit}
            disabled={!isComplete}
          >
            <Text style={styles.submitButtonText}>
              Submit Answer{questionData.questions.length > 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>

          {/* Cancel button */}
          <TouchableOpacity
            testID="user-question-cancel"
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
  questionBlock: {
    marginBottom: 24,
  },
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
  optionsContainer: {
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
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  optionSelectedDark: {
    borderColor: '#60a5fa',
    backgroundColor: '#1e3a5f',
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
    color: '#3b82f6',
  },
  optionDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  optionDescriptionDark: {
    color: '#9ca3af',
  },
  checkmark: {
    fontSize: 16,
    color: '#3b82f6',
    fontWeight: '600',
  },
  otherInput: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#d1d5db',
    marginTop: 8,
  },
  otherInputDark: {
    backgroundColor: '#2d2d2d',
    color: '#f9fafb',
    borderColor: '#4b5563',
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDark: {
    backgroundColor: '#2563eb',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
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
