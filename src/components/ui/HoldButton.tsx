/**
 * Press and hold to commit. Used where a tap would be too cheap: sending an ask, swearing the
 * promise, bailing. The fill sweeps for 900 ms with haptic ticks at one third and two thirds;
 * letting go early drains it.
 */
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, runOnJS, useAnimatedReaction, useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { haptic } from '../../lib/haptics';
import { color, radius, space } from '../../theme/tokens';
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
      onPressIn={() => {
        haptic.light();
        progress.value = withTiming(1, { duration: HOLD_MS, easing: Easing.linear }, (finished) => {
          if (finished) runOnJS(done)();
        });
      }}
      onPressOut={() => {
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
  base: { minHeight: 56, borderRadius: radius.card, borderWidth: 1.5, backgroundColor: color.surface, overflow: 'hidden', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.55 },
  label: { alignItems: 'center', paddingHorizontal: space.xl },
});
