/** Friends' words on a card (market review): how many vouched and what they picked. Never who. */
import { View } from 'react-native';
import type { Profile } from '../domain/types';
import { color, space } from '../theme/tokens';
import { Tag } from './ui/Chip';
import { T } from './ui/T';

export function Vouches({ person }: { person: Profile }) {
  if (!person.vouchCount) return null;
  return (
    <View style={{ gap: space.sm }} accessible accessibilityLabel={`${person.vouchCount} friends vouched: ${person.vouchPhrases?.join(', ')}`}>
      <T v="label" c={color.textDim}>{`Vouched by ${person.vouchCount} ${person.vouchCount === 1 ? 'friend' : 'friends'}`}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {(person.vouchPhrases ?? []).map((p) => <Tag key={p} label={p} tone={color.text} />)}
      </View>
      <T v="caption" c={color.textMute}>Their friends' words. Pinkilock does not check them.</T>
    </View>
  );
}
