/**
 * The first thing anyone sees, in the app and on the website: the clay pinkies hooking in a night
 * sky over Mumbai, the promise in big type, the three steps as notes stuck down by hand, and a few
 * of the real places plans happen at.
 *
 * This is the phone and narrow-window version, one column. In a wide browser window onboarding shows
 * `Landing` instead, the website's full front page, which reuses the scribble and the notes from here.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { color, radius, space } from '../theme/tokens';
import { VENUES, type VenueKind } from '../domain/venues';
import { Loop } from './Loop';
import { NightSky } from './NightSky';
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

/** A few of the real places plans happen at (the venue catalogue), so the city is in the picture. */
const PLACE_IDS = ['mum_marine_drive', 'mum_carter_road', 'mum_prithvi', 'mum_juhu_beach', 'mum_kala_ghoda'];
const PLACES = VENUES.filter((v) => PLACE_IDS.includes(v.id));
const KIND_ICON: Record<VenueKind, keyof typeof Feather.glyphMap> = { promenade: 'sunset', park: 'feather', mall: 'shopping-bag', market: 'shopping-cart', landmark: 'star' };

function Places() {
  return (
    <View style={{ gap: space.md }}>
      <T v="label" c={color.gold}>Where plans happen</T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingRight: space.lg }} style={{ marginRight: -space.xl }}>
        {PLACES.map((v) => (
          <View key={v.id} style={styles.place}>
            <Feather name={KIND_ICON[v.kind]} size={20} color={color.gold} />
            <T v="bodyBold" numberOfLines={2}>{v.name}</T>
            <T v="caption" c={color.textDim}>{v.area}</T>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

export function Welcome() {
  return (
    <View style={{ gap: space.xl }}>
      <NightSky>
        <Loop name="pinkyLock" />
        <Scribble wide={false} />
      </NightSky>
      <T v="mega" style={styles.headline}>No ghosting.{'\n'}No endless{'\n'}swiping.</T>
      <T v="heading" c={color.textDim}>One person. One tiny plan. One pinky promise that you both show up.</T>
      <View style={{ marginTop: space.md }}><Notes /></View>
      <Places />
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
  place: { width: 150, minHeight: 112, justifyContent: 'flex-end', gap: 2, padding: space.md, borderRadius: radius.card, borderWidth: 1, borderColor: color.goldDeep, backgroundColor: color.surface },
  number: { fontSize: 36, lineHeight: 38, width: 22, textAlign: 'center' },
});
