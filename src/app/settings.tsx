import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';

export default function SettingsScreen() {
  const { userId, error } = useAuth();

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Signed-in user ID</Text>
      {userId ? (
        <Text style={styles.userId} selectable>
          {userId}
        </Text>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <ActivityIndicator color={colors.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 8 },
  label: { fontSize: 14, color: colors.muted },
  userId: { fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  error: { fontSize: 16, color: colors.accent },
});
