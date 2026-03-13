import { useEffect } from 'react';
import { Stack, Redirect, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/stores/authStore';
import { isTestMode } from '../src/utils/testMode';

function useProtectedRoute(user: any, isLoading: boolean) {
  const segments = useSegments();

  // If still loading, don't redirect yet
  if (isLoading) {
    return null;
  }

  const inAuthGroup = segments[0] === '(auth)';

  if (!user && !inAuthGroup) {
    // Not authenticated, redirect to the CLI guidance screen.
    return '/(auth)';
  }

  if (user && inAuthGroup) {
    // Authenticated but in auth group, redirect to main app
    return '/(tabs)';
  }

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { user, isLoading, initialize, claimBootstrapCode } = useAuthStore();

  // Initialize auth on app load — claim one-time CLI bootstrap code if available
  useEffect(() => {
    const controller = new AbortController();

    const handleAuth = async () => {
      // Skip bootstrap in test mode — initialize() handles mock auth persistence
      if (!isTestMode()) {
        const bootstrapCode = process.env.EXPO_PUBLIC_MOBILE_BOOTSTRAP_CODE;
        if (bootstrapCode) {
          const success = await claimBootstrapCode(bootstrapCode, {
            signal: controller.signal,
          });
          if (success) return;
          if (controller.signal.aborted) return;
        }
      }
      void initialize();
    };

    void handleAuth();

    return () => {
      controller.abort();
    };
  }, [claimBootstrapCode, initialize]);

  const redirectTo = useProtectedRoute(user, isLoading);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: isDark ? '#0a0a0a' : '#ffffff',
          },
          headerTintColor: isDark ? '#ffffff' : '#000000',
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: isDark ? '#0a0a0a' : '#f5f5f5',
          },
        }}
      >
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="session/[id]"
          options={{
            title: 'Session',
            presentation: 'card',
            headerBackButtonDisplayMode: 'minimal',
          }}
        />
      </Stack>
      {redirectTo && <Redirect href={redirectTo} />}
      {isLoading && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: isDark ? '#0a0a0a' : '#ffffff',
          }}
        >
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </GestureHandlerRootView>
  );
}
