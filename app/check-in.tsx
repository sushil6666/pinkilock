/**
 * Daily relationship check-in (D126): how today felt, what was good, what went badly; then Saathi,
 * the AI, suggests a few small things to try. Private to me. A mention of self-harm or of being
 * hurt puts the help lines first. An opt-in reminder at an hour I pick.
 */
import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { HelpLines } from '@/components/Talk';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Columns } from '@/components/ui/Columns';
import { Fold } from '@/components/ui/Fold';
import { ErrorText } from '@/components/ui/ErrorText';
import { textAreaStyle } from '@/components/ui/input';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { CHECKIN_FACE, CHECKIN_MOODS, CHECKIN_NOTE_MAX, REMINDER_HOURS, checkCheckin, emptyCheckins, todayOf, type CheckinMood, type Checkins } from '@/domain/checkin';
import { tipOf } from '@/domain/daily';
import { dayTime } from '@/components/SelfLove';
import { haptic } from '@/lib/haptics';
import { quiet } from '@/lib/log';
import { shown } from '@/lib/report';
import { aria } from '@/lib/web';
import { backend } from '@/services';
import { color, radius, space } from '@/theme/tokens';
import { fmtDayMonth, t } from '@/i18n';

const ROUTE = '/check-in';
const panel = { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md } as const;

