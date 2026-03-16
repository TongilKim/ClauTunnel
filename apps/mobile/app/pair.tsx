import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  ActivityIndicator,
} from 'react-native';
import * as Linking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuthStore } from '../src/stores/authStore';
import { isTestMode } from '../src/utils/testMode';

// Module-level flag: auto-pair only once per app process lifetime.
// After disconnect, the pair screen remounts but should NOT auto-pair again,
// so the logout Maestro flow can verify a stable logged-out state.
let testModeAutoPaired = false;

export default function PairScreen() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { redeemPairingCode, isPaired, isLoading, error } = useAuthStore();
  const [attemptedCode, setAttemptedCode] = useState<string | null>(null);
  const attemptedCodeRef = useRef<string | null>(null);

  // In test mode, auto-pair on first app launch so Maestro flows proceed.
  // Skip on subsequent mounts (e.g. after disconnect) so the logout E2E
  // flow can verify the pair screen stays visible.
  useEffect(() => {
    if (isTestMode() && !testModeAutoPaired) {
      testModeAutoPaired = true;
      redeemPairingCode('test-code');
    }
  }, []);

  // Handle cold-start deep links (code available from route params)
  useEffect(() => {
    if (code && code !== attemptedCode) {
      setAttemptedCode(code);
      attemptedCodeRef.current = code;
      redeemPairingCode(code);
    }
  }, [code, attemptedCode]);

  // Handle warm-start deep links (app already open, QR scanned from camera).
  // The URL event fires before expo-router updates useLocalSearchParams,
  // so this prevents the instructions screen from flashing.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', (event) => {
      const match = event.url.match(/code=([^&]+)/);
      if (match && match[1] !== attemptedCodeRef.current) {
        setAttemptedCode(match[1]);
        attemptedCodeRef.current = match[1];
        redeemPairingCode(match[1]);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (isPaired) {
      router.replace('/(tabs)');
    }
  }, [isPaired]);

  return (
    <View testID="pair-screen" style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.content}>
        <Text style={[styles.title, isDark && styles.titleDark]}>
          ClauTunnel
        </Text>

        {isLoading || (code && code !== attemptedCode) ? (
          <>
            <ActivityIndicator testID="pair-spinner" size="large" color="#3b82f6" style={styles.spinner} />
            <Text testID="pair-status-text" style={[styles.status, isDark && styles.statusDark]}>
              Pairing device...
            </Text>
          </>
        ) : error ? (
          <>
            <Text testID="pair-error-text" style={styles.errorText}>{error}</Text>
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
            <View testID="pair-instructions" style={styles.instructionBox}>
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
