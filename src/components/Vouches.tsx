/** Friends' words on a card (market review): how many vouched and what they picked. Never who. */
import { View } from 'react-native';
import type { Profile } from '../domain/types';
import { color, space } from '../theme/tokens';
import { Tag } from './ui/Chip';
import { T } from './ui/T';
import { t } from '../i18n';

export function Vouches({ person }: { person: Profile }) {
  if (!person.vouchCount) return null;
  return (
    <View style={{ gap: space.sm }} accessible accessibilityLabel={t('vouches.spoken', { count: person.vouchCount, words: person.vouchPhrases?.join(', ') ?? '' })}>
      <T v="label" c={color.textDim}>{t('vouches.by', { count: person.vouchCount })}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {(person.vouchPhrases ?? []).map((p) => <Tag key={p} label={p} tone={color.text} />)}
      </View>
      <T v="caption" c={color.textMute}>{t('vouches.unchecked')}</T>
    </View>
  );
}
