import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import type { SlashCommand } from 'clautunnel-shared';

interface CommandPickerProps {
  visible: boolean;
  commands: SlashCommand[];
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
}

export function CommandPicker({
  visible,
  commands,
  onSelect,
  onClose,
}: CommandPickerProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [search, setSearch] = useState('');
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (visible) {
      // Delay to let the modal animation finish before focusing
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  const filteredCommands = useMemo(() => {
    if (!search.trim()) {
      return commands;
    }
    // Strip leading "/" since command names don't include it
    const searchTerm = search.trim().replace(/^\/+/, '');
    if (!searchTerm) {
      return commands;
    }
    const lowerSearch = searchTerm.toLowerCase();

    // Filter and sort: name matches first, then description matches
    return commands
      .filter(
        (cmd) =>
          cmd.name.toLowerCase().includes(lowerSearch) ||
          cmd.description.toLowerCase().includes(lowerSearch)
      )
      .sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(lowerSearch);
        const bNameMatch = b.name.toLowerCase().includes(lowerSearch);

        // Name matches come first
        if (aNameMatch && !bNameMatch) return -1;
        if (!aNameMatch && bNameMatch) return 1;

        // If both match by name, sort by how early the match appears
        if (aNameMatch && bNameMatch) {
          const aIndex = a.name.toLowerCase().indexOf(lowerSearch);
          const bIndex = b.name.toLowerCase().indexOf(lowerSearch);
          return aIndex - bIndex;
        }

        return 0;
      });
  }, [commands, search]);

  const handleSelect = (command: SlashCommand) => {
    setSearch('');
    onSelect(command);
  };

  const handleClose = () => {
    setSearch('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.modalContainer}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={handleClose}
        />
        <View style={[styles.content, isDark && styles.contentDark]}>
          <View style={styles.handle} />
          <Text style={[styles.title, isDark && styles.titleDark]}>
            Commands
          </Text>

          <TextInput
            ref={inputRef}
            style={[styles.searchInput, isDark && styles.searchInputDark]}
            placeholder="Search commands..."
            placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            value={search}
            onChangeText={setSearch}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {filteredCommands.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={[styles.emptyText, isDark && styles.emptyTextDark]}>
                  {commands.length === 0
                    ? 'No commands available'
                    : 'No matching commands'}
                </Text>
              </View>
            ) : (
              filteredCommands.map((item) => (
                <TouchableOpacity
                  key={item.name}
                  style={[styles.commandItem, isDark && styles.commandItemDark]}
                  onPress={() => handleSelect(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.commandHeader}>
                    <Text style={[styles.commandName, isDark && styles.commandNameDark]}>
                      /{item.name}
                    </Text>
                    {item.argumentHint && (
                      <Text style={[styles.argumentHint, isDark && styles.argumentHintDark]}>
                        {item.argumentHint}
                      </Text>
                    )}
                  </View>
                  <Text
                    style={[styles.commandDescription, isDark && styles.commandDescriptionDark]}
                    numberOfLines={2}
                  >
                    {item.description}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
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
    marginBottom: 12,
  },
  titleDark: {
    color: '#f3f4f6',
  },
  searchInput: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    fontSize: 16,
    color: '#1f2937',
  },
  searchInputDark: {
    backgroundColor: '#374151',
    color: '#f3f4f6',
  },
  list: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: 200,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  commandItem: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  commandItemDark: {
    backgroundColor: '#2d2d2d',
  },
  commandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  commandName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3b82f6',
    fontFamily: 'monospace',
  },
  commandNameDark: {
    color: '#60a5fa',
  },
  argumentHint: {
    fontSize: 14,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  argumentHintDark: {
    color: '#9ca3af',
  },
  commandDescription: {
    fontSize: 14,
    color: '#4b5563',
    lineHeight: 20,
  },
  commandDescriptionDark: {
    color: '#9ca3af',
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
});
