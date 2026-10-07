import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { deleteAccount } from '@/lib/api';
import { useSpeaker } from '@/lib/audio';
import { useAuth } from '@/lib/auth';
import { useDisplayStore, type Layer } from '@/lib/display-store';
import { PROFILE_KEY, updateProfile, useProfile, type Profile } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';

const LEVELS = [1, 2, 3, 4, 5];
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="Level">
        <Text style={styles.hint}>How simply the characters talk. 1 is absolute beginner.</Text>
        <View style={styles.chips}>
          {LEVELS.map((level) => (
            <Chip key={level} label={String(level)} on={p?.level === level} onPress={() => save.mutate({ level })} />
          ))}
        </View>
      </Section>

      <Section title="Show in chats">
        {LAYERS.map(({ key, label }) => (
          <Row key={key} label={label}>
            <Switch value={display[key]} onValueChange={() => display.toggle(key)} trackColor={{ true: colors.accent }} />
          </Row>
        ))}
      </Section>

      <Section title="Voice">
        <View style={styles.chips}>
          {VOICES.map((v) => (
            <Chip
              key={v.id}
              label={v.label}
              on={p?.voice === v.id}
              onPress={() => save.mutate({ voice: v.id })}
            />
          ))}
        </View>
        <Text style={styles.hint}>Used in the Word Bank and tutor. Each character has their own voice.</Text>
        <View style={styles.chips}>
          {RATES.map((r) => (
            <Chip
              key={r.value}
              label={r.label}
              on={Math.abs((p?.speech_rate ?? 1) - r.value) < 0.01}
              onPress={() => save.mutate({ speech_rate: r.value })}
            />
          ))}
        </View>
        <Row label="Play replies automatically">
          <Switch
            value={display.autoplay}
            onValueChange={(autoplay) => display.set({ autoplay })}
            trackColor={{ true: colors.accent }}
          />
        </Row>
        <Row label="Send automatically after speaking">
          <Switch
            value={display.autoSend}
            onValueChange={(autoSend) => display.set({ autoSend })}
            trackColor={{ true: colors.accent }}
          />
        </Row>
        <Text style={styles.hint}>
          Off: what the mic heard goes into the text box so you can check it first. Replies to things you say
          out loud always play.
        </Text>
        <Pressable onPress={() => speak('你好，我哋一齊練習講廣東話啦！')}>
          <Text style={styles.link}>Test the voice 🔊</Text>
        </Pressable>
      </Section>

      <Section title="Memory">
        <Pressable onPress={() => router.push('/memory')}>
          <Text style={styles.link}>What the app remembers about you ›</Text>
        </Pressable>
      </Section>

      <Section title="Account">
        <Text style={styles.hint}>Plan: {p?.plan === 'pro' ? 'Pro' : 'Free (25 messages and 10 tutor questions a day)'}</Text>
        <Text style={styles.small} selectable>
          User ID: {userId}
        </Text>
        <Pressable
          disabled={remove.isPending}
          onPress={() =>
            Alert.alert('Delete your account?', 'All your chats, words and memory will be permanently deleted.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => remove.mutate() },
            ])
          }>
          <Text style={styles.danger}>{remove.isPending ? 'Deleting…' : 'Delete account'}</Text>
        </Pressable>
        {remove.isError && <Text style={styles.danger}>{remove.error.message}</Text>}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, on && styles.chipOn]}>
      <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  section: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  hint: { fontSize: 14, color: colors.muted },
  small: { fontSize: 12, color: colors.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 15, color: colors.text },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLabel: { fontSize: 16, color: colors.text },
  link: { fontSize: 16, fontWeight: '600', color: colors.accent },
  danger: { fontSize: 16, color: colors.accent },
});
