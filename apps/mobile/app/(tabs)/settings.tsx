import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  ScrollView,
} from 'react-native';
import Constants from 'expo-constants';
import { useAuthStore } from '../../src/stores/authStore';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { user } = useAuthStore();

  const appVersion = Constants.expoConfig?.version || '0.1.0';

  return (
    <ScrollView
      style={[styles.container, isDark && styles.containerDark]}
      contentContainerStyle={styles.content}
    >
      {/* Account Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
          Account
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.row}>
            <Text style={[styles.label, isDark && styles.labelDark]}>Email</Text>
            <Text testID="settings-email" style={[styles.value, isDark && styles.valueDark]}>
              {user?.email || 'Not signed in'}
            </Text>
          </View>
          <View style={styles.noteRow}>
            <Text style={[styles.noteText, isDark && styles.noteTextDark]}>
              Account access is managed from the CLI QR flow.
            </Text>
          </View>
        </View>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, isDark && styles.sectionTitleDark]}>
          About
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.row}>
            <Text style={[styles.label, isDark && styles.labelDark]}>
              Version
            </Text>
            <Text testID="settings-version" style={[styles.value, isDark && styles.valueDark]}>
              {appVersion}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionTitleDark: {
    color: '#9ca3af',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  cardDark: {
    backgroundColor: '#1f1f1f',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  noteRow: {
    padding: 16,
  },
  label: {
    fontSize: 16,
    color: '#1f2937',
  },
  labelDark: {
    color: '#f3f4f6',
  },
  value: {
    fontSize: 16,
    color: '#6b7280',
  },
  valueDark: {
    color: '#9ca3af',
  },
  noteText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#6b7280',
  },
  noteTextDark: {
    color: '#9ca3af',
  },
});
