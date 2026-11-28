/**
 * The Pink Gold badge (D115): shows that a person is a Pink Gold member, Pinkilock's paid members.
 * Only yes or no comes from the server (`Profile.pinkGold`); the badge says nothing else and changes
 * nothing else. It sits on a portrait, so it has the dark backing every badge on a photo has.
 */
import { Entry } from './ui/Entry';
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
  return <Entry tone="pink" icon={<View style={[styles.gem, styles.gemBig]}><Feather name="star" size={14} color={color.onPink} /></View>} title={t('pinkGold.name')} value={wallet?.gold ? t('fold.on') : undefined} spoken={t('gold.meOpen')} onPress={() => router.push('/pink-gold')} />;
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1.5, borderColor: color.gold, borderRadius: radius.pill,
    paddingLeft: 5, paddingRight: space.md, paddingVertical: 5, backgroundColor: color.onPhoto,
  },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.gold, borderRadius: radius.card, backgroundColor: color.pinkWash, padding: space.lg, marginTop: space.md },
  gemBig: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
  gem: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color.pink, borderWidth: 1.5, borderColor: color.moon },
});
