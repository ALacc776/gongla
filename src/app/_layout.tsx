import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';

import { AuthProvider } from '@/lib/auth';
import { PrefsSync } from '@/lib/prefs-sync';
import { colors } from '@/lib/theme';

const queryClient = new QueryClient();

// Native headers take their colors from the navigation theme, which has to switch
// with the system appearance. Values match the iOS system colors in lib/theme.
const lightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#007AFF',
    background: '#F2F2F7',
    card: '#FFFFFF',
    text: '#000000',
  },
};
const darkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: '#0A84FF',
    background: '#000000',
    card: '#000000',
    text: '#FFFFFF',
  },
};

// Pushed grouped screens: the header sits over the gray, and iOS blurs it on scroll.
const withHeader = (title: string) => ({
  headerShown: true,
  title,
  headerTransparent: true,
  headerShadowVisible: false,
});

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={scheme === 'dark' ? darkTheme : lightTheme}>
        <AuthProvider>
          <PrefsSync />
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerShown: false,
              headerBackButtonDisplayMode: 'minimal',
              contentStyle: { backgroundColor: colors.background },
            }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="chat"
              options={{
                headerShown: true,
                title: '',
                headerShadowVisible: false,
                contentStyle: { backgroundColor: colors.plain },
              }}
            />
            <Stack.Screen name="summary" options={{ gestureEnabled: false }} />
            <Stack.Screen name="past-chats" options={withHeader('Past Chats')} />
            <Stack.Screen name="memory" options={withHeader('Memory')} />
            <Stack.Screen name="english-ok" options={withHeader('OK in English')} />
            <Stack.Screen name="rehearse" options={withHeader('Rehearse')} />
            <Stack.Screen name="welcome" options={{ gestureEnabled: false, animation: 'fade' }} />
          </Stack>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
