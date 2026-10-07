import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Group, Icon, Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useDisplayStore } from '@/lib/display-store';
import { PROFILE_KEY, updateProfile, useProfile } from '@/lib/profile';
import { colors, type } from '@/lib/theme';

const OPTIONS = [
  { level: 1, label: 'Never', detail: 'I know a few words at most' },
  { level: 2, label: 'Only a little', detail: 'Greetings, ordering food, simple questions' },
  { level: 3, label: 'Simple chats', detail: 'I can get by in everyday situations' },
  { level: 4, label: 'Yes, often', detail: 'I can hold a conversation but freeze sometimes' },
  { level: 5, label: 'Fluently', detail: 'I want natural, native-speed Cantonese' },
];

// F13: one-question level picker on first launch.
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const profile = useProfile();

  const choose = useMutation({
    mutationFn: async (level: number) => {
      // F3: levels 1 and 2 see English by default; 3 and up tap to reveal it.
      const english = level < 3;
      useDisplayStore.getState().set({ english });
      await updateProfile(userId!, {
        level,
        display_prefs: {
          ...(profile.data?.display_prefs ?? { hanzi: true, jyutping: true }),
          english,
          onboarded: true,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
      router.replace('/');
    },
  });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.intro}>
        <Icon name="bubble.left.and.text.bubble.right.fill" size={64} />
        <Text style={styles.title}>Have you ever had a conversation in Cantonese?</Text>
        <Text style={styles.subtitle}>This sets how simply the characters talk. You can change it in Settings.</Text>
      </View>
      <Group>
        {OPTIONS.map((o) => (
          <Row
            key={o.level}
            title={o.label}
            subtitle={o.detail}
            disabled={choose.isPending || !userId}
            onPress={() => choose.mutate(o.level)}
            accessory={choose.isPending && choose.variables === o.level ? <ActivityIndicator /> : undefined}
            chevron={!(choose.isPending && choose.variables === o.level)}
          />
        ))}
      </Group>
      {choose.isError && <Text style={styles.error}>{choose.error.message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { gap: 32 },
  intro: { alignItems: 'center', gap: 14, paddingHorizontal: 32 },
  title: { ...type.title1, color: colors.text, textAlign: 'center', marginTop: 8 },
  subtitle: { ...type.body, color: colors.secondary, textAlign: 'center' },
  error: { ...type.footnote, color: colors.destructive, textAlign: 'center' },
});
