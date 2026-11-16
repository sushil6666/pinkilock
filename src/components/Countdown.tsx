import { StyleSheet, View } from 'react-native';
import { countdownParts, pad2 } from '../domain/time';
import { color, space } from '../theme/tokens';
import { T } from './ui/T';

/** The big live countdown: days only when there are any, always two digits, tabular so it never jitters. */
export function Countdown({ target, now, tone = color.text }: { target: number; now: number; tone?: string }) {
  const p = countdownParts(target, now);
  const cells: [string, string][] = p.days > 0
    ? [[String(p.days), 'days'], [pad2(p.hours), 'hrs'], [pad2(p.minutes), 'min']]
    : [[pad2(p.hours), 'hrs'], [pad2(p.minutes), 'min'], [pad2(p.seconds), 'sec']];
  const spoken = p.days > 0 ? `${p.days} days ${p.hours} hours` : p.hours > 0 ? `${p.hours} hours ${p.minutes} minutes` : `${p.minutes} minutes ${p.seconds} seconds`;
  return (
    <View style={styles.row} accessible accessibilityRole="timer" accessibilityLabel={`${spoken} to go`}>
      {cells.map(([value, unit], i) => (
        <View key={unit} style={styles.cell}>
          <T v="mega" c={tone}>{value}</T>
          <T v="label" c={color.textMute}>{unit}</T>
          {i < cells.length - 1 && <T v="mega" c={color.line} style={styles.colon}>:</T>}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.xxl },
  cell: { alignItems: 'flex-start', minWidth: 72 },
  colon: { position: 'absolute', right: -space.xl, top: -3 },
});
