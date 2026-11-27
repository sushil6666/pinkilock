/** The way into Bring a friend (D118), on Me. */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { T } from '@/components/ui/T';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

export function FriendsEntry() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('friends.meOpen')} onPress={() => router.push('/friends')} style={({ pressed }) => [styles.entry, pressed && { opacity: 0.85 }]}>
      <Feather name="gift" size={22} color={color.gold} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" c={color.gold}>{t('friends.eyebrow')}</T>
        <T v="heading">{t('friends.meTitle')}</T>
        <T v="caption" c={color.textDim}>{t('friends.meBody')}</T>
      </View>
      <Feather name="chevron-right" size={20} color={color.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.goldDeep, borderRadius: radius.card, backgroundColor: color.goldWash, padding: space.lg },
});
