/**
 * Bounce back (D101), part of Self love: for after a no, an ask that ran out, or a hard plan. A kind
 * note and one small step, the 3-day reset, a private journal, a pause from Discover, and help for
 * a heavier day. Opened with `?after=no` or `?after=expired&invite=<id>` from an ask that ended.
 */
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Linking, StyleSheet, View } from 'react-native';
import { SelfError, SelfNotes, dayTime, panel, useSelfLove } from '@/components/SelfLove';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Columns } from '@/components/ui/Columns';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { countryOf } from '@/domain/countries';
import { PAUSE_DAYS, RESET_DAYS, SUPPORT_LINES, addDays, careStep, resetDay, stepOpen } from '@/domain/selfLove';
import { quiet } from '@/lib/log';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { fmtDate, fmtWeekday, t, type Key } from '@/i18n';

const ROUTE = '/self-love/bounce-back';

export default function BounceBack() {
  const params = useLocalSearchParams<{ after?: string; invite?: string }>();
  const after = params.after === 'no' || params.after === 'expired' ? params.after : null;
  const me = useStore((s) => s.me);
  const country = countryOf(me?.country);
  const { state, error, busy, run } = useSelfLove(ROUTE);
  if (!me) return null;
  const call = (n: string) => Linking.openURL(`tel:${n}`).catch(quiet('bounce.call'));
  const day = resetDay(state.reset, state.today);
  const step = careStep(`${params.invite ?? ''}:${state.today}`);

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.pink}>{t('bounce.eyebrow')}</T>
        <T v="display">{t('bounce.title')}</T>
        <T c={color.textDim}>{t('bounce.body')}</T>
      </View>

      {after ? (
        <View style={[panel, styles.kind]}>
          <T v="title">{t(after === 'no' ? 'bounce.afterNo' : 'bounce.afterExpired')}</T>
          <T c={color.textDim}>{t(after === 'no' ? 'bounce.afterNoBody' : 'bounce.afterExpiredBody')}</T>
          <View style={styles.step}>
            <Feather name="heart" size={18} color={color.pink} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="label" c={color.pink}>{t('bounce.smallStep')}</T>
              <T v="bodyBold">{t(`selfLove.steps.s${step}` as Key)}</T>
            </View>
          </View>
        </View>
      ) : null}

      <View style={panel}>
        <T v="heading">{t('bounce.resetTitle')}</T>
        <T v="caption" c={color.textDim}>{t('bounce.resetBody')}</T>
        {state.reset ? (
          <View style={{ gap: space.sm }}>
            {Array.from({ length: RESET_DAYS }, (_, k) => k + 1).map((n) => {
              const done = state.reset!.done.includes(n);
              const open = stepOpen(state.reset, n, state.today);
              return (
                <View key={n} style={[styles.resetRow, done && styles.resetDone]}>
                  <View style={[styles.tick, done && styles.tickOn]}>
                    {done ? <Feather name="check" size={16} color={color.onGold} /> : <T v="caption" c={color.textDim}>{n}</T>}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <T v="label" c={done ? color.gold : color.textDim}>{t('bounce.resetDay', { n })}</T>
                    <T c={open || done ? color.text : color.textMute}>{t(`bounce.resetSteps.d${n}` as Key)}</T>
                    {!open && !done ? <T v="caption" c={color.textMute}>{t('bounce.resetOpensOn', { day: fmtWeekday(dayTime(addDays(state.reset!.started, n - 1))) })}</T> : null}
                  </View>
                  {open && !done ? (
                    <Button kind="ghost" label={t('bounce.resetDone')} accessibilityHint={t('bounce.resetMark', { n })} busy={busy === `step_${n}`}
                      onPress={() => run(`step_${n}`, () => backend.doResetStep(n))} />
                  ) : null}
                </View>
              );
            })}
            {day === 'done' ? (
              <>
                <T v="bodyBold" c={color.gold}>{t('bounce.resetAllDone')}</T>
                <Button icon="compass" label={t('bounce.backToDiscover')} onPress={() => router.navigate('/(tabs)')} />
              </>
            ) : null}
            {day === 'over' ? <T v="caption" c={color.textDim}>{t('bounce.resetOver')}</T> : null}
            {day === 'done' || day === 'over' ? <Button kind="quiet" icon="refresh-cw" label={t('bounce.resetAgain')} busy={busy === 'reset'} onPress={() => run('reset', () => backend.startReset())} /> : null}
          </View>
        ) : (
          <Button icon="sunrise" label={t('bounce.resetStart')} busy={busy === 'reset'} onPress={() => run('reset', () => backend.startReset())} />
        )}
      </View>

      <View style={panel}>
        <T v="heading">{t('bounce.journalTitle')}</T>
        <T v="caption" c={color.textDim}>{t('bounce.journalBody')}</T>
        <SelfNotes kind="journal" notes={state.notes} placeholder={t('bounce.journalPlaceholder')} label={t('bounce.journalLabel')}
          add={t('bounce.journalAdd')} empty={t('bounce.journalEmpty')} busy={busy} run={run} />
      </View>
    </>
  );

  const right = (
    <>
      <View style={panel}>
        <T v="heading">{t('bounce.pauseTitle')}</T>
        <T v="caption" c={color.textDim}>{t('bounce.pauseBody')}</T>
        {state.pausedUntil ? (
          <>
            <View style={styles.paused}>
              <Feather name="moon" size={18} color={color.gold} />
              <T v="bodyBold" style={{ flex: 1 }}>{t('bounce.pausedUntil', { date: fmtDate(state.pausedUntil) })}</T>
            </View>
            <Button kind="ghost" icon="play" label={t('bounce.pauseEnd')} busy={busy === 'pause'} onPress={() => run('pause', () => backend.pauseDiscover(0))} />
          </>
        ) : (
          <View style={styles.wrap}>
            {PAUSE_DAYS.map((n) => <Chip key={n} label={t('bounce.pauseFor', { count: n })} disabled={busy === 'pause'} onPress={() => run('pause', () => backend.pauseDiscover(n))} />)}
          </View>
        )}
      </View>

      <View style={[panel, styles.help]}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <Feather name="life-buoy" size={20} color={color.moon} />
          <T v="heading" style={{ flex: 1 }}>{t('bounce.helpTitle')}</T>
        </View>
        <T c={color.textDim}>{t('bounce.helpBody')}</T>
        {(SUPPORT_LINES[country.code] ?? []).map((l) => (
          <Button key={l.key} kind="ghost" icon="phone" label={t(`bounce.${l.key}`, { number: l.number })} onPress={() => call(l.number)} />
        ))}
        <Button kind="danger" icon="phone" label={t('bounce.emergency', { number: country.emergency })} onPress={() => call(country.emergency)} />
        <Button kind="quiet" icon="shield" label={t('bounce.safetyPage')} onPress={() => router.push('/safety')} />
      </View>
      <Button kind="ghost" icon="book-open" label={t('experts.bounceLink')} onPress={() => router.push('/experts?topic=breakup')} />
      <SelfError text={error} />
    </>
  );

  return (
    <Screen back="back" title={t('bounce.title')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kind: { borderColor: color.pinkDeep, backgroundColor: color.pinkWash },
  step: { flexDirection: 'row', gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md },
  resetRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: space.md },
  resetDone: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
  tick: { width: 32, height: 32, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: color.gold, borderColor: color.goldDeep },
  paused: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  help: { borderColor: color.line },
});
