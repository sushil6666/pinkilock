/**
 * One line, one arrow. A section shows only its main line; everything else waits behind
 * the arrow and opens in place. Used wherever a screen has more to say than a glance needs.
 * Safety notices never go in one: they stay on screen.
 */
import { Feather } from '@expo/vector-icons';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { aria, focusRing } from '../../lib/web';
import { color, radius, space } from '../../theme/tokens';
import { T } from './T';

interface Props {
  /** The one line that always shows. */
  title: string;
  /** A short value beside it, such as a count or the city. */
  value?: string;
  icon?: ComponentProps<typeof Feather>['name'];
  /** Gold, for the line that matters most on a screen. */
  accent?: boolean;
  /** Opens with the details showing, for when there is something to fix. */
  open?: boolean;
  children: ReactNode;
}

export function Fold({ title, value, icon, accent, open: start = false, children }: Props) {
  const [open, setOpen] = useState(start);
  return (
    <View style={[styles.box, accent && styles.accent]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={value ? `${title}, ${value}` : title}
        accessibilityState={{ expanded: open }}
        {...aria({ expanded: open })}
        onPress={() => setOpen(!open)}
        hitSlop={4}
        style={({ pressed }) => [styles.row, focusRing, pressed && { opacity: 0.8 }]}
      >
        {icon ? <Feather name={icon} size={18} color={accent ? color.gold : color.textDim} /> : null}
        <T v="bodyBold" style={{ flex: 1 }} numberOfLines={2}>{title}</T>
        {value ? <T v="caption" c={color.textDim} numberOfLines={1} style={{ maxWidth: '45%' }}>{value}</T> : null}
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={accent ? color.gold : color.textDim} />
      </Pressable>
      {open ? <Animated.View entering={FadeIn.duration(180)} style={styles.body}>{children}</Animated.View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, marginTop: space.md, overflow: 'hidden' },
  accent: { borderColor: color.goldDeep },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, minHeight: 56 },
  body: { paddingHorizontal: space.lg, paddingBottom: space.lg, gap: space.sm },
});
