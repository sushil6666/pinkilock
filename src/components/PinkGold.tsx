/**
 * The Pink Gold badge (D115): shows that a person is a Pink Gold member, Pinkilock's paid members.
 * Only yes or no comes from the server (`Profile.pinkGold`); the badge says nothing else and changes
 * nothing else. It sits on a portrait, so it has the dark backing every badge on a photo has.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { color, radius, space } from '../theme/tokens';
import { T } from './ui/T';
import { fmtDay, t } from '../i18n';
import type { Wallet } from '../domain/wallet';

interface Props {
  person: { name: string; pinkGold?: boolean };
  /** My own card on Me: the badge is read out as mine. */
  mine?: boolean;
}

export function PinkGold({ person, mine }: Props) {
  if (!person.pinkGold) return null;
  const label = mine ? t('pinkGold.mine') : t('pinkGold.label', { name: person.name });
  return (
    <View style={styles.pill} accessible accessibilityRole="text" accessibilityLabel={label}>
      <View style={styles.gem}>
        <Feather name="star" size={11} color={color.onPink} />
      </View>
      <T v="label" c={color.gold}>{t('pinkGold.name')}</T>
    </View>
  );
}

/** The way in, on Me (D116): what Pink Gold gives, or until when mine is on. */
export function PinkGoldEntry({ wallet }: { wallet: Wallet | null }) {
  const on = !!wallet?.gold;
  const body = on ? (wallet?.goldUntil ? t('gold.meOn', { date: fmtDay(wallet.goldUntil) }) : t('gold.onForever')) : t('gold.meBody');
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('gold.meOpen')} onPress={() => router.push('/pink-gold')} style={({ pressed }) => [styles.entry, pressed && { opacity: 0.85 }]}>
      <View style={[styles.gem, styles.gemBig]}><Feather name="star" size={18} color={color.onPink} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" c={color.pink}>{t('gold.eyebrow')}</T>
        <T v="heading">{t('pinkGold.name')}</T>
        <T v="caption" c={color.textDim}>{body}</T>
      </View>
      <Feather name="chevron-right" size={20} color={color.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1.5, borderColor: color.gold, borderRadius: radius.pill,
    paddingLeft: 5, paddingRight: space.md, paddingVertical: 5, backgroundColor: color.onPhoto,
  },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.gold, borderRadius: radius.card, backgroundColor: color.pinkWash, padding: space.lg, marginTop: space.md },
  gemBig: { width: 40, height: 40, borderRadius: 20, borderWidth: 2 },
  gem: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color.pink, borderWidth: 1.5, borderColor: color.moon },
});
