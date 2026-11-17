/**
 * An error on screen: the words, and under them the reference (`PL033 · 7F3K2M9Q`) that finds
 * the cause on the server. The reference can be selected and copied. Text with no reference
 * (a rule the screen checked itself) shows as the words alone.
 */
import type { StyleProp, TextStyle } from 'react-native';
import { View } from 'react-native';
import { splitRef } from '../../domain/errors';
import { color } from '../../theme/tokens';
import { T } from './T';

export function ErrorText({ text, tone = color.flare, style }: { text: string | null | undefined; tone?: string; style?: StyleProp<TextStyle> }) {
  if (!text) return null;
  const { message, ref } = splitRef(text);
  return (
    <View accessibilityRole="alert" style={{ gap: 2 }}>
      <T v="caption" c={tone} style={style}>{message}</T>
      {ref ? <T v="caption" c={color.textMute} selectable accessibilityLabel={`Error reference ${ref}`}>{ref}</T> : null}
    </View>
  );
}
