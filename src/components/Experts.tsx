/**
 * Expert tips (D127): the entry on Me, and the pieces both expert pages share.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { Entry } from '@/components/ui/Entry';
import { T } from '@/components/ui/T';
import { aria } from '@/lib/web';
import { EXPERT_RULES, WATCH_OUT } from '@/domain/experts';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

/** On Me, under Talk. */
export function ExpertsEntry() {
  return <Entry icon={<Feather name="book-open" size={20} color={color.gold} />} title={t('experts.meTitle')} spoken={t('experts.meOpen')} onPress={() => router.push('/experts')} />;
}

/** The warning signs, shown to everyone on the tips page (D127). */
export function WatchOut() {
  return (
    <View style={[styles.box, styles.watch]} accessibilityRole="summary">
      <View style={styles.row}>
        <Feather name="alert-triangle" size={18} color={color.flare} />
        <T v="bodyBold" style={{ flex: 1 }}>{t('experts.watchTitle')}</T>
      </View>
      {WATCH_OUT.map((k) => (
        <View key={k} style={styles.row}>
          <Feather name="x" size={14} color={color.flare} style={{ marginTop: 2 }} />
          <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t(`experts.watch.${k}`)}</T>
        </View>
      ))}
      <T v="caption" c={color.text}>{t('experts.watchBody')}</T>
    </View>
  );
}

/** The rules every expert agrees to, on the join page. */
export function ExpertRules() {
  return (
    <View style={styles.box}>
      <T v="heading">{t('experts.join.rulesTitle')}</T>
      {EXPERT_RULES.map((k) => (
        <View key={k} style={styles.row}>
          <Feather name="check" size={14} color={color.gold} style={{ marginTop: 2 }} />
          <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t(`experts.rules.${k}`)}</T>
        </View>
      ))}
      <T v="caption" c={color.text}>{t('experts.join.rulesBreak')}</T>
    </View>
  );
}

/** One pick from a list of long labels, which wrap (chips would run off a phone's edge). */
export function Choice({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} {...aria({ checked: selected })} accessibilityLabel={label} onPress={onPress}
      style={[styles.choice, selected && styles.choiceOn]}>
      <Feather name={selected ? 'check-circle' : 'circle'} size={18} color={selected ? color.pink : color.textDim} />
      <T v="body" style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surfaceHi, paddingVertical: space.sm, paddingHorizontal: space.md, minHeight: 44 },
  choiceOn: { borderColor: color.pink },
  box: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.sm },
  watch: { borderColor: color.flare },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
