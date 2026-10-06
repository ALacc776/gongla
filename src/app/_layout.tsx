import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthProvider } from '@/lib/auth';
import { PrefsSync } from '@/lib/prefs-sync';
import { colors } from '@/lib/theme';

const queryClient = new QueryClient();

const withHeader = (title: string) => ({
  headerShown: true,
  title,
  headerBackTitle: 'Back',
  headerTintColor: colors.accent,
  headerTitleStyle: { color: colors.text },
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
});

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <PrefsSync />
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="chat" />
          <Stack.Screen name="summary" options={{ gestureEnabled: false }} />
          <Stack.Screen name="past-chats" options={withHeader('Past chats')} />
          <Stack.Screen name="memory" options={withHeader('What the app remembers')} />
          <Stack.Screen name="rehearse" options={withHeader('Rehearse')} />
          <Stack.Screen name="welcome" options={{ gestureEnabled: false, animation: 'fade' }} />
        </Stack>
      </AuthProvider>
    </QueryClientProvider>
  );
}
