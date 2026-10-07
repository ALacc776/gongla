import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Group, Icon, IconButton, Row } from '@/components/ui';

import { useAuth } from '@/lib/auth';
import { PROFILE_KEY, updateProfile, useProfile } from '@/lib/profile';
import { colors, type } from '@/lib/theme';

// F17: what the app remembers about the learner, with delete and clear all.
export default function MemoryScreen() {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const profile = useProfile();
  const facts = profile.data?.memory?.facts ?? [];

  const save = useMutation({
    mutationFn: (next: string[]) => updateProfile(userId!, { memory: { facts: next } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PROFILE_KEY }),
  });

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
      contentInsetAdjustmentBehavior="automatic">
      <Text style={styles.intro}>
        Characters use these to make chats feel personal. They're updated after chats of 4 messages or more.
      </Text>
      {facts.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="brain.head.profile" size={40} color={colors.tertiary} />
          <Text style={styles.emptyText}>Nothing yet. Tell a character about yourself!</Text>
        </View>
      ) : (
        <Group footer={save.isError ? <Text style={styles.error}>{save.error.message}</Text> : undefined}>
          {facts.map((fact, i) => (
            <Row
              key={`${i}-${fact}`}
              title={fact}
              accessory={
                <IconButton
                  name="minus.circle.fill"
                  color={colors.destructive}
                  label={`Delete: ${fact}`}
                  disabled={save.isPending}
                  onPress={() => save.mutate(facts.filter((_, j) => j !== i))}
                  style={styles.delete}
                />
              }
            />
          ))}
        </Group>
      )}
      {facts.length > 0 && (
        <Group>
          <Row
            title="Clear all"
            destructive
            onPress={() =>
              Alert.alert('Clear everything?', 'The app will forget all of these.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Clear all', style: 'destructive', onPress: () => save.mutate([]) },
              ])
            }
          />
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
  empty: { alignItems: 'center', gap: 12, marginTop: 40, paddingHorizontal: 32 },
  emptyText: { ...type.subhead, color: colors.secondary, textAlign: 'center' },
  delete: { marginVertical: -10, marginRight: -10 },
  error: { ...type.footnote, color: colors.destructive, paddingHorizontal: 16, paddingTop: 7 },
});
