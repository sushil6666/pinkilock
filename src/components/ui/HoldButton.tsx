/**
 * Press and hold to commit. Used where a tap would be too cheap: sending an ask, swearing the
 * promise, bailing. The fill sweeps for 900 ms with haptic ticks at one third and two thirds;
 * letting go early drains it.
 *
 * In a browser the same hold works with a mouse, a finger, and a held Space or Enter key. A screen
 * reader cannot hold, so its activation commits at once: on a phone that is the `activate`
 * action, in a browser it is a click that arrives with no press before it.
 */
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { ReduceMotion, cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { haptic } from '../../lib/haptics';
import { isWeb, swallowReleaseClick } from '../../lib/web';
import { color, radius, space, depth } from '../../theme/tokens';
import { T } from './T';

interface Props {
  label: string;
  onComplete: () => void;
  tone?: 'pink' | 'flare';
  disabled?: boolean;
  busy?: boolean;
}

const HOLD_MS = 900;

export function HoldButton({ label, onComplete, tone = 'pink', disabled, busy }: Props) {
  const progress = useSharedValue(0);
  const [width, setWidth] = useState(0);
  /** True from press-in to press-out, whatever is pressing: finger, mouse or key. */
  const pressing = useRef(false);
  const releasedAt = useRef(0);
  const fill = tone === 'pink' ? color.pink : color.flare;
  const off = disabled || busy;

  useAnimatedReaction(
    () => Math.floor(progress.value * 3),
    (step, prev) => {
      if (prev !== null && step > prev && step < 3) runOnJS(haptic.tick)();
    },
  );

  const fillStyle = useAnimatedStyle(() => ({ width: width * progress.value }));

  const done = () => {
    // The finger is usually still down, and the screen is about to change under it.
    if (pressing.current) swallowReleaseClick();
    haptic.medium();
    onComplete();
    progress.value = withTiming(0, { duration: 400 });
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint="Press and hold for one second"
      accessibilityState={{ disabled: !!off }}
      accessibilityActions={[{ name: 'activate' }]}
      onAccessibilityAction={() => !off && done()}
      disabled={off}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      // In a browser, a click with no press around it comes from assistive technology, never from
      // a finger, a mouse or a key: those all press in first, and their click is the release.
      onPress={() => {
        if (isWeb && !pressing.current && Date.now() - releasedAt.current > 600) done();
      }}
      onPressIn={() => {
        pressing.current = true;
        haptic.light();
        // The sweep is the timer, not decoration: with reduced motion it must still take its 900 ms,
        // or a hold would commit on a tap.
        progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear, reduceMotion: ReduceMotion.Never }, (finished) => {
          if (finished) runOnJS(done)();
        });
      }}
      onPressOut={() => {
        pressing.current = false;
        releasedAt.current = Date.now();
        if (progress.value < 1) {
          cancelAnimation(progress);
          progress.value = withTiming(0, { duration: 180 });
        }
      }}
      style={[styles.base, { borderColor: fill }, off && { opacity: 0.4 }]}
    >
      <Animated.View style={[styles.fill, { backgroundColor: fill }, fillStyle]} />
      <View style={styles.label}>
        {busy ? <ActivityIndicator color={color.text} /> : <T v="bodyBold">{label}</T>}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // The thick bottom edge is the same slab the other buttons stand on (`depth`).
  base: { minHeight: 56, borderRadius: radius.card, borderWidth: 1.5, borderBottomWidth: depth, backgroundColor: color.surface, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.55 },
  label: { alignItems: 'center', paddingHorizontal: space.xl },
});
