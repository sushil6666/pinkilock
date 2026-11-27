/**
 * Your record, on Me (D122): my kept-plan streak in weeks, and where I stand in my city for keeping
 * promises. Only I see it: the city part is a top-percent bucket from the server, never a rank or a
 * name, and it is hidden until the city has 20 people to compare with.
 */
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { KEPT_STREAK_BADGE, keptStreak, type CityStanding } from '../domain/streaks';
import { quiet } from '../lib/log';
import { backend } from '../services';
import { useStore } from '../state/store';
import { color, radius, space } from '../theme/tokens';
import { T } from './ui/T';
import { t } from '../i18n';

export function YourRecord() {
  const me = useStore((s) => s.me);
  const invites = useStore((s) => s.invites);
  const [standing, setStanding] = useState<CityStanding | null>(null);
  const now = useMemo(() => Date.now(), []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      // The city part is extra: if it does not load, the streak still shows.
      backend.cityStanding().then((s) => alive && setStanding(s), quiet('record.standing'));
      return () => {
        alive = false;
      };
    }, []),
  );

  if (!me) return null;
  const streak = keptStreak(invites, me.id, now);
  const steady = streak.weeks >= KEPT_STREAK_BADGE;

  return (
    <View style={styles.panel}>
      <T v="label" c={color.gold}>{t('record.label')}</T>
      <View style={styles.row}>
        <View style={[styles.badge, steady && styles.badgeOn]}>
          <Feather name="award" size={22} color={steady ? color.onGold : color.textMute} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyBold" c={steady ? color.gold : color.text}>
            {steady ? t('record.steady', { count: streak.weeks }) : streak.weeks ? t('record.streak', { count: streak.weeks }) : t('record.streakNone')}
          </T>
          <T v="caption" c={color.textDim}>
            {steady
              ? streak.thisWeek ? t('record.keptThisWeek') : t('record.keepItGoing')
              : streak.weeks && !streak.thisWeek ? t('record.keepItGoing') : t('record.badgeNext', { count: KEPT_STREAK_BADGE - streak.weeks })}
          </T>
          {streak.best > streak.weeks ? <T v="caption" c={color.textMute}>{t('record.best', { count: streak.best })}</T> : null}
        </View>
      </View>

      {standing?.top ? (
        <View style={styles.row}>
          <View style={[styles.badge, styles.pink]}>
            <Feather name="trending-up" size={20} color={color.pinkDeep} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="bodyBold">{standing.top === 50 ? t('record.topHalf', { city: standing.city }) : t('record.top', { top: standing.top, city: standing.city })}</T>
            <T v="caption" c={color.textDim}>{t('record.topBody')}</T>
          </View>
        </View>
      ) : standing?.ready === false ? (
        <T v="caption" c={color.textDim}>{t('record.notReady', { city: standing.city })}</T>
      ) : standing && me.kept + me.flaked < 3 ? (
        <T v="caption" c={color.textDim}>{t('record.needThree', { city: standing.city })}</T>
      ) : null}

      {standing?.cityKeptPercent != null ? (
        <T v="caption" c={color.textDim}>{t('record.city', { city: standing.city, percent: standing.cityKeptPercent })}</T>
      ) : null}
      <T v="caption" c={color.textMute}>{t('record.private')}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, marginTop: space.xl },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  badge: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: color.gold, borderColor: color.goldDeep },
  pink: { backgroundColor: color.pinkWash, borderColor: color.pink },
});
