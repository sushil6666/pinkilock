import { StyleSheet, View } from 'react-native';
import { countdownParts, pad2 } from '../domain/time';
import { color, space } from '../theme/tokens';
import { T } from './ui/T';
import { t } from '../i18n';

/** The big live countdown: days only when there are any, always two digits, tabular so it never jitters. */
export function Countdown({ target, now, tone = color.text }: { target: number; now: number; tone?: string }) {
  const p = countdownParts(target, now);
  const cells: [string, string][] = p.days > 0
    ? [[String(p.days), t('countdown.days')], [pad2(p.hours), t('countdown.hrs')], [pad2(p.minutes), t('countdown.min')]]
    : [[pad2(p.hours), t('countdown.hrs')], [pad2(p.minutes), t('countdown.min')], [pad2(p.seconds), t('countdown.sec')]];
  const spoken = p.days > 0 ? t('countdown.spokenDays', { ...p }) : p.hours > 0 ? t('countdown.spokenHours', { ...p }) : t('countdown.spokenMinutes', { ...p });
  return (
    <View style={styles.row} accessible accessibilityRole="timer" accessibilityLabel={spoken}>
      {cells.map(([value, unit], i) => (
        <View key={unit} style={[styles.cell, value.length < 2 && styles.hug]}>
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
  // A one-digit day count hugs its digit, so its colon sits next to it rather than across a gap.
  hug: { minWidth: 0 },
  colon: { position: 'absolute', right: -space.xl, top: -3 },
});
