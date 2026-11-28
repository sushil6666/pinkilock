/**
 * Couple mode's "Today" (D125): the relationship tip of the day and the question of the day. Each
 * answers in their own words; the other's answer shows once both have answered. Private to the two.
 */
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { ANSWER_MAX, checkAnswer, emptyDaily, tipOf, type DailyAnswer, type DailyQuestion } from '../domain/daily';
import { haptic } from '../lib/haptics';
import { quiet } from '../lib/log';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { Button } from './ui/Button';
import { ErrorText } from './ui/ErrorText';
import { inputStyle } from './ui/input';
import { T } from './ui/T';
import { t } from '../i18n';

const ROUTE = '/couple';
/** The made-up partner answers a few seconds after me in the mock; live, it comes on the next read. */
const REFRESH_MS = 15_000;

export function Today({ partnerName, today }: { partnerName: string; today: string }) {
  const [daily, setDaily] = useState<DailyQuestion>(emptyDaily);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [earlier, setEarlier] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      const load = () => backend.coupleQuestion().then((d) => alive && setDaily(d), quiet('daily.load'));
      load();
      const timer = setInterval(load, REFRESH_MS);
      return () => {
        alive = false;
        clearInterval(timer);
      };
    }, []),
  );

  const send = async () => {
    const code = checkAnswer(text);
    if (code || busy) return;
    setBusy(true);
    setError('');
    try {
      setDaily(await backend.coupleQuestionAnswer(text));
      setText('');
      haptic.success();
    } catch (e) {
      setError(shown(e, ROUTE));
    } finally {
      setBusy(false);
    }
  };

  const q = daily.today;
  const tip = tipOf(q?.day ?? today);

  return (
    <View style={styles.panel}>
      <T v="label" c={color.gold}>{t('daily.tipLabel')}</T>
      <View style={styles.tip}>
        <Feather name="sun" size={18} color={color.gold} style={{ marginTop: 2 }} />
        <T v="body" style={{ flex: 1 }}>{t(`daily.tips.${tip}`)}</T>
      </View>

      {q ? (
        <View style={styles.split}>
          <T v="label" c={color.pink}>{t('daily.questionLabel')}</T>
          <T v="heading">{t(`daily.questions.${q.question}`)}</T>
          {q.mine ? (
            <Answers a={q} partnerName={partnerName} />
          ) : (
            <>
              <T v="caption" c={color.textDim}>{q.theyAnswered ? t('daily.theyWaiting', { name: partnerName }) : t('daily.questionBody', { name: partnerName })}</T>
              <TextInput value={text} onChangeText={(v) => { setText(v); setError(''); }} placeholder={t('daily.placeholder')} placeholderTextColor={color.textMute}
                accessibilityLabel={t('daily.answerSpoken')} multiline maxLength={ANSWER_MAX} style={[inputStyle, { minHeight: 72, textAlignVertical: 'top' }]} />
              <Button icon="send" label={t('daily.send')} busy={busy} disabled={!!checkAnswer(text)} onPress={send} />
            </>
          )}
          <ErrorText text={error} />
          {daily.streak > 0 ? (
            <View style={styles.streak}>
              <Feather name="zap" size={16} color={color.gold} />
              <T v="caption" c={color.gold}>{t('daily.streak', { count: daily.streak })}</T>
            </View>
          ) : null}
          {daily.past.length ? (
            <Button kind="quiet" icon={earlier ? 'chevron-up' : 'chevron-down'} label={t(earlier ? 'daily.hideEarlier' : 'daily.earlier')} onPress={() => setEarlier(!earlier)} />
          ) : null}
          {earlier
            ? daily.past.map((a) => (
                <View key={a.day} style={styles.past}>
                  <T v="bodyBold">{t(`daily.questions.${a.question}`)}</T>
                  <Answers a={a} partnerName={partnerName} />
                </View>
              ))
            : null}
        </View>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => router.push('/check-in')} style={({ pressed }) => [styles.checkin, pressed && { opacity: 0.85 }]}>
        <Feather name="edit-3" size={18} color={color.moon} />
        <T v="bodyBold" style={{ flex: 1 }}>{t('checkin.entry', { name: partnerName })}</T>
        <Feather name="chevron-right" size={18} color={color.textDim} />
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => router.push('/experts')} style={({ pressed }) => [styles.checkin, pressed && { opacity: 0.85 }]}>
        <Feather name="book-open" size={18} color={color.gold} />
        <T v="bodyBold" style={{ flex: 1 }}>{t('experts.coupleLink')}</T>
        <Feather name="chevron-right" size={18} color={color.textDim} />
      </Pressable>
    </View>
  );
}

function Answers({ a, partnerName }: { a: DailyAnswer; partnerName: string }) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.answer}>
        <T v="label" c={color.textDim}>{t('daily.you')}</T>
        <T v="body">{a.mine}</T>
      </View>
      <View style={[styles.answer, a.theirs ? styles.theirs : null]}>
        <T v="label" c={color.textDim}>{partnerName}</T>
        {a.theirs ? <T v="body">{a.theirs}</T> : <T v="caption" c={color.textMute}>{t('daily.waiting', { name: partnerName })}</T>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md },
  tip: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  split: { gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md },
  answer: { borderRadius: radius.card, backgroundColor: color.surfaceHi, padding: space.md, gap: 2 },
  theirs: { borderWidth: 1, borderColor: color.pink },
  streak: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  checkin: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md },
  past: { gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md },
});
