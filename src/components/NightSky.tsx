/**
 * The night over Mumbai that the first screen opens on: a golden moon, a scatter of stars that
 * twinkle, and the skyline along the sea (the Gateway arch, towers, the Sea Link's cables) with the
 * moon's light on the water. Whatever is passed as children (the clay pinkies) floats in the sky.
 *
 * Mumbai's landmarks show only where the city is Mumbai (or not known yet, as on the first screen);
 * anywhere else the skyline is plain towers, so Bhubaneswar does not get the Gateway (D086).
 *
 * Decoration only: hidden from screen readers, and still with reduced motion. Colours come from
 * the tokens, so the sky is the screen's own `bg` and the pinkies' GIF sits on it with no edge.
 */
import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { webOnly } from '../lib/web';
import { color, gutter } from '../theme/tokens';

/** x and y as fractions of the sky, size in px, and when in the cycle each one brightens. */
const STARS: [number, number, number, number][] = [
  [0.06, 0.08, 3, 0], [0.18, 0.2, 2, 600], [0.3, 0.05, 2, 1200], [0.44, 0.16, 3, 300], [0.08, 0.42, 2, 900],
  [0.94, 0.5, 2, 1500], [0.6, 0.06, 2, 200], [0.24, 0.55, 3, 1100], [0.86, 0.68, 2, 500], [0.5, 0.36, 2, 1700],
  [0.14, 0.7, 2, 1300], [0.7, 0.58, 3, 800],
];

function Star({ x, y, size, delay, still }: { x: number; y: number; size: number; delay: number; still: boolean }) {
  const glow = useSharedValue(0.5);
  useEffect(() => {
    if (still) return;
    glow.value = withDelay(delay, withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.quad) }), -1, true));
  }, [delay, glow, still]);
  const style = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.65, transform: [{ scale: 0.7 + glow.value * 0.5 }] }));
  return <Animated.View style={[styles.star, { left: `${x * 100}%`, top: `${y * 100}%`, width: size, height: size, borderRadius: size }, style]} />;
}

