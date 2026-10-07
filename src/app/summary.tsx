import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Group, Icon, Row } from '@/components/ui';
import { endSession, startSession } from '@/lib/api';
import { useSpeaker, useVoiceSettings } from '@/lib/audio';
import { useAuth } from '@/lib/auth';
import { PROFILE_KEY, updateProfile } from '@/lib/profile';
import { colors, type } from '@/lib/theme';
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
        <ActivityIndicator />
        <Text style={styles.muted}>Wrapping up…</Text>
      </View>
    );
  }
  if (summary.isError) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{summary.error.message}</Text>
        <Button title="Back" variant="plain" onPress={() => router.back()} />
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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <Text style={styles.scenario}>{s.title}</Text>
        <Text style={styles.big}>{percent(s.ratio)}</Text>
        <Text style={styles.headline}>
          {s.ratio === null ? 'No messages this time' : 'of what you said was Cantonese'}
        </Text>
        {s.ratio !== null && (
          <View style={styles.meter} accessibilityElementsHidden>
            <View style={[styles.meterFill, { width: `${Math.round(s.ratio * 100)}%` }]} />
          </View>
        )}
        {trend && <Text style={styles.muted}>{trend}</Text>}
        <View style={styles.goal}>
          <Icon
            name={s.goal_met ? 'checkmark.circle.fill' : 'circle.dashed'}
            size={18}
            color={s.goal_met ? colors.success : colors.secondary}
          />
          <Text style={styles.goalText}>{s.goal_met ? 'Goal complete' : 'Goal not finished yet'}</Text>
        </View>
      </View>

      {suggestedLevel !== null && !changeLevel.isSuccess && (
        <Group>
          <View style={styles.suggest}>
            <Text style={styles.suggestText}>
              {s.level_suggestion === 'up'
                ? "You've been speaking mostly Cantonese. Try a harder level?"
                : 'Want shorter, simpler replies for a while?'}
            </Text>
            <Button
              title={`Switch to level ${suggestedLevel}`}
              size="small"
              loading={changeLevel.isPending}
              onPress={() => changeLevel.mutate(suggestedLevel)}
            />
          </View>
        </Group>
      )}
      {changeLevel.isSuccess && <Text style={[styles.muted, styles.centered]}>Level updated.</Text>}

      <GapSection title="You said these on your own" gaps={s.used_gaps} onPlay={speak} empty="None this time." />
      <GapSection title="New words to practise" gaps={s.new_gaps} onPlay={speak} empty="You didn't get stuck. Nice." />

      <View style={styles.buttons}>
        <Button title="Practise again" loading={again.isPending} onPress={() => again.mutate()} />
        <Button title="Done" variant="plain" onPress={() => router.dismissTo('/')} />
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
  if (gaps.length === 0) {
    return (
      <Group header={title}>
        <Row>
          <Text style={styles.muted}>{empty}</Text>
        </Row>
      </Group>
    );
  }
  return (
    <Group header={title}>
      {gaps.map((g) => (
        <Row key={g.id} onPress={() => onPlay(g.hanzi)} accessory={<Icon name="speaker.wave.2.fill" size={18} />}>
          <Text style={styles.gapHanzi}>{g.hanzi}</Text>
          <View style={styles.flex}>
            <Text style={styles.gapEnglish}>{g.english}</Text>
            <Text style={styles.muted}>{g.jyutping}</Text>
          </View>
        </Row>
      ))}
    </Group>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { gap: 28 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background },
  hero: { alignItems: 'center', gap: 6, paddingHorizontal: 24 },
  scenario: { ...type.subhead, color: colors.secondary, textAlign: 'center' },
  big: {
    fontSize: 80,
    lineHeight: 92,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  headline: { ...type.title3, fontWeight: '400', color: colors.text, textAlign: 'center' },
  meter: {
    alignSelf: 'stretch',
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.fillStrong,
    overflow: 'hidden',
    marginVertical: 10,
  },
  meterFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  goal: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  goalText: { ...type.subhead, color: colors.text },
  muted: { ...type.subhead, color: colors.secondary },
  centered: { textAlign: 'center' },
  suggest: { padding: 16, gap: 12 },
  suggestText: { ...type.body, color: colors.text },
  gapHanzi: { fontSize: 26, lineHeight: 34, color: colors.text, minWidth: 56 },
  gapEnglish: { ...type.body, color: colors.text },
  buttons: { gap: 4, paddingHorizontal: 16, marginTop: 4 },
  error: { ...type.footnote, color: colors.destructive, textAlign: 'center', paddingHorizontal: 24 },
});
