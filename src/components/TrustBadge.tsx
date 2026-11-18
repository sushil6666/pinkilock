/** The Promise Keeper badge. Always a number, a tier in words and (large size) the raw record. */
import { Feather } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { trustOf } from '../domain/trust';
import { color, radius, space } from '../theme/tokens';
import { T } from './ui/T';

interface Props {
  person: { kept: number; flaked: number; trustScore?: number };
  size?: 'sm' | 'lg';
  /** Score only, for rows where a name needs the room. The tier is still read out. */
  brief?: boolean;
}

export function TrustBadge({ person, size = 'sm', brief }: Props) {
  const t = trustOf(person);
  const label = `Trust score ${t.score}, ${t.label}, ${t.kept} kept, ${t.flaked} flaked`;
  if (size === 'sm') {
    return (
      <View style={[styles.pill, { borderColor: t.tone }]} accessible accessibilityLabel={label}>
        <Feather name="shield" size={15} color={t.tone} />
        <T v="label" c={t.tone} style={{ fontVariant: ['tabular-nums'] }}>{t.score}</T>
        {!brief && <T v="label" c={color.text}>{t.label}</T>}
      </View>
    );
  }
  return (
    <View style={styles.card} accessible accessibilityLabel={label}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Feather name="shield" size={14} color={t.tone} />
          <T v="label" c={t.tone}>{t.label}</T>
        </View>
        <T v="caption" c={color.textDim}>{t.kept} kept  /  {t.flaked} flaked</T>
        <View style={styles.bar}>
          <View style={{ flex: Math.max(t.kept, 0.001), backgroundColor: color.gold }} />
          <View style={{ flex: t.flaked, backgroundColor: color.flare }} />
          {t.kept + t.flaked === 0 && <View style={{ flex: 1, backgroundColor: color.line }} />}
        </View>
      </View>
      <T v="mega" c={t.tone}>{t.score}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: 6, backgroundColor: color.onPhoto },
  card: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, paddingHorizontal: space.lg, paddingVertical: space.md },
  bar: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: space.sm, gap: 2 },
});
