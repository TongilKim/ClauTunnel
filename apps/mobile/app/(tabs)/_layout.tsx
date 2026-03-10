import { Tabs } from 'expo-router';
import { useColorScheme, Text } from 'react-native';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: isDark ? '#6b7280' : '#9ca3af',
        tabBarStyle: {
          backgroundColor: isDark ? '#0a0a0a' : '#ffffff',
          borderTopColor: isDark ? '#262626' : '#e5e7eb',
        },
        headerStyle: {
          backgroundColor: isDark ? '#0a0a0a' : '#ffffff',
        },
        headerTintColor: isDark ? '#ffffff' : '#000000',
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Sessions',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>📱</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <Text style={{ fontSize: 20, color }}>⚙️</Text>
          ),
        }}
      />
    </Tabs>
  );
}
