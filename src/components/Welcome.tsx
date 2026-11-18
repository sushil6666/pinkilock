/**
 * The first thing anyone sees, in the app and on the website: the clay pinkies hooking, the
 * promise in big type, and the three steps as notes stuck down by hand.
 *
 * This is the phone and narrow-window version, one column. In a wide browser window onboarding shows
 * `Landing` instead, the website's full front page, which reuses the scribble and the notes from here.
 */
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, radius, space } from '../theme/tokens';
import { Loop } from './Loop';
import { Button } from './ui/Button';
import { T } from './ui/T';

const STEPS: [string, string, string][] = [
  ['1', 'Send a vibe check: a real plan with a time on it.', '-1.6deg'],
  ['2', 'Lock pinkies. Now it is a promise.', '1.1deg'],
  ['3', 'Show up. Unlock each other. Build your record.', '-0.7deg'],
];

/** A note scribbled beside the pinkies, with an arrow that is not quite straight. */
export function Scribble({ wide }: { wide: boolean }) {
  return (
    <View style={[styles.scribble, wide && styles.scribbleWide]} accessible={false} importantForAccessibility="no-hide-descendants">
      <Svg width={58} height={46} viewBox="0 0 58 46" style={{ marginRight: -6 }}>
        <Path d="M54 40 C 40 42, 18 36, 9 10" stroke={color.pink} strokeWidth={2.6} fill="none" strokeLinecap="round" />
        <Path d="M3 17 L 9 8 L 17 15" stroke={color.pink} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <T v="hand" c={color.pink} style={styles.scribbleText}>this is the{'\n'}whole app.</T>
    </View>
  );
}

export function Notes() {
  return (
    <View style={{ gap: space.lg }}>
      {STEPS.map(([n, line, tilt]) => (
        <View key={n} style={[styles.under, { transform: [{ rotate: tilt }] }]}>
          <View style={styles.note}>
            <T v="hand" c={color.pink} style={styles.number} maxFontSizeMultiplier={1}>{n}</T>
            <T style={{ flex: 1 }}>{line}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

export function Welcome() {
  return (
    <View style={{ gap: space.xl }}>
      <View>
        <Loop name="pinkyLock" />
        <Scribble wide={false} />
      </View>
      <T v="label" c={color.pink}>Pinkilock</T>
      <T v="mega" style={styles.headline}>No ghosting.{'\n'}No endless{'\n'}swiping.</T>
      <T v="heading" c={color.textDim}>One person. One tiny plan. One pinky promise that you both show up.</T>
      <View style={{ marginTop: space.md }}><Notes /></View>
      <Button kind="quiet" icon="log-in" label="I already have an account" onPress={() => router.push({ pathname: '/account/sign-in', params: { mode: 'sign_in' } })} />
    </View>
  );
}

const styles = StyleSheet.create({
  headline: { fontSize: 46, lineHeight: 48 },
  scribble: { position: 'absolute', right: 0, bottom: -space.md, flexDirection: 'row', alignItems: 'flex-end', transform: [{ rotate: '-5deg' }] },
  // Beside the hooked fingers, which sit a little above the middle of the drawing.
  scribbleWide: { right: space.lg, bottom: '14%' },
  scribbleText: { textAlign: 'left' },
  // A note stuck down by hand: the face sits a few pixels off a darker block, a little crooked.
  under: { backgroundColor: color.line, borderRadius: radius.chip },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.chip, paddingHorizontal: space.lg, paddingVertical: space.md, transform: [{ translateX: -4 }, { translateY: -4 }] },
  number: { fontSize: 36, lineHeight: 38, width: 22, textAlign: 'center' },
});
