/**
 * Self love (D101): a private page for the person alone. A kind line for the day, solo plans in
 * their city, a mood check-in with the week and a streak, the gratitude jar, their boundaries, and
 * the way into Bounce back. Nobody else can read any of it (RLS and definer functions, not the UI).
 */
import { Fold } from '@/components/ui/Fold';
import { Entry } from '@/components/ui/Entry';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SelfError, SelfNotes, dayTime, panel, useSelfLove } from '@/components/SelfLove';
import { Button } from '@/components/ui/Button';
import { Columns, Grid } from '@/components/ui/Columns';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { GRATITUDE_PER_DAY, MOODS, MOOD_FACE, STREAK_BADGE, gratitudeToday, lineOfDay, soloPlans, streak, weekOf } from '@/domain/selfLove';
import { haptic } from '@/lib/haptics';
import { aria } from '@/lib/web';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { fmtDayMonth, fmtWeekday, t, type Key } from '@/i18n';

const ROUTE = '/self-love';

export default function SelfLovePage() {
  const me = useStore((s) => s.me);
  const { state, error, busy, run } = useSelfLove(ROUTE);
  const [picked, setPicked] = useState<string | null>(null);
  if (!me) return null;

  const today = state.moods.find((m) => m.day === state.today)?.mood ?? null;
  const days = streak(state.moods.map((m) => m.day), state.today);
  const week = weekOf(state.moods, state.today);
  const jarCount = gratitudeToday(state);
  const jar = state.notes.filter((n) => n.kind === 'gratitude');
  const fromJar = jar.find((n) => n.id === picked);
  const pickFromJar = () => {
    if (!jar.length) return;
    const others = jar.filter((n) => n.id !== picked);
    setPicked((others.length ? others : jar)[Math.floor(Math.random() * (others.length || jar.length))].id);
  };

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.gold}>{t('selfLove.eyebrow')}</T>
        <T v="display">{t('selfLove.title')}</T>
        <View style={styles.privateRow}>
          <Feather name="lock" size={14} color={color.textDim} style={{ marginTop: 2 }} />
          <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('selfLove.private')}</T>
        </View>
      </View>

      <Animated.View entering={FadeInDown.duration(360)} style={styles.line}>
        <T v="label" c={color.gold}>{t('selfLove.lineLabel')}</T>
        <T v="hand" c={color.moon}>{t(`selfLove.lines.l${lineOfDay(state.today)}` as Key)}</T>
      </Animated.View>

      <View style={panel}>
        <T v="heading">{t('selfLove.moodTitle')}</T>
        <View style={styles.moods} accessibilityRole="radiogroup">
          {MOODS.map((m) => {
            const on = today === m;
            return (
              <Pressable key={m} accessibilityRole="radio" accessibilityState={{ checked: on }} {...aria({ checked: on })} accessibilityLabel={t(`selfLove.moods.${m}`)}
                disabled={busy === 'mood'} onPress={() => { haptic.tick(); run('mood', () => backend.saveMood(m)); }} style={[styles.mood, on && styles.moodOn]}>
                <T v="title" center>{MOOD_FACE[m]}</T>
                <T v="caption" c={on ? color.onPink : color.textDim} center numberOfLines={1}>{t(`selfLove.moods.${m}`)}</T>
              </Pressable>
            );
          })}
        </View>
        {today ? <T v="caption" c={color.gold}>{t('selfLove.moodSaved')}</T> : null}
      </View>

      <Fold icon="award" title={t('selfLove.moodWeek')} value={days ? t('selfLove.streak', { count: days }) : undefined}>
        <View style={styles.week}>
          {week.map((d) => (
            <View key={d.day} style={styles.weekDay} accessible accessibilityLabel={t('selfLove.moodDay', { day: fmtDayMonth(dayTime(d.day)), mood: d.mood ? t(`selfLove.moods.${d.mood}`) : t('selfLove.moodNone') })}>
              <View style={[styles.dot, d.mood && styles.dotOn]}><T v="bodyBold" center>{d.mood ? MOOD_FACE[d.mood] : ' '}</T></View>
              <T v="caption" c={d.day === state.today ? color.gold : color.textMute}>{fmtWeekday(dayTime(d.day))}</T>
            </View>
          ))}
        </View>
        <View style={styles.streak}>
          <View style={[styles.badge, days >= STREAK_BADGE && styles.badgeOn]}>
            <Feather name="award" size={22} color={days >= STREAK_BADGE ? color.onGold : color.textMute} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="bodyBold" c={days >= STREAK_BADGE ? color.gold : color.text}>{days >= STREAK_BADGE ? t('selfLove.badgeTitle') : days ? t('selfLove.streak', { count: days }) : t('selfLove.streakNone')}</T>
            <T v="caption" c={color.textDim}>{days >= STREAK_BADGE ? t('selfLove.badge') : t('selfLove.badgeNext', { count: STREAK_BADGE - days })}</T>
          </View>
        </View>
      </Fold>

      <Fold icon="heart" title={t('selfLove.jarTitle')} value={t('selfLove.jarToday', { count: jarCount, max: GRATITUDE_PER_DAY })}>
        <T v="caption" c={color.textDim}>{t(jarCount >= GRATITUDE_PER_DAY ? 'selfLove.jarFull' : 'selfLove.jarBody')}</T>
        <SelfNotes kind="gratitude" notes={state.notes} open={jarCount < GRATITUDE_PER_DAY} placeholder={t('selfLove.jarPlaceholder')} label={t('selfLove.jarLabel')}
          add={t('selfLove.jarAdd')} empty={t('selfLove.jarEmpty')} busy={busy} run={run} show={5} />
        {jar.length > 1 ? <Button kind="quiet" icon="shuffle" label={t('selfLove.jarPick')} onPress={pickFromJar} /> : null}
        {fromJar ? (
          <View style={styles.picked}>
            <T v="hand" c={color.moon}>{fromJar.body}</T>
            <T v="caption" c={color.textMute}>{t('selfLove.jarPicked', { date: fmtDayMonth(dayTime(fromJar.day)) })}</T>
          </View>
        ) : null}
      </Fold>
    </>
  );

  const right = (
    <>
      <Entry tone="pink" icon={<Feather name="sunrise" size={20} color={color.pink} />} title={t('selfLove.bounceTitle')} spoken={t('selfLove.bounceOpen')} onPress={() => router.push('/self-love/bounce-back')} />
      <Fold icon="map" title={t('selfLove.soloTitle', { city: me.city })} value={String(soloPlans(me.city, state.today).length)}>
      <T v="caption" c={color.textDim}>{t('selfLove.soloBody')}</T>
      <Grid>
        {soloPlans(me.city, state.today).map((v) => (
          <View key={v.id} style={styles.solo}>
            <Feather name={v.kind === 'park' ? 'sun' : v.kind === 'mall' ? 'film' : v.kind === 'market' ? 'shopping-bag' : v.kind === 'landmark' ? 'camera' : 'headphones'} size={18} color={color.gold} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyBold">{v.name}</T>
              <T v="caption" c={color.textMute}>{v.area}</T>
              <T v="caption" c={color.textDim}>{t(`selfLove.solo.${v.kind}`)}</T>
            </View>
          </View>
        ))}
      </Grid>
      </Fold>

      <Fold icon="shield" title={t('selfLove.boundTitle')}>
        <T v="caption" c={color.textDim}>{t('selfLove.boundBody')}</T>
        <SelfNotes kind="boundary" notes={state.notes} placeholder={t('selfLove.boundPlaceholder')} label={t('selfLove.boundLabel')}
          add={t('selfLove.boundAdd')} empty={t('selfLove.boundEmpty')} busy={busy} run={run} />
      </Fold>
      <SelfError text={error} />
    </>
  );

  return (
    <Screen back="back" title={t('selfLove.title')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  privateRow: { flexDirection: 'row', gap: space.sm },
  line: { borderWidth: 1, borderColor: color.goldDeep, backgroundColor: color.goldWash, borderRadius: radius.card, padding: space.xl, gap: space.sm },
  moods: { flexDirection: 'row', gap: space.sm },
  mood: { flex: 1, minWidth: 0, minHeight: 72, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm, gap: 2 },
  moodOn: { backgroundColor: color.pink, borderColor: color.pink },
  week: { flexDirection: 'row', justifyContent: 'space-between' },
  weekDay: { alignItems: 'center', gap: space.xs },
  dot: { width: 36, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: color.surfaceHi, borderColor: color.textMute },
  streak: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingTop: space.md },
  badge: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: color.gold, borderColor: color.goldDeep },
  picked: { borderLeftWidth: 3, borderLeftColor: color.gold, paddingLeft: space.md, gap: 2 },
  solo: { flexDirection: 'row', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg },
});
