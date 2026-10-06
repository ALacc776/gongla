import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

// F12: shown when the free daily message limit is reached.
export function LimitNotice({ name }: { name?: string }) {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>{name ?? 'Your partner'} needs a break</Text>
      <Text style={styles.body}>You've used today's free messages. Come back tomorrow to keep practising.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accentSoft,
    gap: 4,
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.text },
  body: { fontSize: 14, color: colors.muted },
});
