/**
 * Two columns on a desktop window, one after the other on a phone. For screens with two kinds of
 * thing: a picture and its details, the next plan and the rest. `Grid` lays a list out in two
 * columns on desktop and leaves it a single list on a phone.
 */
import { Children, type ReactNode } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { useDesktop } from '../../lib/desktop';
import { space } from '../../theme/tokens';

export function Columns({ left, right, ratio = [1, 1], gap = space.lg, style }: { left: ReactNode; right: ReactNode; ratio?: [number, number]; gap?: number; style?: StyleProp<ViewStyle> }) {
  const desktop = useDesktop();
  if (!desktop) {
    return <View style={[{ gap }, style]}>{left}{right}</View>;
  }
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: space.x5 }, style]}>
      <View style={{ flex: ratio[0], gap, minWidth: 0 }}>{left}</View>
      <View style={{ flex: ratio[1], gap, minWidth: 0 }}>{right}</View>
    </View>
  );
}

export function Grid({ children, gap = space.md, cols = 2 }: { children: ReactNode; gap?: number; cols?: number }) {
  const desktop = useDesktop();
  const items = Children.toArray(children);
  if (!desktop || items.length === 0) return <View style={{ gap }}>{items}</View>;
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return (
    <View style={{ gap }}>
      {rows.map((row, r) => (
        <View key={r} style={{ flexDirection: 'row', gap }}>
          {row.map((item, k) => <View key={k} style={{ flex: 1, minWidth: 0 }}>{item}</View>)}
          {Array.from({ length: cols - row.length }, (_, k) => <View key={`gap${k}`} style={{ flex: 1 }} />)}
        </View>
      ))}
    </View>
  );
}
