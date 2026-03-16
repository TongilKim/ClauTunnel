import { useEffect } from 'react';
import { Stack, Redirect, useSegments } from 'expo-router';
import * as Linking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme, View, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useAuthStore } from '../src/stores/authStore';
import { isTestMode } from '../src/utils/testMode';

function useProtectedRoute(isPaired: boolean, isLoading: boolean) {
  const segments = useSegments();

  // If still loading, don't redirect yet
  if (isLoading) {
    return null;
  }

  const inPairScreen = segments[0] === 'pair';

  if (!isPaired && !inPairScreen) {
    // Not paired, redirect to pair screen
    return '/pair';
  }

  if (isPaired && inPairScreen) {
    // Paired but on pair screen, redirect to main app
    return '/(tabs)';
  }

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { isPaired, isLoading, initialize } = useAuthStore();

  // Initialize auth on app load
  useEffect(() => {
    if (isTestMode()) {
      // In test mode, initialize() just clears isLoading so routing can proceed
      initialize();
    } else {
      // Pass the initial URL so initialize() can detect re-pairing deep links
      // and sign out the old session before routing decisions are made
      Linking.getInitialURL().then((url) => {
        initialize(url);
      });
    }
  }, []);

  const redirectTo = useProtectedRoute(isPaired, isLoading);

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
        <Stack.Screen name="pair" options={{ headerShown: false }} />
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
