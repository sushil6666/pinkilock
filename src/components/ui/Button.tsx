import { Feather } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../../lib/haptics';
import { color, depth, motion, radius, space } from '../../theme/tokens';
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
  /**
   * Extra room above and below a label that is expected to take two lines. Every label may wrap to
   * two lines on a narrow phone rather than be cut short (a helpline number must be read whole).
   */
  wrap?: boolean;
}

/** The slab under each kind: what the button stands on, and what shows below it. */
const SLAB: Record<Kind, string | null> = { primary: color.goldDeep, ghost: color.line, danger: color.flare, quiet: null };

/**
 * A button is a slab you can press: the face stands `depth` above a darker block and sinks onto it
 * under a finger, a mouse or a key, then springs back. A button that cannot be pressed sits sunk,
 * level with its slab, so it reads as not there yet without fading to a muddy colour.
 */
export function Button({ label, onPress, kind = 'primary', icon, disabled, busy, style, accessibilityHint, wrap }: Props) {
  const off = disabled || busy;
  const slab = SLAB[kind];
  const sink = useSharedValue(off ? 1 : 0);
  useEffect(() => {
    sink.value = withTiming(off ? 1 : 0, { duration: motion.fast });
  }, [off, sink]);
  const face = useAnimatedStyle(() => ({ transform: [{ translateY: slab ? sink.value * depth : 0 }] }));
  // A primary button that cannot be pressed yet is a quiet indigo slab, not a faded gold one:
  // gold at half strength over the night sky turns to a muddy olive.
  const waiting = kind === 'primary' && !!disabled && !busy;
  const fg = waiting ? color.textMute : kind === 'primary' ? color.onGold : kind === 'danger' ? color.flare : color.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!off, busy: !!busy }}
      disabled={off}
      onPressIn={() => {
        sink.value = withTiming(1, { duration: 70 });
        haptic.light();
      }}
      onPressOut={() => {
        sink.value = withSpring(0, motion.spring.snappy);
      }}
      onPress={onPress}
      style={[slab ? { paddingBottom: depth } : null, style]}
    >
      {/* The block under the face. It starts `depth` down, so a sunk face never shows it above. */}
      {slab ? <View style={[styles.slab, { backgroundColor: slab }]} /> : null}
      <Animated.View style={[styles.base, styles[kind], waiting ? styles.waiting : busy && styles.off, face]}>
        {busy ? <ActivityIndicator color={fg} /> : (
          <>
            {icon && <Feather name={icon} size={18} color={fg} />}
            <T v="bodyBold" c={fg} numberOfLines={2} style={[{ flexShrink: 1, textAlign: 'center' }, wrap ? { paddingVertical: space.sm } : null]}>{label}</T>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slab: { position: 'absolute', left: 0, right: 0, bottom: 0, top: depth, borderRadius: radius.card },
  base: { minHeight: 56, borderRadius: radius.card, paddingHorizontal: space.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm },
  primary: { backgroundColor: color.gold },
  waiting: { backgroundColor: color.surfaceHi, borderWidth: 1, borderColor: color.line },
  ghost: { borderWidth: 1, borderColor: color.line, backgroundColor: color.surface },
  danger: { borderWidth: 1, borderColor: color.flare, backgroundColor: color.surface },
  quiet: { minHeight: 48 },
  off: { opacity: 0.6 },
});
