import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';

interface EmptyStateProps {
  title: string;
  message: string;
  icon?: string;
  testID?: string;
}

export function EmptyState({ title, message, icon = '📱', testID }: EmptyStateProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={styles.container} testID={testID}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.title, isDark && styles.titleDark]}>{title}</Text>
      <Text style={[styles.message, isDark && styles.messageDark]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  titleDark: {
    color: '#f3f4f6',
  },
  message: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  messageDark: {
    color: '#9ca3af',
  },
});
