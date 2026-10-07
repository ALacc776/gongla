import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar, Icon } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { colors, hanzi, radius, type } from '@/lib/theme';
import { SESSION_COLUMNS, type SessionRow } from '@/lib/types';

const PAGE_SIZE = 30;

// F18: ended chats, read only.
export default function PastChatsScreen() {
  const sessions = useInfiniteQuery({
    queryKey: ['sessions', 'past'],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data, error } = await supabase
        .from('sessions')
        .select(SESSION_COLUMNS)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .range(pageParam, pageParam + PAGE_SIZE - 1);
      if (error) throw error;
      return data as unknown as SessionRow[];
    },
    getNextPageParam: (last, pages) => (last.length < PAGE_SIZE ? undefined : pages.length * PAGE_SIZE),
  });

  if (sessions.isPending)
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  const rows = sessions.data?.pages.flat() ?? [];

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      keyExtractor={(s) => s.id}
      onEndReached={() => sessions.hasNextPage && !sessions.isFetchingNextPage && sessions.fetchNextPage()}
      ItemSeparatorComponent={() => (
        <View style={styles.separatorWrap}>
          <View style={styles.separator} />
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Icon name="clock.arrow.circlepath" size={40} color={colors.tertiary} />
          <Text style={styles.emptyText}>Chats you end show up here.</Text>
        </View>
      }
      renderItem={({ item, index }) => (
        <Pressable
          style={({ pressed }) => [
            styles.row,
            index === 0 && styles.rowFirst,
            index === rows.length - 1 && styles.rowLast,
            pressed && { backgroundColor: colors.highlight },
          ]}
          onPress={() => router.push({ pathname: '/chat', params: { sessionId: item.id } })}>
          <Avatar emoji={item.scenarios?.spec.character.emoji} size={40} />
          <View style={styles.flex}>
            <View style={styles.top}>
              <Text style={styles.title} numberOfLines={1}>
                {item.scenarios?.spec.title}
              </Text>
              {item.cantonese_ratio !== null && (
                <Text style={styles.ratio}>{Math.round(item.cantonese_ratio * 100)}%</Text>
              )}
            </View>
            <Text style={styles.date}>
              {new Date(item.started_at).toLocaleDateString()} · {item.turn_count}{' '}
              {item.turn_count === 1 ? 'turn' : 'turns'}
            </Text>
            {item.last_message_preview && (
              <Text style={styles.preview} numberOfLines={1}>
                {item.last_message_preview}
              </Text>
            )}
          </View>
          <Icon name="chevron.right" size={13} weight="semibold" color={colors.tertiary} />
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  list: { padding: 16, paddingBottom: 40 },
  empty: { alignItems: 'center', gap: 12, marginTop: 60 },
  emptyText: { ...type.subhead, color: colors.secondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: colors.card,
  },
  rowFirst: { borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, borderCurve: 'continuous' },
  rowLast: { borderBottomLeftRadius: radius.card, borderBottomRightRadius: radius.card, borderCurve: 'continuous' },
  separatorWrap: { backgroundColor: colors.card },
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 68, backgroundColor: colors.separator },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...type.headline, flex: 1, color: colors.text },
  ratio: { ...type.subhead, color: colors.secondary, fontVariant: ['tabular-nums'] },
  date: { ...type.footnote, color: colors.secondary },
  preview: { ...hanzi, color: colors.text },
});
