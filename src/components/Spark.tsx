/**
 * The spark card: the moment a stranger's card turns into "oh, this one". Shows what lines up
 * between me and them (src/domain/spark.ts). Renders nothing when nothing does.
 */
import { Feather } from '@expo/vector-icons';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { ideaOf } from '../domain/ideas';
import { sparkOf } from '../domain/spark';
import type { Profile } from '../domain/types';
import { haptic } from '../lib/haptics';
import { color, radius, space } from '../theme/tokens';
import { Tag } from './ui/Chip';
import { T } from './ui/T';
import { t } from '../i18n';

export function Spark({ me, person }: { me: Profile; person: Profile }) {
  const spark = sparkOf(me, person);
  const strong = (spark?.count ?? 0) >= 2;

  // One buzz per card, and only when it is more than a single thing in common.
  useEffect(() => {
    if (strong) haptic.light();
  }, [person.id, strong]);

  if (!spark) return null;
  const summary = [
    ...spark.vibes,
    ...spark.ideaIds.map((id) => ideaOf(id).title),
    ...spark.opposites.map(([mine, theirs]) => t('spark.oppositeSpoken', { mine, name: person.name, theirs })),
  ].join(', ');

  return (
    <Animated.View
      entering={ZoomIn.duration(320)}
      style={styles.card}
      accessible
      accessibilityLabel={t('spark.spoken', { title: spark.title, count: spark.count, name: person.name, summary })}
    >
      <View style={styles.head}>
        <Feather name="zap" size={16} color={color.gold} />
        <T v="label" c={color.gold} style={{ flex: 1 }}>{spark.title}</T>
        <T v="label" c={color.textDim}>{t('spark.linesUp', { count: spark.count })}</T>
      </View>
      {spark.vibes.length + spark.ideaIds.length > 0 && (
        <View style={styles.wrap}>
          {spark.vibes.map((v) => <Tag key={v} label={v} tone={color.gold} />)}
          {spark.ideaIds.map((id) => <Tag key={id} label={`${ideaOf(id).emoji} ${ideaOf(id).title}`} tone={color.text} />)}
        </View>
      )}
      {spark.opposites.map(([mine, theirs]) => (
        <T key={mine} v="caption" c={color.textDim}>{t('spark.opposite', { mine, name: person.name, theirs })}</T>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.sm, borderWidth: 1, borderColor: color.gold, borderRadius: radius.card, backgroundColor: color.goldWash, padding: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
