import { StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/ui';
import { colors, radius, type } from '@/lib/theme';

// F12: shown when the free daily message limit is reached.
export function LimitNotice({ name }: { name?: string }) {
  return (
    <View style={styles.box}>
      <Icon name="moon.zzz.fill" size={22} color={colors.secondary} />
      <View style={styles.text}>
        <Text style={styles.title}>{name ?? 'Your partner'} needs a break</Text>
        <Text style={styles.body}>You've used today's free messages. Come back tomorrow to keep practising.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.card,
    borderCurve: 'continuous',
    backgroundColor: colors.inset,
  },
  text: { flex: 1, gap: 2 },
  title: { ...type.headline, color: colors.text },
  body: { ...type.footnote, color: colors.secondary },
});
