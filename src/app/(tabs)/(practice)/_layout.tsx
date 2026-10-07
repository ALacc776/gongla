import { Stack } from 'expo-router';

import { largeTitleHeader } from '@/lib/theme';

export default function Layout() {
  return (
    <Stack screenOptions={largeTitleHeader}>
      <Stack.Screen name="index" options={{ title: 'Practice' }} />
    </Stack>
  );
}
