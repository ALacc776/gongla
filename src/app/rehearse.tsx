import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { endSession, generateScenario, startCustomSession } from '@/lib/api';
import { useOpenSession } from '@/lib/start-chat';
import { colors } from '@/lib/theme';
import type { ScenarioSpec } from '@/lib/types';

type Spec = ScenarioSpec & { preview?: string };

// F8 Rehearse My Real Life: description -> preview card -> Start / Edit / Make it harder.
export default function RehearseScreen() {
  const { description } = useLocalSearchParams<{ description: string }>();
  const queryClient = useQueryClient();
  const open = useOpenSession();
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
      return startCustomSession(spec!);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.quote}>“{description}”</Text>

      {!spec && generate.isPending && (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.muted}>Planning your rehearsal…</Text>
        </View>
      )}

      {spec && (
        <View style={styles.card}>
          <Text style={styles.emoji}>{spec.character.emoji ?? '💬'}</Text>
          <Text style={styles.title}>{spec.title}</Text>
          <Text style={styles.body}>
            {spec.preview ??
              `You'll be talking with ${spec.character.name}, ${spec.character.role}. ${spec.character.personality}.`}
          </Text>
          <Text style={styles.label}>Goal</Text>
          <Text style={styles.body}>{spec.goal}</Text>
          {!!spec.key_phrases?.length && (
            <>
              <Text style={styles.label}>Phrases that might help</Text>
              <Text style={styles.phrases}>{spec.key_phrases.join('　')}</Text>
            </>
          )}
          <Text style={styles.label}>Difficulty {spec.difficulty} of 5</Text>
        </View>
      )}

      {spec && editing && (
        <View style={styles.editBox}>
          <TextInput
            style={styles.input}
            value={edit}
            onChangeText={setEdit}
            placeholder="e.g. Make him more formal, and the goal is to ask for her hand"
            placeholderTextColor={colors.muted}
            multiline
            autoFocus
          />
          <Pressable
            style={[styles.secondary, (!edit.trim() || busy) && styles.disabled]}
            disabled={!edit.trim() || busy}
            onPress={() => generate.mutate({ edit: edit.trim() })}>
            <Text style={styles.secondaryText}>Update</Text>
          </Pressable>
        </View>
      )}

      {spec && (
        <View style={styles.buttons}>
          <Pressable style={[styles.button, busy && styles.disabled]} disabled={busy} onPress={() => start.mutate()}>
            {start.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>Start</Text>}
          </Pressable>
          <View style={styles.row}>
            <Pressable style={[styles.secondary, styles.flex, busy && styles.disabled]} disabled={busy} onPress={() => setEditing(!editing)}>
              <Text style={styles.secondaryText}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.secondary, styles.flex, (busy || spec.difficulty >= 5) && styles.disabled]}
              disabled={busy || spec.difficulty >= 5}
              onPress={() => generate.mutate({ harder: true })}>
              <Text style={styles.secondaryText}>Make it harder</Text>
            </Pressable>
          </View>
          {generate.isPending && <ActivityIndicator color={colors.accent} />}
        </View>
      )}

      {(generate.isError || start.isError) && (
        <View style={styles.loading}>
          <Text style={styles.error}>{(generate.error ?? start.error)?.message}</Text>
          {!spec && (
            <Pressable onPress={() => generate.mutate({})}>
              <Text style={styles.secondaryText}>Try again</Text>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 16 },
  quote: { fontSize: 15, color: colors.muted, fontStyle: 'italic' },
  loading: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  muted: { fontSize: 14, color: colors.muted },
  card: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  emoji: { fontSize: 40 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, color: colors.text, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', color: colors.muted, marginTop: 8, textTransform: 'uppercase' },
  phrases: { fontSize: 22, color: colors.text, lineHeight: 32 },
  editBox: { gap: 8 },
  input: {
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 12,
    fontSize: 16,
    color: colors.text,
  },
  buttons: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  secondary: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  secondaryText: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.4 },
  error: { fontSize: 14, color: colors.accent, textAlign: 'center' },
});
