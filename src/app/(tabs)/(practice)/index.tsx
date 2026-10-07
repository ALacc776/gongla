import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Group, Icon, Row } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useOpenSession, useStartChat } from '@/lib/start-chat';
import { supabase } from '@/lib/supabase';
import { colors, hanzi, radius, type } from '@/lib/theme';
import type { ScenarioSummary } from '@/lib/types';

const PACKS: { key: string; label: string }[] = [
  { key: 'food', label: 'Food' },
  { key: 'travel', label: 'Getting around' },
  { key: 'everyday', label: 'Everyday' },
  { key: 'social', label: 'Social' },
  { key: 'family', label: 'Family' },
];

function Difficulty({ n }: { n: number }) {
  return (
    <View style={styles.bars} accessibilityLabel={`Difficulty ${n} of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <View
          key={i}
          style={[styles.bar, { height: 4 + i * 2, backgroundColor: i <= n ? colors.secondary : colors.fillStrong }]}
        />
      ))}
    </View>
  );
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
      const { data, error } = await supabase.from('scenarios').select('id, pack, is_custom, spec').order('created_at');
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
        <ActivityIndicator />
      </View>
    );
  }
  if (scenarios.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Could not load scenarios.</Text>
        <Button title="Try again" variant="plain" onPress={() => scenarios.refetch()} />
      </View>
    );
  }

  const builtIn = scenarios.data.filter((s) => !s.is_custom).sort((a, b) => a.id.localeCompare(b.id));
  const rehearsals = scenarios.data.filter((s) => s.is_custom).reverse();
  const openSpec = open.data?.scenarios?.spec;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled">
      {open.data && openSpec && (
        <Group header="Continue" prominent>
          <Row chevron onPress={() => router.push({ pathname: '/chat', params: { sessionId: open.data!.id } })}>
            <Avatar emoji={openSpec.character.emoji} size={48} />
            <View style={styles.flex}>
              <Text style={styles.continueTitle} numberOfLines={1}>
                {openSpec.title}
              </Text>
              {open.data.last_message_preview && (
                <Text style={styles.continuePreview} numberOfLines={1}>
                  {open.data.last_message_preview}
                </Text>
              )}
            </View>
          </Row>
        </Group>
      )}

      {!!due.data && (
        <View style={styles.due}>
          <Icon name="arrow.uturn.backward.circle.fill" size={17} color={colors.accent} />
          <Text style={styles.dueText}>
            {due.data} {due.data === 1 ? 'word you got stuck on is' : 'words you got stuck on are'} ready to come back
            up in your next chat.
          </Text>
        </View>
      )}

      <Group header="Rehearse something coming up" prominent>
        <View style={styles.rehearse}>
          <TextInput
            style={styles.rehearseInput}
            value={description}
            onChangeText={setDescription}
            placeholder="e.g. Dim sum with my girlfriend's parents on Saturday. Her dad doesn't speak English."
            placeholderTextColor={colors.placeholder}
            multiline
          />
          <Button
            title="Plan it"
            size="small"
            style={styles.planButton}
            disabled={!description.trim()}
            onPress={() => {
              router.push({ pathname: '/rehearse', params: { description: description.trim() } });
              setDescription('');
            }}
          />
        </View>
      </Group>

      {rehearsals.length > 0 && <Shelf title="Your rehearsals" items={rehearsals} onStart={startChat.start} />}
      {PACKS.map((pack) => {
        const items = builtIn.filter((s) => s.pack === pack.key);
        return items.length ? (
          <Shelf key={pack.key} title={pack.label} items={items} onStart={startChat.start} />
        ) : null;
      })}

      {startChat.isError && <Text style={styles.error}>{startChat.error.message}</Text>}

      <Group>
        <Row icon="clock.arrow.circlepath" title="Past Chats" chevron onPress={() => router.push('/past-chats')} />
      </Group>

      <Modal visible={startChat.isPending} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.hud}>
            <ActivityIndicator size="large" />
            <Text style={styles.hudText}>Setting the scene…</Text>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// A horizontal row of scenes, like a shelf in the App Store.
function Shelf({ title, items, onStart }: { title: string; items: ScenarioSummary[]; onStart: (id: string) => void }) {
  return (
    <View style={styles.shelf}>
      <Text style={styles.shelfTitle}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfRow}>
        {items.map((s) => (
          <Pressable
            key={s.id}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
            onPress={() => onStart(s.id)}
            accessibilityRole="button"
            accessibilityLabel={`${s.spec.title}, with ${s.spec.character.name}`}>
            <Avatar emoji={s.spec.character.emoji} />
            <Text style={styles.cardTitle} numberOfLines={2}>
              {s.spec.title}
            </Text>
            <Text style={styles.cardDetail} numberOfLines={1}>
              {s.spec.character.name}, {s.spec.character.role}
            </Text>
            <Difficulty n={s.spec.difficulty ?? 1} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: 8, paddingBottom: 32, gap: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.background },
  muted: { ...type.body, color: colors.secondary },
  pressed: { opacity: 0.7 },

  continueTitle: { ...type.headline, color: colors.text },
  continuePreview: { ...hanzi, color: colors.secondary },

  due: { flexDirection: 'row', gap: 8, marginHorizontal: 32, marginTop: -12 },
  dueText: { ...type.footnote, color: colors.secondary, flex: 1 },

  rehearse: { padding: 16, paddingBottom: 12, gap: 8 },
  rehearseInput: { ...type.body, minHeight: 66, color: colors.text, padding: 0, textAlignVertical: 'top' },
  planButton: { alignSelf: 'flex-end' },

  shelf: { gap: 10 },
  shelfTitle: { ...type.title3, color: colors.text, paddingHorizontal: 20 },
  shelfRow: { gap: 12, paddingHorizontal: 16 },
  card: {
    width: 164,
    padding: 14,
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    gap: 6,
  },
  cardTitle: { ...type.headline, color: colors.text, minHeight: 44, marginTop: 4 },
  cardDetail: { ...type.footnote, color: colors.secondary },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 14, marginTop: 4 },
  bar: { width: 4, borderRadius: 1.5 },

  error: { ...type.footnote, color: colors.destructive, marginHorizontal: 32 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', alignItems: 'center', justifyContent: 'center' },
  hud: {
    paddingVertical: 24,
    paddingHorizontal: 28,
    borderRadius: radius.card + 4,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    alignItems: 'center',
    gap: 12,
  },
  hudText: { ...type.subhead, color: colors.text },
});