function Moon({ still, at }: { still: boolean; at?: StyleProp<ViewStyle> }) {
  const breathe = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    breathe.value = withRepeat(withTiming(1, { duration: 3200, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [breathe, still]);
  const glow = useAnimatedStyle(() => ({ transform: [{ scale: 1 + breathe.value * 0.05 }] }));
  return (
    <View style={[styles.moonWrap, at]}>
      <Animated.View style={[styles.moon, GLOW, glow]}>
        <View style={[styles.crater, { width: 14, height: 14, left: 18, top: 22 }]} />
        <View style={[styles.crater, { width: 9, height: 9, left: 44, top: 46 }]} />
        <View style={[styles.crater, { width: 7, height: 7, left: 26, top: 52 }]} />
      </Animated.View>
    </View>
  );
}

/** More of the city either side of the landmarks, for a sky as wide as a desktop window. Fixed, so it never jumps. */
const SPREAD = 805;
const SIDE_TOWERS: [number, number, number][] = (() => {
  let seed = 7;
  const next = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const out: [number, number, number][] = [];
  for (const [from, to] of [[-SPREAD, -4], [394, 390 + SPREAD]]) {
    for (let x = from; x < to; ) {
      const w = 20 + Math.round(next() * 22);
      out.push([x, Math.min(w, to - x), 22 + Math.round(next() * 46)]);
      x += w + 2 + Math.round(next() * 8);
    }
  }
  return out;
})();

/** Plain towers where the Gateway and the Sea Link stand, for any city that is not Mumbai. */
const MIDDLE_TOWERS: [number, number, number][] = [[100, 26, 50], [128, 30, 34], [160, 22, 62], [184, 34, 40], [220, 26, 56], [248, 30, 30], [280, 18, 48]];

/** The city along the water: towers, and in Mumbai the Gateway's arch and the Sea Link's tower and cables. */
function Skyline({ wide, landmarks = true }: { wide?: boolean; landmarks?: boolean }) {
  const windows = [14, 46, 54, 76, 132, 166, 300, 334, 348, 372];
  // Wide: the same landmarks in the middle of a longer city, drawn a little bigger, cropped at the
  // sides rather than the top, so the towers keep their tops on any window.
  const box = wide ? `${-SPREAD} 0 ${390 + SPREAD * 2} 86` : '0 0 390 86';
  return (
    <Svg width="100%" height={wide ? 120 : 86} viewBox={box} preserveAspectRatio="xMidYMax slice">
      <Defs>
        <LinearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color.gold} stopOpacity={0.22} />
          <Stop offset="1" stopColor={color.gold} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <G fill={color.surfaceHi}>
        <Rect x={0} y={34} width={40} height={42} />
        <Rect x={38} y={16} width={26} height={60} />
        <Rect x={66} y={40} width={30} height={36} />
        {landmarks ? (
          <>
            <Path d="M108 76 V30 h72 v46 h-19 v-24 a17 17 0 0 0 -34 0 v24 z" />
            <Rect x={102} y={22} width={84} height={10} />
            <Rect x={110} y={8} width={10} height={16} />
            <Rect x={168} y={8} width={10} height={16} />
          </>
        ) : MIDDLE_TOWERS.map(([x, w, h]) => <Rect key={x} x={x} y={76 - h} width={w} height={h} />)}
        <Rect x={300} y={10} width={22} height={66} />
        <Rect x={326} y={30} width={34} height={46} />
        <Rect x={362} y={46} width={28} height={30} />
        {wide && SIDE_TOWERS.map(([x, w, h]) => <Rect key={x} x={x} y={76 - h} width={w} height={h} />)}
      </G>
      {landmarks && (
        <G stroke={color.gold} strokeWidth={1.4} fill="none" opacity={0.85}>
          <Path d="M190 70 H298" />
          <Path d="M245 70 V6" />
          <Path d="M245 10 L200 70 M245 10 L215 70 M245 10 L230 70 M245 10 L290 70 M245 10 L275 70 M245 10 L260 70" />
        </G>
      )}
      <G fill={color.moon}>
        {windows.map((x, i) => <Rect key={x} x={x} y={46 + (i % 3) * 8} width={4} height={4} />)}
        {wide && SIDE_TOWERS.filter((_, i) => i % 2 === 0).map(([x, w, h], i) => <Rect key={x} x={x + Math.round(w / 3)} y={76 - h + 8 + (i % 3) * 8} width={4} height={4} />)}
      </G>
      <Rect x={wide ? -SPREAD : 0} y={76} width={wide ? 390 + SPREAD * 2 : 390} height={10} fill="url(#sea)" />
    </Svg>
  );
}

/** Just the skyline, for a layout that runs the city along the bottom of the whole window. */
export function City({ wide, landmarks }: { wide?: boolean; landmarks?: boolean }) {
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden pointerEvents="none" {...webOnly({ 'aria-hidden': true })}>
      <Skyline wide={wide} landmarks={landmarks} />
    </View>
  );
}

/**
 * For a sky wider than a phone: `moon` moves the moon (top right by default), `wide` lengthens the
 * city, `landmarks` turns Mumbai's off, and `city={false}` leaves the skyline out (drawn elsewhere).
 */
export function NightSky({ children, moon, wide, landmarks, city = true }: { children?: ReactNode; moon?: StyleProp<ViewStyle>; wide?: boolean; landmarks?: boolean; city?: boolean }) {
  const still = useReducedMotion();
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden {...webOnly({ 'aria-hidden': true })}>
      <View style={styles.sky}>
        {STARS.map(([x, y, size, delay]) => <Star key={`${x}${y}`} x={x} y={y} size={size} delay={delay} still={still} />)}
        <Moon still={still} at={moon} />
        <View style={styles.float}>{children}</View>
      </View>
      {city && <View style={styles.city}><Skyline wide={wide} landmarks={landmarks} /></View>}
    </View>
  );
}

const MOON = 72;
/** Moonlight: a soft gold glow around the moon, drawn as a shadow so it never muddies the sky. */
const GLOW = Platform.select({
  web: { boxShadow: `0 0 28px 8px ${color.goldWash}, 0 0 48px 14px ${color.goldWash}` },
  default: { shadowColor: color.gold, shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 0 } },
}) as object;
const styles = StyleSheet.create({
  sky: { position: 'relative', paddingTop: MOON * 0.9 },
  float: { zIndex: 1 },
  // The city runs to the screen's edges, past the gutter.
  city: { marginHorizontal: -gutter },
  star: { position: 'absolute', backgroundColor: color.moon },
  moonWrap: { position: 'absolute', right: 8, top: 40, width: MOON, height: MOON, alignItems: 'center', justifyContent: 'center' },
  moon: { width: MOON, height: MOON, borderRadius: MOON / 2, backgroundColor: color.moon },
  crater: { position: 'absolute', borderRadius: 99, backgroundColor: color.gold, opacity: 0.55 },
});
