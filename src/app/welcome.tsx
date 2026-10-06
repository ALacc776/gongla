import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { useDisplayStore } from '@/lib/display-store';
import { PROFILE_KEY, updateProfile, useProfile } from '@/lib/profile';
import { colors } from '@/lib/theme';

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
        display_prefs: { ...(profile.data?.display_prefs ?? { hanzi: true, jyutping: true }), english, onboarded: true },
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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.logo}>講</Text>
      <Text style={styles.title}>Have you ever had a conversation in Cantonese?</Text>
      <Text style={styles.subtitle}>This sets how simply the characters talk. You can change it in Settings.</Text>
      <View style={styles.options}>
        {OPTIONS.map((o) => (
          <Pressable
            key={o.level}
            style={[styles.option, choose.variables === o.level && styles.optionOn]}
            disabled={choose.isPending || !userId}
            onPress={() => choose.mutate(o.level)}>
            <View style={styles.flex}>
              <Text style={styles.optionLabel}>{o.label}</Text>
              <Text style={styles.optionDetail}>{o.detail}</Text>
            </View>
            {choose.isPending && choose.variables === o.level && <ActivityIndicator color={colors.accent} />}
          </Pressable>
        ))}
      </View>
      {choose.isError && <Text style={styles.error}>{choose.error.message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 24, gap: 12 },
  logo: { fontSize: 64, color: colors.accent, textAlign: 'center' },
  title: { fontSize: 24, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: 15, color: colors.muted, textAlign: 'center', marginBottom: 12 },
  options: { gap: 10 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionOn: { borderColor: colors.accent },
  optionLabel: { fontSize: 17, fontWeight: '600', color: colors.text },
  optionDetail: { fontSize: 14, color: colors.muted, marginTop: 2 },
  error: { fontSize: 14, color: colors.accent, textAlign: 'center' },
});
