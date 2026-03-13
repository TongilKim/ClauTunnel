import { View, Text, StyleSheet, useColorScheme } from 'react-native';

export default function ConnectScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View
      testID="connect-screen"
      style={[styles.container, isDark && styles.containerDark]}
    >
      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.title, isDark && styles.titleDark]}>
          Open ClauTunnel From CLI
        </Text>
        <Text style={[styles.body, isDark && styles.bodyDark]}>
          Run `clautunnel start` on your machine, then scan the QR code with Expo Go
          to open this app.
        </Text>
        <Text style={[styles.caption, isDark && styles.captionDark]}>
          Login and logout are managed from the CLI flow.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    padding: 24,
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  cardDark: {
    backgroundColor: '#1f1f1f',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
  },
  titleDark: {
    color: '#f3f4f6',
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
  },
  bodyDark: {
    color: '#d1d5db',
  },
  caption: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  captionDark: {
    color: '#9ca3af',
  },
});
