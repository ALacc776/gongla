import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Group, Row, Segmented } from '@/components/ui';

import { deleteAccount } from '@/lib/api';
import { useSpeaker } from '@/lib/audio';
import { useAuth } from '@/lib/auth';
import { useDisplayStore, type Layer } from '@/lib/display-store';
import { PROFILE_KEY, updateProfile, useProfile, type Profile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { colors, type } from '@/lib/theme';

const LEVELS = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) }));
const VOICES = [
  { id: 'zh-HK-HiuMaanNeural', label: 'HiuMaan (female)' },
  { id: 'zh-HK-HiuGaaiNeural', label: 'HiuGaai (female)' },
  { id: 'zh-HK-WanLungNeural', label: 'WanLung (male)' },
];
const RATES = [
  { value: 0.7, label: 'Slow' },
  { value: 0.85, label: 'Learner' },
  { value: 1, label: 'Natural' },
];
const LAYERS: { key: Layer; label: string }[] = [
  { key: 'hanzi', label: 'Chinese characters' },
  { key: 'jyutping', label: 'Jyutping' },
  { key: 'english', label: 'English translation' },
];

export default function SettingsScreen() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const display = useDisplayStore();
  const speak = useSpeaker();

  const save = useMutation({
    mutationFn: (values: Partial<Omit<Profile, 'id' | 'plan'>>) => updateProfile(userId!, values),
    onMutate: (values) => {
      queryClient.setQueryData<Profile>(PROFILE_KEY, (old) => (old ? { ...old, ...values } : old));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
  });

  const remove = useMutation({
    mutationFn: deleteAccount,
    onSuccess: async () => {
      // Start over as a brand-new anonymous user.
      await supabase.auth.signOut({ scope: 'local' });
      queryClient.clear();
      await supabase.auth.signInAnonymously();
      router.replace('/welcome');
    },
  });

  const p = profile.data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <Group header="Level" footer="How simply the characters talk. 1 is absolute beginner.">
        <View style={styles.padded}>
          <Segmented options={LEVELS} value={p?.level} onChange={(level) => save.mutate({ level })} />
        </View>
      </Group>

      <Group header="Show in chats">
        {LAYERS.map(({ key, label }) => (
          <Row
            key={key}
            title={label}
            accessory={<Switch value={display[key]} onValueChange={() => display.toggle(key)} />}
          />
        ))}
      </Group>

      <Group header="Voice" footer="Used in the Word Bank and tutor. Each character has their own voice.">
        {VOICES.map((v) => (
          <Row key={v.id} title={v.label} checked={p?.voice === v.id} onPress={() => save.mutate({ voice: v.id })} />
        ))}
      </Group>

      <Group header="Speed">
        <View style={styles.padded}>
          <Segmented
            options={RATES}
            value={RATES.find((r) => Math.abs((p?.speech_rate ?? 1) - r.value) < 0.01)?.value}
            onChange={(speech_rate) => save.mutate({ speech_rate })}
          />
        </View>
      </Group>

      <Group footer="Off: what the mic heard goes into the text box so you can check it first. Replies to things you say out loud always play.">
        <Row
          title="Play replies automatically"
          accessory={<Switch value={display.autoplay} onValueChange={(autoplay) => display.set({ autoplay })} />}
        />
        <Row
          title="Send automatically after speaking"
          accessory={<Switch value={display.autoSend} onValueChange={(autoSend) => display.set({ autoSend })} />}
        />
        <Row
          icon="speaker.wave.2.fill"
          title="Test the voice"
          action
          onPress={() => speak('你好，我哋一齊練習講廣東話啦！')}
        />
      </Group>

      <Group header="Memory">
        <Row
          icon="brain.head.profile"
          title="What the app remembers about you"
          chevron
          onPress={() => router.push('/memory')}
        />
      </Group>

      <Group header="English" footer="Words you're happy to say in English. The chat won't suggest Cantonese for these.">
        <Row
          icon="character.bubble"
          title="Words OK in English"
          value={p ? String(p.english_ok.length) : undefined}
          chevron
          onPress={() => router.push('/english-ok')}
        />
      </Group>

      <Group
        header="Account"
        footer={
          <Text style={styles.footer} selectable>
            {p?.plan === 'pro' ? '' : '25 messages and 10 tutor questions a day.\n'}User ID: {userId}
          </Text>
        }>
        <Row title="Plan" value={p?.plan === 'pro' ? 'Pro' : 'Free'} />
      </Group>

      <Group
        footer={remove.isError ? <Text style={[styles.footer, styles.error]}>{remove.error.message}</Text> : undefined}>
        <Row
          title={remove.isPending ? 'Deleting…' : 'Delete account'}
          destructive
          disabled={remove.isPending}
          onPress={() =>
            Alert.alert('Delete your account?', 'All your chats, words and memory will be permanently deleted.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
            ])
          }
        />
      </Group>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: 8, paddingBottom: 40, gap: 28 },
  padded: { padding: 12 },
  footer: { ...type.footnote, color: colors.secondary, paddingHorizontal: 16, paddingTop: 7 },
  error: { color: colors.destructive },
});
