/**
 * The Pink Gold badge (D115): shows that a person is a Pink Gold member, Pinkilock's paid members.
 * Only yes or no comes from the server (`Profile.pinkGold`); the badge says nothing else and changes
 * nothing else. It sits on a portrait, so it has the dark backing every badge on a photo has.
 */
import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { color, radius, space } from '../theme/tokens';
import { T } from './ui/T';
import { t } from '../i18n';

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

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    borderWidth: 1.5, borderColor: color.gold, borderRadius: radius.pill,
    paddingLeft: 5, paddingRight: space.md, paddingVertical: 5, backgroundColor: color.onPhoto,
  },
  gem: { width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color.pink, borderWidth: 1.5, borderColor: color.moon },
});
