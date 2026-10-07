import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, Group, Icon, IconButton, Segmented } from '@/components/ui';
import { useSpeaker } from '@/lib/audio';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { colors, hanzi, radius, type } from '@/lib/theme';

const PAGE_SIZE = 50;
const TABS = [
  { status: 'new', label: 'Stuck on' },
  { status: 'practicing', label: 'Practising' },
  { status: 'closed', label: 'Got it' },
] as const;
type Status = (typeof TABS)[number]['status'];

type Gap = {
  id: string;
  english: string;
  hanzi: string;
  jyutping: string;
  kind: 'production' | 'recognition';
  status: Status;
  times_stuck: number;
  times_used: number;
  last_seen_at: string;
};

const GAP_COLUMNS = 'id, english, hanzi, jyutping, kind, status, times_stuck, times_used, last_seen_at';

// F6: every word the learner got stuck on, read straight from Postgres via RLS.
export default function WordBankScreen() {
  const { userId } = useAuth();
  const speak = useSpeaker();
  const [tab, setTab] = useState<Status>('new');
  const [open, setOpen] = useState<Gap | null>(null);

  const gaps = useInfiniteQuery({
    queryKey: ['gaps', 'list', tab],
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from('gaps')
        .select(GAP_COLUMNS)
        .eq('status', tab)
        .order('last_seen_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return data as Gap[];
    },
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE),
  });

  const stats = useQuery({
    queryKey: ['gaps', 'stats'],
    enabled: !!userId,
    queryFn: async () => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [closed, top] = await Promise.all([
        supabase.from('gaps').select('id', { count: 'exact', head: true }).eq('status', 'closed'),
        supabase
          .from('gaps')
          .select(GAP_COLUMNS)
          .gte('last_seen_at', weekAgo)
          .neq('status', 'closed')
          .order('times_stuck', { ascending: false })
          .limit(1),
      ]);
      return { closed: closed.count ?? 0, mostStuck: (top.data?.[0] as Gap | undefined) ?? null };
    },
  });

  const rows = gaps.data?.pages.flat() ?? [];

  const header = (
    <View style={styles.header}>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statNumber}>{stats.data?.closed ?? '–'}</Text>
          <Text style={styles.statLabel}>words you've got</Text>
        </View>
        <View style={styles.statDivider} />
        <Pressable
          style={({ pressed }) => [styles.stat, pressed && styles.pressed]}
          disabled={!stats.data?.mostStuck}
          onPress={() => stats.data?.mostStuck && setOpen(stats.data.mostStuck)}>
          <Text style={styles.statHanzi}>{stats.data?.mostStuck?.hanzi ?? '–'}</Text>
          <Text style={styles.statLabel}>most stuck this week</Text>
        </Pressable>
      </View>
      <Segmented options={TABS.map((t) => ({ value: t.status, label: t.label }))} value={tab} onChange={setTab} />
      {gaps.isPending && <ActivityIndicator style={styles.spinner} />}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={gaps.isPending ? [] : rows}
        keyExtractor={(g) => g.id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.list}
        ListHeaderComponent={header}
        onEndReached={() => gaps.hasNextPage && !gaps.isFetchingNextPage && gaps.fetchNextPage()}
        onRefresh={() => {
          gaps.refetch();
          stats.refetch();
        }}
        refreshing={gaps.isRefetching}
        ItemSeparatorComponent={() => (
          <View style={styles.separatorWrap}>
            <View style={styles.separator} />
          </View>
        )}
        ListEmptyComponent={
          gaps.isPending ? null : (
            <View style={styles.empty}>
              <Icon
                name={
                  tab === 'new'
                    ? 'character.book.closed.zh'
                    : tab === 'practicing'
                      ? 'arrow.triangle.2.circlepath'
                      : 'checkmark.seal'
                }
                size={40}
                color={colors.tertiary}
              />
              <Text style={styles.emptyText}>
                {tab === 'new'
                  ? 'Words you get stuck on in chats show up here. Try answering in English when you don’t know a word.'
                  : tab === 'practicing'
                    ? 'Words you’ve started using on your own show up here.'
                    : 'Words you’ve used on your own 3 times, over at least a week, end up here.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <Pressable
            style={({ pressed }) => [
              styles.row,
              index === 0 && styles.rowFirst,
              index === rows.length - 1 && styles.rowLast,
              pressed && { backgroundColor: colors.highlight },
            ]}
            onPress={() => setOpen(item)}>
            <Text style={styles.hanzi}>{item.hanzi}</Text>
            <View style={styles.flex}>
              <Text style={styles.english}>{item.english}</Text>
              <Text style={styles.jyutping}>{item.jyutping}</Text>
              <Text style={styles.counter}>
                {item.kind === 'recognition' ? 'heard · ' : ''}stuck {item.times_stuck}× · used {item.times_used}×
              </Text>
            </View>
            <IconButton name="speaker.wave.2.fill" label={`Play ${item.hanzi}`} onPress={() => speak(item.hanzi)} />
          </Pressable>
        )}
      />

      <GapSheet gap={open} onClose={() => setOpen(null)} onPlay={speak} />
    </View>
  );
}

