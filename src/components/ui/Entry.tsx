/**
 * A door to another screen, as one line and an arrow: icon, name, and at most a short value such
 * as a balance. What is behind it is said on the screen it opens.
 */
import { Feather } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { focusRing } from '../../lib/web';
import { color, radius, space } from '../../theme/tokens';
import { T } from './T';

interface Props {
  icon: ReactNode;
  title: string;
  value?: string;
  /** What a screen reader says: where the tap goes. */
  spoken: string;
  onPress: () => void;
  /** The border and wash: gold, pink or the plain card. */
  tone?: 'gold' | 'pink' | 'plain';
}

export function Entry({ icon, title, value, spoken, onPress, tone = 'plain' }: Props) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={spoken} onPress={onPress} style={({ pressed }) => [styles.entry, styles[tone], focusRing, pressed && { opacity: 0.85 }]}>
      {icon}
      <T v="bodyBold" style={{ flex: 1 }} numberOfLines={2}>{title}</T>
      {value ? <T v="caption" c={tone === 'plain' ? color.textDim : color.gold} numberOfLines={1}>{value}</T> : null}
      <Feather name="chevron-right" size={20} color={color.textDim} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderRadius: radius.card, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56, marginTop: space.md },
  plain: { borderColor: color.line, backgroundColor: color.surface },
  gold: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
  pink: { borderColor: color.gold, backgroundColor: color.pinkWash },
});
