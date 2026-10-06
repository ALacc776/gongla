import { useInfiniteQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from '@/lib/supabase';
import { colors } from '@/lib/theme';
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

  if (sessions.isPending) return <ActivityIndicator color={colors.accent} style={styles.spinner} />;

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.list}
      data={sessions.data?.pages.flat() ?? []}
      keyExtractor={(s) => s.id}
      onEndReached={() => sessions.hasNextPage && !sessions.isFetchingNextPage && sessions.fetchNextPage()}
      ListEmptyComponent={<Text style={styles.empty}>Chats you end show up here.</Text>}
      renderItem={({ item }) => (
        <Pressable style={styles.row} onPress={() => router.push({ pathname: '/chat', params: { sessionId: item.id } })}>
          <View style={styles.top}>
            <Text style={styles.title} numberOfLines={1}>
              {item.scenarios?.spec.character.emoji} {item.scenarios?.spec.title}
            </Text>
            {item.cantonese_ratio !== null && (
              <Text style={styles.ratio}>{Math.round(item.cantonese_ratio * 100)}%</Text>
            )}
          </View>
          <Text style={styles.date}>{new Date(item.started_at).toLocaleDateString()} · {item.turn_count} turns</Text>
          {item.last_message_preview && (
            <Text style={styles.preview} numberOfLines={1}>
              {item.last_message_preview}
            </Text>
          )}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  spinner: { marginTop: 40 },
  list: { padding: 16, gap: 10 },
  empty: { fontSize: 15, color: colors.muted, textAlign: 'center', marginTop: 40 },
  row: { padding: 14, borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, gap: 4 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 16, fontWeight: '600', color: colors.text },
  ratio: { fontSize: 15, fontWeight: '600', color: colors.accent },
  date: { fontSize: 13, color: colors.muted },
  preview: { fontSize: 22, color: colors.text },
});
