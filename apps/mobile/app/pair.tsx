import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';

export default function PairScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { redeemPairingCode, isPaired, isLoading, error } = useAuthStore();
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    if (code && !attempted) {
      setAttempted(true);
      redeemPairingCode(code);
    }
  }, [code, attempted]);

  useEffect(() => {
    if (isPaired) {
      router.replace('/(tabs)');
    }
  }, [isPaired]);

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.content}>
        <Text style={[styles.title, isDark && styles.titleDark]}>
          ClauTunnel
        </Text>

        {isLoading && code ? (
          <>
            <ActivityIndicator size="large" color="#3b82f6" style={styles.spinner} />
            <Text style={[styles.status, isDark && styles.statusDark]}>
              Pairing device...
            </Text>
          </>
        ) : error ? (
          <>
            <Text style={styles.errorText}>{error}</Text>
            <Text style={[styles.instructions, isDark && styles.instructionsDark]}>
              The pairing code may have expired.{'\n'}
              Run "clautunnel start" again to get a new QR code.
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
              Remote control for Claude Code
            </Text>
            <View style={styles.instructionBox}>
              <Text style={[styles.instructionTitle, isDark && styles.instructionTitleDark]}>
                To pair this device:
              </Text>
              <Text style={[styles.instructions, isDark && styles.instructionsDark]}>
                1. Run "clautunnel start" on your computer{'\n'}
                2. Scan the QR code with Expo Go
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  containerDark: {
    backgroundColor: '#0a0a0a',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
  },
  titleDark: {
    color: '#f3f4f6',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 48,
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  spinner: {
    marginVertical: 24,
  },
  status: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  statusDark: {
    color: '#9ca3af',
  },
  errorText: {
    color: '#dc2626',
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 16,
  },
  instructionBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 20,
    width: '100%',
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  instructionTitleDark: {
    color: '#f3f4f6',
  },
  instructions: {
    fontSize: 15,
    color: '#6b7280',
    lineHeight: 24,
    textAlign: 'center',
  },
  instructionsDark: {
    color: '#9ca3af',
  },
});
