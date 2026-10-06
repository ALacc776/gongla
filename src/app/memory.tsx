import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { PROFILE_KEY, updateProfile, useProfile } from '@/lib/profile';
import { colors } from '@/lib/theme';

// F17: what the app remembers about the learner, with delete and clear all.
export default function MemoryScreen() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const facts = profile.data?.memory?.facts ?? [];

  const save = useMutation({
    mutationFn: (next: string[]) =>
      updateProfile(userId!, { memory: { facts: next } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
  });

  if (profile.isPending) return <ActivityIndicator color={colors.accent} style={styles.spinner} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Characters use these to make chats feel personal. They're updated after chats of 4 messages or more.
      </Text>
      {facts.length === 0 && <Text style={styles.empty}>Nothing yet. Tell a character about yourself!</Text>}
      {facts.map((fact, i) => (
        <View key={`${i}-${fact}`} style={styles.row}>
          <Text style={styles.fact}>{fact}</Text>
          <Pressable
            hitSlop={10}
            disabled={save.isPending}
            onPress={() => save.mutate(facts.filter((_, j) => j !== i))}>
            <Text style={styles.delete}>Delete</Text>
          </Pressable>
        </View>
      ))}
      {facts.length > 0 && (
        <Pressable
          style={styles.clear}
          onPress={() =>
            Alert.alert('Clear everything?', 'The app will forget all of these.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Clear all', style: 'destructive', onPress: () => save.mutate([]) },
            ])
          }>
          <Text style={styles.delete}>Clear all</Text>
        </Pressable>
      )}
      {save.isError && <Text style={styles.delete}>{save.error.message}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  spinner: { marginTop: 40 },
  content: { padding: 16, gap: 10 },
  intro: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  empty: { fontSize: 15, color: colors.muted, marginTop: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fact: { flex: 1, fontSize: 16, color: colors.text },
  delete: { fontSize: 15, color: colors.accent },
  clear: { alignSelf: 'center', padding: 12 },
});
