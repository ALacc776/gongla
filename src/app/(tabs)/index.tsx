import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/lib/auth';
import { useOpenSession, useStartChat } from '@/lib/start-chat';
import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
import type { ScenarioSummary } from '@/lib/types';

const PACKS: { key: string; label: string }[] = [
  { key: 'food', label: 'Food' },
  { key: 'travel', label: 'Getting around' },
  { key: 'everyday', label: 'Everyday' },
  { key: 'social', label: 'Social' },
  { key: 'family', label: 'Family' },
];

function Dots({ n }: { n: number }) {
  return <Text style={styles.dots}>{'●'.repeat(n) + '○'.repeat(Math.max(0, 5 - n))}</Text>;
}

export default function PracticeScreen() {
  const { userId } = useAuth();
  const open = useOpenSession();
  const startChat = useStartChat();
  const [description, setDescription] = useState('');

  const scenarios = useQuery({
    queryKey: ['scenarios'],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scenarios')
        .select('id, pack, is_custom, spec')
        .order('created_at');
      if (error) throw error;
      return data as ScenarioSummary[];
    },
  });

  const due = useQuery({
    queryKey: ['gaps', 'due'],
    enabled: !!userId,
    queryFn: async () => {
      const { count } = await supabase
        .from('gaps')
        .select('id', { count: 'exact', head: true })
        .eq('kind', 'production')
        .neq('status', 'closed')
        .lte('next_due_at', new Date().toISOString());
      return count ?? 0;
    },
  });

  if (scenarios.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (scenarios.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Could not load scenarios.</Text>
        <Pressable onPress={() => scenarios.refetch()}>
          <Text style={styles.link}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const builtIn = scenarios.data.filter((s) => !s.is_custom).sort((a, b) => a.id.localeCompare(b.id));
  const rehearsals = scenarios.data.filter((s) => s.is_custom).reverse();
  const openSpec = open.data?.scenarios?.spec;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {open.data && openSpec && (
        <Pressable
          style={styles.continue}
          onPress={() => router.push({ pathname: '/chat', params: { sessionId: open.data!.id } })}>
          <Text style={styles.continueLabel}>Continue</Text>
          <Text style={styles.continueTitle}>
            {openSpec.character.emoji} {openSpec.title}
          </Text>
          {open.data.last_message_preview && (
            <Text style={styles.continuePreview} numberOfLines={1}>
              {open.data.last_message_preview}
            </Text>
          )}
        </Pressable>
      )}

      {!!due.data && (
        <Text style={styles.due}>
          {due.data} {due.data === 1 ? 'word you got stuck on is' : 'words you got stuck on are'} ready to come back
          up in your next chat.
        </Text>
      )}

      <View style={styles.rehearse}>
        <Text style={styles.sectionTitle}>Rehearse something coming up</Text>
        <TextInput
          style={styles.rehearseInput}
          value={description}
          onChangeText={setDescription}
          placeholder="e.g. Dim sum with my girlfriend's parents on Saturday. Her dad doesn't speak English."
          placeholderTextColor={colors.muted}
          multiline
        />
        <Pressable
          style={[styles.button, !description.trim() && styles.disabled]}
          disabled={!description.trim()}
          onPress={() => {
            router.push({ pathname: '/rehearse', params: { description: description.trim() } });
            setDescription('');
          }}>
          <Text style={styles.buttonText}>Plan it</Text>
        </Pressable>
      </View>

      {rehearsals.length > 0 && (
        <ScenarioRow title="Your rehearsals" items={rehearsals} onStart={startChat.start} />
      )}
      {PACKS.map((pack) => {
        const items = builtIn.filter((s) => s.pack === pack.key);
        return items.length ? (
          <ScenarioRow key={pack.key} title={pack.label} items={items} onStart={startChat.start} />
        ) : null;
      })}

      {startChat.isError && <Text style={styles.error}>{startChat.error.message}</Text>}

      <Pressable style={styles.pastChats} onPress={() => router.push('/past-chats')}>
        <Text style={styles.link}>Past chats ›</Text>
      </Pressable>

      <Modal visible={startChat.isPending} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.overlayBox}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.overlayText}>Setting the scene…</Text>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ScenarioRow({
  title,
  items,
  onStart,
}: {
  title: string;
  items: ScenarioSummary[];
  onStart: (id: string) => void;
}) {
  return (
    <View style={styles.pack}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.packRow}>
        {items.map((s) => (
          <Pressable key={s.id} style={styles.card} onPress={() => onStart(s.id)}>
            <Text style={styles.emoji}>{s.spec.character.emoji ?? '💬'}</Text>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {s.spec.title}
            </Text>
            <Text style={styles.cardDetail} numberOfLines={1}>
              {s.spec.character.name}, {s.spec.character.role}
            </Text>
            <Dots n={s.spec.difficulty ?? 1} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingVertical: 16, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  continue: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.accent,
    gap: 4,
  },
  continueLabel: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', opacity: 0.8, textTransform: 'uppercase' },
  continueTitle: { fontSize: 18, fontWeight: '600', color: '#FFFFFF' },
  continuePreview: { fontSize: 22, color: '#FFFFFF' },
  due: { marginHorizontal: 16, fontSize: 14, color: colors.muted },
  rehearse: {
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  rehearseInput: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text },
  pack: { gap: 10, paddingLeft: 16 },
  packRow: { gap: 10, paddingRight: 16 },
  card: {
    width: 170,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 4,
  },
  emoji: { fontSize: 32 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.text, minHeight: 42 },
  cardDetail: { fontSize: 13, color: colors.muted },
  dots: { fontSize: 10, color: colors.accent, letterSpacing: 2, marginTop: 4 },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  disabled: { opacity: 0.4 },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  pastChats: { alignItems: 'center', paddingVertical: 8 },
  link: { fontSize: 16, fontWeight: '600', color: colors.accent },
  error: { marginHorizontal: 16, fontSize: 15, color: colors.accent },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.15)', alignItems: 'center', justifyContent: 'center' },
  overlayBox: { padding: 24, borderRadius: 16, backgroundColor: colors.card, alignItems: 'center', gap: 10 },
  overlayText: { fontSize: 15, color: colors.text },
});
