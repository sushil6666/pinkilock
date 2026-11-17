import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../../lib/haptics';
import { elevation } from '../../theme/elevation';
import { color, motion, radius, space } from '../../theme/tokens';
import { T } from './T';

type Kind = 'primary' | 'ghost' | 'danger' | 'quiet';

interface Props {
  label: string;
  onPress: () => void;
  kind?: Kind;
  icon?: keyof typeof Feather.glyphMap;
  disabled?: boolean;
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Button({ label, onPress, kind = 'primary', icon, disabled, busy, style, accessibilityHint }: Props) {
  const scale = useSharedValue(1);
  const pressed = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const off = disabled || busy;
  // A primary button that cannot be pressed yet is a quiet blue slab, not a faded pink one:
  // pink at half strength over the blue ground turns to a muddy purple.
  const waiting = kind === 'primary' && !!disabled && !busy;
  const fg = waiting ? color.textMute : kind === 'primary' ? color.onPink : kind === 'danger' ? color.flare : color.text;

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPressIn={() => {
        scale.value = withTiming(0.97, { duration: 90 });
        haptic.light();
      }}
      onPressOut={() => {
        scale.value = withSpring(1, motion.spring.snappy);
      }}
      onPress={onPress}
      style={[styles.base, styles[kind], kind === 'primary' && !off && elevation('glow'), waiting ? styles.waiting : off && styles.off, pressed, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : (
        <>
          {icon && <Feather name={icon} size={18} color={fg} />}
          <T v="bodyBold" c={fg} numberOfLines={1}>{label}</T>
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 56, borderRadius: radius.card, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  primary: { backgroundColor: color.pink },
  waiting: { backgroundColor: color.surfaceHi, borderWidth: 1, borderColor: color.line },
  ghost: { borderWidth: 1, borderColor: color.line, backgroundColor: color.surface },
  danger: { borderWidth: 1, borderColor: color.flare, backgroundColor: color.flareWash },
  quiet: { minHeight: 48 },
  off: { opacity: 0.4 },
});
