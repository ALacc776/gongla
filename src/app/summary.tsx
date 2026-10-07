import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { endSession, startSession } from '@/lib/api';
import { useSpeaker, useVoiceSettings } from '@/lib/audio';
import { useAuth } from '@/lib/auth';
import { PROFILE_KEY, updateProfile } from '@/lib/profile';
import { colors } from '@/lib/theme';
import type { GapInfo } from '@/lib/types';

function percent(ratio: number | null) {
  return ratio === null ? '–' : `${Math.round(ratio * 100)}%`;
}

// F9: session summary. Ending is idempotent, so reopening this screen is safe.
export default function SummaryScreen() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const speak = useSpeaker();
  const { rate } = useVoiceSettings();

  const summary = useQuery({
    queryKey: ['summary', sessionId],
    queryFn: async () => {
      const { summary } = await endSession(sessionId);
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['session', sessionId] });
      queryClient.invalidateQueries({ queryKey: ['gaps'] });
      return summary;
    },
    staleTime: Infinity,
  });

  const again = useMutation({
    mutationFn: () => startSession(summary.data!.scenario_id, rate),
    onSuccess: ({ session_id }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      router.replace({ pathname: '/chat', params: { sessionId: session_id } });
    },
  });

  const changeLevel = useMutation({
    mutationFn: (level: number) => updateProfile(userId!, { level }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
  });

  if (summary.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Wrapping up…</Text>
      </View>
    );
  }
  if (summary.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{summary.error.message}</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const s = summary.data;
  const trend =
    s.ratio !== null && s.avg_7d !== null
      ? s.ratio >= s.avg_7d
        ? `Up from your 7-day average of ${percent(s.avg_7d)}`
        : `Your 7-day average is ${percent(s.avg_7d)}`
      : null;
  const suggestedLevel = s.level_suggestion === 'up' ? s.level + 1 : s.level_suggestion === 'down' ? s.level - 1 : null;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.scenario}>{s.title}</Text>
      <Text style={styles.big}>{percent(s.ratio)}</Text>
      <Text style={styles.headline}>
        {s.ratio === null ? 'No messages this time' : 'of what you said was Cantonese'}
      </Text>
      {trend && <Text style={styles.muted}>{trend}</Text>}
      <Text style={styles.goal}>{s.goal_met ? '✓ Goal complete' : 'Goal not finished yet'}</Text>

      {suggestedLevel !== null && !changeLevel.isSuccess && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {s.level_suggestion === 'up'
              ? "You've been speaking mostly Cantonese. Try a harder level?"
              : 'Want shorter, simpler replies for a while?'}
          </Text>
          <Pressable style={styles.smallButton} onPress={() => changeLevel.mutate(suggestedLevel)}>
            <Text style={styles.smallButtonText}>Switch to level {suggestedLevel}</Text>
          </Pressable>
        </View>
      )}
      {changeLevel.isSuccess && <Text style={styles.muted}>Level updated.</Text>}

      <GapSection title="You said these on your own" gaps={s.used_gaps} onPlay={speak} empty="None this time." />
      <GapSection title="New words to practise" gaps={s.new_gaps} onPlay={speak} empty="You didn't get stuck. Nice." />

      <View style={styles.buttons}>
        <Pressable style={styles.button} disabled={again.isPending} onPress={() => again.mutate()}>
          {again.isPending ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Practise again</Text>
          )}
        </Pressable>
        <Pressable style={styles.secondary} onPress={() => router.dismissTo('/')}>
          <Text style={styles.secondaryText}>Done</Text>
        </Pressable>
      </View>
      {again.isError && <Text style={styles.error}>{again.error.message}</Text>}
    </ScrollView>
  );
}

function GapSection({
  title,
  gaps,
  empty,
  onPlay,
}: {
  title: string;
  gaps: GapInfo[];
  empty: string;
  onPlay: (text: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {gaps.length === 0 && <Text style={styles.muted}>{empty}</Text>}
      {gaps.map((g) => (
        <Pressable key={g.id} style={styles.gapRow} onPress={() => onPlay(g.hanzi)}>
          <Text style={styles.gapHanzi}>{g.hanzi}</Text>
          <View style={styles.flex}>
            <Text style={styles.gapJyutping}>{g.jyutping}</Text>
            <Text style={styles.muted}>{g.english}</Text>
          </View>
          <Text style={styles.speaker}>🔊</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 20, gap: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background },
  scenario: { fontSize: 15, color: colors.muted, textAlign: 'center' },
  big: { fontSize: 72, fontWeight: '700', color: colors.accent, textAlign: 'center' },
  headline: { fontSize: 18, color: colors.text, textAlign: 'center' },
  goal: { fontSize: 15, color: colors.text, textAlign: 'center', marginTop: 4 },
  muted: { fontSize: 14, color: colors.muted },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    gap: 10,
  },
  cardTitle: { fontSize: 15, color: colors.text },
  smallButton: { alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.accent },
  smallButtonText: { color: '#FFFFFF', fontWeight: '600' },
  section: { marginTop: 24, gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '600', color: colors.text },
  gapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gapHanzi: { fontSize: 26, color: colors.text },
  gapJyutping: { fontSize: 14, color: colors.accent },
  speaker: { fontSize: 18 },
  buttons: { marginTop: 32, gap: 10 },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  error: { fontSize: 14, color: colors.accent, textAlign: 'center' },
  link: { fontSize: 16, color: colors.accent },
});