export default function CheckInPage() {
  const [state, setState] = useState<Checkins>(emptyCheckins(''));
  const [loaded, setLoaded] = useState(false);
  const [mood, setMood] = useState<CheckinMood | null>(null);
  const [good, setGood] = useState('');
  const [bad, setBad] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [aiOff, setAiOff] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      backend.checkins().then((s) => { if (alive) { setState(s); setLoaded(true); } }, (e) => { if (alive) { setError(shown(e, ROUTE)); setLoaded(true); } });
      return () => {
        alive = false;
      };
    }, []),
  );

  const run = async (what: string, fn: () => Promise<Checkins>) => {
    setBusy(what);
    setError('');
    try {
      setState(await fn());
      return true;
    } catch (e) {
      setError(shown(e, ROUTE));
      return false;
    } finally {
      setBusy('');
    }
  };

  const suggest = async () => {
    setBusy('ai');
    setError('');
    try {
      setState(await backend.checkinSuggest());
    } catch (e) {
      // Without the AI there is still the tip of the day.
      if ((e as { code?: string }).code === 'PL161') setAiOff(true);
      else setError(shown(e, ROUTE));
    } finally {
      setBusy('');
    }
  };

  const save = async () => {
    if (checkCheckin(mood, good, bad) || !mood) return;
    haptic.success();
    if (await run('save', () => backend.checkinSave(mood, good, bad))) void suggest();
  };

  const entry = todayOf(state);
  const past = state.entries.filter((e) => e.day !== state.today);

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.gold}>{t('checkin.eyebrow')}</T>
        <T v="display">{t('checkin.title')}</T>
        <View style={styles.row}>
          <Feather name="lock" size={14} color={color.textDim} style={{ marginTop: 2 }} />
          <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('checkin.private')}</T>
        </View>
      </View>

      {entry?.harm ? <HelpLines strong /> : null}

      {!loaded ? null : entry ? (
        <View style={panel}>
          <T v="label" c={color.textDim}>{t('checkin.todayLabel')}</T>
          <View style={styles.row}>
            <T v="title">{CHECKIN_FACE[entry.mood]}</T>
            <T v="heading" style={{ flex: 1 }}>{t(`checkin.moods.${entry.mood}`)}</T>
          </View>
          {entry.good ? <Note label={t('checkin.goodLabel')} text={entry.good} /> : null}
          {entry.bad ? <Note label={t('checkin.badLabel')} text={entry.bad} /> : null}
        </View>
      ) : (
        <View style={panel}>
          <T v="heading">{t('checkin.moodTitle')}</T>
          <View style={styles.moods} accessibilityRole="radiogroup">
            {CHECKIN_MOODS.map((m) => (
              <Pressable key={m} accessibilityRole="radio" accessibilityState={{ checked: mood === m }} {...aria({ checked: mood === m })} accessibilityLabel={t(`checkin.moods.${m}`)}
                onPress={() => { haptic.tick(); setMood(m); }} style={[styles.mood, mood === m && styles.moodOn]}>
                <T v="title" center>{CHECKIN_FACE[m]}</T>
                <T v="caption" c={mood === m ? color.onPink : color.textDim} center numberOfLines={1}>{t(`checkin.moods.${m}`)}</T>
              </Pressable>
            ))}
          </View>
          <T v="bodyBold">{t('checkin.goodTitle')}</T>
          <TextInput value={good} onChangeText={setGood} placeholder={t('checkin.goodPlaceholder')} placeholderTextColor={color.textMute} accessibilityLabel={t('checkin.goodTitle')}
            multiline maxLength={CHECKIN_NOTE_MAX} style={textAreaStyle} />
          <T v="bodyBold">{t('checkin.badTitle')}</T>
          <TextInput value={bad} onChangeText={setBad} placeholder={t('checkin.badPlaceholder')} placeholderTextColor={color.textMute} accessibilityLabel={t('checkin.badTitle')}
            multiline maxLength={CHECKIN_NOTE_MAX} style={textAreaStyle} />
          <Button icon="check" label={t('checkin.save')} busy={busy === 'save'} disabled={!mood} onPress={save} />
        </View>
      )}
      <ErrorText text={error} />
    </>
  );

  const right = (
    <>
      {entry ? (
        <View style={[panel, styles.ai]}>
          <View style={styles.row}>
            <Feather name="message-circle" size={18} color={color.moon} />
            <T v="label" c={color.moon} style={{ flex: 1 }}>{t('checkin.aiLabel')}</T>
          </View>
          {entry.suggestion ? (
            <T v="body">{entry.suggestion}</T>
          ) : entry.suggestion === '' || entry.harm ? (
            <T v="body">{t('checkin.harmNote')}</T>
          ) : aiOff ? (
            <>
              <T v="caption" c={color.textDim}>{t('checkin.aiOff')}</T>
              <T v="body">{t(`daily.tips.${tipOf(state.today)}`)}</T>
            </>
          ) : (
            <Button kind="ghost" icon="zap" label={t('checkin.askAi')} busy={busy === 'ai'} onPress={suggest} />
          )}
          <T v="caption" c={color.textMute}>{t('checkin.aiNote')}</T>
        </View>
      ) : null}

      <Fold icon="bell" title={t('checkin.reminderTitle')} value={state.reminderHour === null ? t('checkin.reminderOff') : t('checkin.hour', { hour: state.reminderHour - 12 })}>
        <T v="caption" c={color.textDim}>{t('checkin.reminderBody')}</T>
        <View style={styles.chips}>
          <Chip label={t('checkin.reminderOff')} selected={state.reminderHour === null} onPress={() => run('hour', () => backend.checkinReminder(null))} />
          {REMINDER_HOURS.map((h) => (
            <Chip key={h} label={t('checkin.hour', { hour: h - 12 })} selected={state.reminderHour === h} onPress={() => run('hour', () => backend.checkinReminder(h))} />
          ))}
        </View>
      </Fold>

      <View style={panel}>
        <View style={styles.row}>
          <Feather name="shield" size={18} color={color.gold} />
          <T v="bodyBold" style={{ flex: 1 }}>{t('checkin.hurtTitle')}</T>
        </View>
        <T v="caption" c={color.textDim}>{t('checkin.hurtBody')}</T>
        <View style={styles.chips}>
          <Button kind="ghost" icon="phone" label={t('checkin.call112')} onPress={() => Linking.openURL('tel:112').catch(quiet('checkin.call'))} />
          <Button kind="ghost" icon="phone" label={t('checkin.call181')} onPress={() => Linking.openURL('tel:181').catch(quiet('checkin.call'))} />
        </View>
      </View>

      {past.length ? (
        <Fold icon="clock" title={t('checkin.past', { count: past.length })}>
          {past.map((e) => (
            <View key={e.day} style={styles.pastRow}>
              <T v="bodyBold">{`${CHECKIN_FACE[e.mood]}  ${fmtDayMonth(dayTime(e.day))}`}</T>
              {e.good ? <Note label={t('checkin.goodLabel')} text={e.good} /> : null}
              {e.bad ? <Note label={t('checkin.badLabel')} text={e.bad} /> : null}
              {e.suggestion ? <Note label={t('checkin.aiLabel')} text={e.suggestion} /> : null}
            </View>
          ))}
        </Fold>
      ) : null}
    </>
  );

  return (
    <Screen back="back" title={t('checkin.eyebrow')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

function Note({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.note}>
      <T v="label" c={color.textDim}>{label}</T>
      <T v="body">{text}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  moods: { flexDirection: 'row', gap: space.sm },
  mood: { flex: 1, minWidth: 0, minHeight: 72, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center', paddingVertical: space.sm, gap: 2 },
  moodOn: { backgroundColor: color.pink, borderColor: color.pinkDeep },
  ai: { borderColor: color.moon },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  note: { borderRadius: radius.card, backgroundColor: color.surfaceHi, padding: space.md, gap: 2 },
  pastRow: { gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md },
});
