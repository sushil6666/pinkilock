/** The Promise Keeper badge. Always a number, a tier in words and (large size) the raw record. */
import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { trustOf } from '../domain/trust';
import { color, radius, space } from '../theme/tokens';
import { T } from './ui/T';
import { t } from '../i18n';

interface Props {
  person: { kept: number; flaked: number; trustScore?: number };
  size?: 'sm' | 'lg';
  /** Score only, for rows where a name needs the room. The tier is still read out. */
  brief?: boolean;
}

export function TrustBadge({ person, size = 'sm', brief }: Props) {
  const tr = trustOf(person);
  const label = t('trust.label', { score: tr.score, tier: tr.label, kept: tr.kept, flaked: tr.flaked });
  if (size === 'sm') {
    return (
      <View style={[styles.pill, { borderColor: tr.tone }]} accessible accessibilityLabel={label}>
        <Feather name="shield" size={15} color={tr.tone} />
        <T v="label" c={tr.tone} style={{ fontVariant: ['tabular-nums'] }}>{tr.score}</T>
        {!brief && <T v="label" c={color.text}>{tr.label}</T>}
      </View>
    );
  }
  return (
    <View style={styles.card} accessible accessibilityLabel={label}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="shield" size={14} color={tr.tone} />
          <T v="label" c={tr.tone}>{tr.label}</T>
        </View>
        <T v="caption" c={color.textDim}>{t('trust.record', { kept: tr.kept, flaked: tr.flaked })}</T>
        <View style={styles.bar}>
          <View style={{ flex: Math.max(tr.kept, 0.001), backgroundColor: color.gold }} />
          <View style={{ flex: tr.flaked, backgroundColor: color.flare }} />
          {tr.kept + tr.flaked === 0 && <View style={{ flex: 1, backgroundColor: color.line }} />}
        </View>
      </View>
      <T v="mega" c={tr.tone}>{tr.score}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, backgroundColor: color.onPhoto },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, paddingHorizontal: space.lg, paddingVertical: space.md },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: space.sm, gap: 2 },
});
