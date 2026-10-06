import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/theme';

export default function WordBankScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.chinese}>詞庫</Text>
      <Text style={styles.label}>Word Bank (coming in Milestone 3)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  chinese: { fontSize: 32, color: colors.text },
  label: { fontSize: 16, color: colors.muted },
});
