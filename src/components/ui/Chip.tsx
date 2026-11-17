import { Pressable, StyleSheet } from 'react-native';
import { haptic } from '../../lib/haptics';
import { aria } from '../../lib/web';
import { color, radius, space } from '../../theme/tokens';
import { T } from './T';

interface Props {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  sub?: string;
}

export function Chip({ label, selected, onPress, disabled, sub }: Props) {
  const fg = selected ? color.onPink : color.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      {...(onPress ? aria({ pressed: !!selected }) : {})}
      accessibilityLabel={sub ? `${label}, ${sub}` : label}
      disabled={disabled || !onPress}
      hitSlop={4}
      onPress={() => {
        haptic.tick();
        onPress?.();
      }}
      style={[styles.base, !!sub && styles.row, selected && styles.selected, disabled && { opacity: 0.35 }]}
    >
      <T v="label" c={fg}>{label}</T>
      {sub ? <T v="caption" c={selected ? color.onPink : color.textDim}>{sub}</T> : null}
    </Pressable>
  );
}

/** A tag. Not a control unless it is given `onPress`, when it works as a small toggle. */
export function Tag({ label, tone = color.textDim, onPress, selected }: { label: string; tone?: string; onPress?: () => void; selected?: boolean }) {
  const tag = <T v="label" c={tone} style={[styles.tag, { borderColor: tone }]}>{label}</T>;
  if (!onPress) return tag;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!selected }}
      {...aria({ pressed: !!selected })}
      hitSlop={10}
      onPress={() => {
        haptic.tick();
        onPress();
      }}
    >
      {tag}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 40, paddingHorizontal: space.md, paddingVertical: space.sm, borderRadius: radius.chip, borderWidth: 1, borderColor: color.line, backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  row: { alignItems: 'flex-start', paddingVertical: space.md, gap: 2 },
  selected: { backgroundColor: color.pink, borderColor: color.pink },
  tag: { borderWidth: 1, borderRadius: radius.chip, paddingHorizontal: space.sm, paddingVertical: 3, overflow: 'hidden', alignSelf: 'flex-start' },
});
