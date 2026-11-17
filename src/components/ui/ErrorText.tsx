/**
 * An error on screen: the words, and under them the reference (`PL033 · 7F3K2M9Q`) that finds
 * the cause on the server. The reference can be selected and copied. Text with no reference
 * (a rule the screen checked itself) shows as the words alone. The one refusal a person can fix on
 * the spot, the link gate (PL068), comes with the button that fixes it.
 */
import type { StyleProp, TextStyle } from 'react-native';
import { router } from 'expo-router';
import { View } from 'react-native';
import { splitRef } from '../../domain/errors';
import { color } from '../../theme/tokens';
import { Button } from './Button';
import { T } from './T';

export function ErrorText({ text, tone = color.flare, style }: { text: string | null | undefined; tone?: string; style?: StyleProp<TextStyle> }) {
  if (!text) return null;
  const { message, ref } = splitRef(text);
  return (
    <View accessibilityRole="alert" style={{ gap: 2 }}>
      <T v="caption" c={tone} style={style}>{message}</T>
      {ref ? <T v="caption" c={color.textMute} selectable accessibilityLabel={`Error reference ${ref}`}>{ref}</T> : null}
      {ref?.startsWith('PL068') ? (
        <Button kind="ghost" icon="mail" label="Add your email" onPress={() => router.push({ pathname: '/account/sign-in', params: { mode: 'link', kind: 'email' } })} />
      ) : null}
    </View>
  );
}
