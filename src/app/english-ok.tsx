import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Group, IconButton, Row, TextField } from '@/components/ui';

import { useAuth } from '@/lib/auth';
import { PROFILE_KEY, updateProfile, useProfile, type Profile } from '@/lib/profile';
import { colors, type } from '@/lib/theme';

// Words the learner is fine saying in English. The chat skips "Say it like this" for these.
export default function EnglishOkScreen() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const words = profile.data?.english_ok ?? [];
  const [draft, setDraft] = useState('');

  const save = useMutation({
    mutationFn: (next: string[]) => updateProfile(userId!, { english_ok: next }),
    onMutate: (next) => {
      queryClient.setQueryData<Profile>(PROFILE_KEY, (old) => (old ? { ...old, english_ok: next } : old));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
  });

  const word = draft.trim().toLowerCase().replace(/\s+/g, ' ');
  const add = () => {
    if (!word) return;
    if (!words.includes(word)) save.mutate([...words, word].sort());
    setDraft('');
  };

  if (profile.isPending)
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled">
      <Text style={styles.intro}>
        When you say one of these in English, the chat won't suggest the Cantonese or bring it back later.
      </Text>

      <Group footer={save.isError ? <Text style={styles.error}>{save.error.message}</Text> : undefined}>
        <Row
          accessory={
            <IconButton
              name="plus.circle.fill"
              label="Add word"
              disabled={!word}
              onPress={add}
              style={styles.edge}
            />
          }>
          <TextField
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={add}
            placeholder="Add a word, e.g. meeting"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            submitBehavior="submit"
          />
        </Row>
      </Group>

      {words.length > 0 && (
        <Group>
          {words.map((w) => (
            <Row
              key={w}
              title={w}
              accessory={
                <IconButton
                  name="minus.circle.fill"
                  color={colors.destructive}
                  label={`Remove: ${w}`}
                  onPress={() => save.mutate(words.filter((x) => x !== w))}
                  style={styles.edge}
                />
              }
            />
          ))}
        </Group>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { paddingTop: 12, paddingBottom: 40, gap: 24 },
  intro: { ...type.footnote, color: colors.secondary, marginHorizontal: 32 },
  edge: { marginVertical: -10, marginRight: -10 },
  error: { ...type.footnote, color: colors.destructive, paddingHorizontal: 16, paddingTop: 7 },
});
