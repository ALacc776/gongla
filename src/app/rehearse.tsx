import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, Group } from '@/components/ui';
import { endSession, generateScenario, startCustomSession } from '@/lib/api';
import { useVoiceSettings } from '@/lib/audio';
import { useOpenSession } from '@/lib/start-chat';
import { colors, hanzi, type } from '@/lib/theme';
import type { ScenarioSpec } from '@/lib/types';

type Spec = ScenarioSpec & { preview?: string };

// F8 Rehearse My Real Life: description -> preview card -> Start / Edit / Make it harder.
export default function RehearseScreen() {
  const { description } = useLocalSearchParams<{ description: string }>();
  const queryClient = useQueryClient();
  const open = useOpenSession();
  const { rate } = useVoiceSettings();
  const [spec, setSpec] = useState<Spec | null>(null);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState('');

  const generate = useMutation({
    mutationFn: (opts: { edit?: string; harder?: boolean }) =>
      generateScenario({ description, base_spec: spec ?? undefined, ...opts }),
    onSuccess: ({ spec: next }) => {
      setSpec(next);
      setEditing(false);
      setEdit('');
    },
  });

  const start = useMutation({
    mutationFn: async () => {
      if (open.data) await endSession(open.data.id);
      return startCustomSession(spec!, rate);
    },
    onSuccess: ({ session_id }) => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      queryClient.invalidateQueries({ queryKey: ['scenarios'] });
      router.replace({ pathname: '/chat', params: { sessionId: session_id } });
    },
  });

  useEffect(() => {
    generate.mutate({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = generate.isPending || start.isPending;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled">
      <Text style={styles.quote}>“{description}”</Text>

      {!spec && generate.isPending && (
        <View style={styles.loading}>
          <ActivityIndicator />
          <Text style={styles.muted}>Planning your rehearsal…</Text>
        </View>
      )}

      {spec && (
        <>
          <Group footer={`Difficulty ${spec.difficulty} of 5`}>
            <View style={styles.intro}>
              <Avatar emoji={spec.character.emoji} size={56} />
              <Text style={styles.title}>{spec.title}</Text>
              <Text style={styles.body}>
                {spec.preview ??
                  `You'll be talking with ${spec.character.name}, ${spec.character.role}. ${spec.character.personality}.`}
              </Text>
            </View>
          </Group>
          <Group header="Goal">
            <Text style={[styles.body, styles.padded]}>{spec.goal}</Text>
          </Group>
          {!!spec.key_phrases?.length && (
            <Group header="Phrases that might help">
              <Text style={[styles.phrases, styles.padded]}>{spec.key_phrases.join('　')}</Text>
            </Group>
          )}
        </>
      )}

      {spec && editing && (
        <Group header="What should change?">
          <View style={styles.editBox}>
            <TextInput
              style={styles.input}
              value={edit}
              onChangeText={setEdit}
              placeholder="e.g. Make him more formal, and the goal is to ask for her hand"
              placeholderTextColor={colors.placeholder}
              multiline
              autoFocus
            />
            <Button
              title="Update"
              size="small"
              style={styles.update}
              disabled={!edit.trim() || busy}
              onPress={() => generate.mutate({ edit: edit.trim() })}
            />
          </View>
        </Group>
      )}

      {spec && (
        <View style={styles.buttons}>
          <Button title="Start" loading={start.isPending} disabled={busy} onPress={() => start.mutate()} />
          <View style={styles.row}>
            <Button
              title="Edit"
              icon="pencil"
              variant="tinted"
              style={styles.flex}
              disabled={busy}
              onPress={() => setEditing(!editing)}
            />
            <Button
              title="Make it harder"
              icon="arrow.up.right"
              variant="tinted"
              style={styles.flex}
              disabled={busy || spec.difficulty >= 5}
              onPress={() => generate.mutate({ harder: true })}
            />
          </View>
          {generate.isPending && <ActivityIndicator />}
        </View>
      )}

      {(generate.isError || start.isError) && (
        <View style={styles.loading}>
          <Text style={styles.error}>{(generate.error ?? start.error)?.message}</Text>
          {!spec && <Button title="Try again" variant="plain" onPress={() => generate.mutate({})} />}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { paddingTop: 12, paddingBottom: 40, gap: 24 },
  quote: { ...type.subhead, color: colors.secondary, fontStyle: 'italic', marginHorizontal: 32 },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  muted: { ...type.subhead, color: colors.secondary },
  intro: { padding: 16, gap: 8 },
  padded: { paddingHorizontal: 16, paddingVertical: 12 },
  title: { ...type.title2, color: colors.text, marginTop: 4 },
  body: { ...type.body, color: colors.text },
  phrases: { ...hanzi, lineHeight: 34, color: colors.text },
  editBox: { padding: 16, paddingBottom: 12, gap: 8 },
  input: { ...type.body, minHeight: 66, color: colors.text, padding: 0, textAlignVertical: 'top' },
  update: { alignSelf: 'flex-end' },
  buttons: { gap: 10, marginHorizontal: 16 },
  row: { flexDirection: 'row', gap: 10 },
  error: { ...type.footnote, color: colors.destructive, textAlign: 'center' },
});