type GapEvent = {
  kind: string;
  created_at: string;
  messages: { text_raw: string; role: string } | null;
  sessions: { scenarios: { spec: { title: string } } | null } | null;
};

const EVENT_LABELS: Record<string, string> = {
  fallback: 'You said it in English',
  asked: 'You asked how to say it',
  corrected: 'You were corrected',
  tapped: 'You tapped it to see the meaning',
  used: 'You said it on your own',
};

// The original moments where the learner got stuck (or later used the word).
function GapSheet({ gap, onClose, onPlay }: { gap: Gap | null; onClose: () => void; onPlay: (t: string) => void }) {
  const events = useQuery({
    queryKey: ['gaps', 'events', gap?.id],
    enabled: !!gap,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gap_events')
        .select('kind, created_at, messages(text_raw, role), sessions(scenarios(spec))')
        .eq('gap_id', gap!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as unknown as GapEvent[];
    },
  });

  return (
    <Modal visible={!!gap} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {gap && (
        <ScrollView style={styles.container} contentContainerStyle={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
              <Text style={styles.done}>Done</Text>
            </Pressable>
          </View>
          <View style={styles.sheetWord}>
            <Text style={styles.sheetHanzi}>{gap.hanzi}</Text>
            <Text style={styles.sheetJyutping}>{gap.jyutping}</Text>
            <Text style={styles.sheetEnglish}>{gap.english}</Text>
            <Button
              title="Play"
              icon="speaker.wave.2.fill"
              variant="tinted"
              size="small"
              style={styles.play}
              onPress={() => onPlay(gap.hanzi)}
            />
          </View>
          {events.isPending && <ActivityIndicator />}
          {!!events.data?.length && (
            <Group header="History" style={styles.history}>
              {events.data.map((e, i) => (
                <View key={i} style={styles.event}>
                  <Text style={styles.eventLabel}>
                    {EVENT_LABELS[e.kind] ?? e.kind}
                    {e.sessions?.scenarios ? ` · ${e.sessions.scenarios.spec.title}` : ''}
                  </Text>
                  {e.messages && <Text style={styles.eventText}>“{e.messages.text_raw}”</Text>}
                  <Text style={styles.counter}>{new Date(e.created_at).toLocaleDateString()}</Text>
                </View>
              ))}
            </Group>
          )}
        </ScrollView>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.6 },
  container: { flex: 1, backgroundColor: colors.background },
  spinner: { marginTop: 24 },
  header: { gap: 20, paddingBottom: 20 },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.card,
    paddingVertical: 14,
  },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.separator },
  statNumber: { fontSize: 28, lineHeight: 34, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
  statHanzi: { fontSize: 28, lineHeight: 34, color: colors.text },
  statLabel: { ...type.footnote, color: colors.secondary },
  list: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 32 },
  empty: { alignItems: 'center', gap: 12, paddingTop: 32, paddingHorizontal: 16 },
  emptyText: { ...type.subhead, color: colors.secondary, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  rowFirst: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderCurve: 'continuous' },
  rowLast: { borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card, borderCurve: 'continuous' },
  separatorWrap: { backgroundColor: colors.card },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 16, backgroundColor: colors.separator },
  hanzi: { fontSize: 28, lineHeight: 36, color: colors.text, minWidth: 64 },
  english: { ...type.body, color: colors.text },
  jyutping: { ...type.subhead, color: colors.secondary },
  counter: { ...type.caption, color: colors.secondary, marginTop: 2 },
  sheet: { paddingBottom: 40 },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 14,
    minHeight: 44,
  },
  done: { ...type.headline, color: colors.accent },
  sheetWord: { alignItems: 'center', gap: 4, paddingTop: 8, paddingBottom: 28, paddingHorizontal: 20 },
  sheetHanzi: { fontSize: 64, lineHeight: 76, color: colors.text },
  sheetJyutping: { ...type.title3, fontWeight: '400', color: colors.secondary },
  sheetEnglish: { ...type.body, color: colors.text },
  play: { alignSelf: 'center', marginTop: 14 },
  history: { marginTop: 4 },
  event: { paddingHorizontal: 16, paddingVertical: 11, gap: 3 },
  eventLabel: { ...type.footnote, fontWeight: '600', color: colors.secondary },
  eventText: { ...hanzi, color: colors.text },
});
