import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

export default function PracticeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.chinese}>練習</Text>
      <Text style={styles.label}>Practice (coming in Milestone 1)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  chinese: { fontSize: 32, color: colors.text },
  label: { fontSize: 16, color: colors.muted },
});
