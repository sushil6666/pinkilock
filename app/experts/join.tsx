/**
 * Join as an expert (D127): a pitch for therapists, coaches, intimacy counsellors and spiritual
 * guides, the rules they agree to, and a short form the team follows up on. Nothing is listed,
 * booked or paid here: the team checks each licence first, and sessions come later.
 */
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Choice, ExpertRules } from '@/components/Experts';
import { Button } from '@/components/ui/Button';
import { Columns } from '@/components/ui/Columns';
import { Fold } from '@/components/ui/Fold';
import { ErrorText } from '@/components/ui/ErrorText';
import { inputStyle, textAreaStyle } from '@/components/ui/input';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { EXPERT_KINDS, checkApply, type ExpertApplication, type ExpertApply } from '@/domain/experts';
import { haptic } from '@/lib/haptics';
import { shown } from '@/lib/report';
import { aria } from '@/lib/web';
import { backend } from '@/services';
import { color, radius, space, type } from '@/theme/tokens';
import { t } from '@/i18n';

const ROUTE = '/experts/join';
const panel = { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md } as const;
const WHY = ['reach', 'free', 'later'] as const;
const empty: ExpertApply = { name: '', kind: null, credential: '', city: '', contact: '', note: '', agree: false };

export default function JoinExpertPage() {
  const [form, setForm] = useState<ExpertApply>(empty);
  const [app, setApp] = useState<ExpertApplication | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      backend.myExpertApplication().then((a) => { if (alive) setApp(a); }, (e) => { if (alive) setError(shown(e, ROUTE)); });
      return () => {
        alive = false;
      };
    }, []),
  );

  const set = <K extends keyof ExpertApply>(k: K, v: ExpertApply[K]) => setForm((f) => ({ ...f, [k]: v }));
  const ready = !checkApply(form);

  const send = async () => {
    if (!ready) return;
    setBusy(true);
    setError('');
    try {
      setApp(await backend.expertApply(form));
      haptic.success();
      setEditing(false);
    } catch (e) {
      setError(shown(e, ROUTE));
    } finally {
      setBusy(false);
    }
  };

  const field = (k: 'name' | 'credential' | 'city' | 'contact' | 'note', max: number, multiline = false) => (
    <View style={{ gap: space.xs }}>
      <T v="bodyBold">{t(`experts.join.${k}`)}</T>
      <TextInput value={form[k]} onChangeText={(v) => set(k, v)} placeholder={t(`experts.join.${k}Hint`)} placeholderTextColor={color.textMute}
        accessibilityLabel={t(`experts.join.${k}`)} maxLength={max} multiline={multiline} style={multiline ? textAreaStyle : [inputStyle, type.body]} />
    </View>
  );

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.gold}>{t('experts.join.eyebrow')}</T>
        <T v="display">{t('experts.join.title')}</T>
      </View>
      <Fold icon="star" accent title={t('experts.join.whyTitle')}>
        <T c={color.textDim}>{t('experts.join.pitch')}</T>
        {WHY.map((k) => (
          <View key={k} style={styles.row}>
            <Feather name={k === 'reach' ? 'users' : k === 'free' ? 'gift' : 'calendar'} size={18} color={color.gold} />
            <T v="body" style={{ flex: 1 }}>{t(`experts.join.why.${k}`)}</T>
          </View>
        ))}
      </Fold>
      <ExpertRules />
    </>
  );

  const right =
    app && !editing ? (
      <View style={[panel, styles.sent]}>
        <View style={styles.row}>
          <Feather name="check-circle" size={20} color={color.gold} />
          <T v="heading" style={{ flex: 1 }}>{t('experts.join.sentTitle')}</T>
        </View>
        <T v="body">{t(`experts.join.status.${app.status}`)}</T>
        <T v="caption" c={color.textDim}>{t('experts.join.sentBody')}</T>
        {app.status === 'new' ? <Button kind="ghost" icon="edit-3" label={t('experts.join.edit')} onPress={() => setEditing(true)} /> : null}
      </View>
    ) : (
      <View style={panel}>
        <T v="heading">{t('experts.join.formTitle')}</T>
        {field('name', 80)}
        <T v="bodyBold">{t('experts.join.kind')}</T>
        <View style={{ gap: space.xs }} accessibilityRole="radiogroup">
          {EXPERT_KINDS.map((k) => <Choice key={k} label={t(`experts.kinds.${k}`)} selected={form.kind === k} onPress={() => set('kind', k)} />)}
        </View>
        {field('credential', 160)}
        {field('city', 60)}
        {field('contact', 120)}
        <T v="caption" c={color.textMute}>{t('experts.join.contactNote')}</T>
        {field('note', 600, true)}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: form.agree }} {...aria({ checked: form.agree })} onPress={() => set('agree', !form.agree)} style={styles.agree}>
          <Feather name={form.agree ? 'check-square' : 'square'} size={20} color={form.agree ? color.gold : color.textDim} />
          <T v="body" style={{ flex: 1 }}>{t('experts.join.agree')}</T>
        </Pressable>
        <Button icon="send" label={t('experts.join.send')} busy={busy} disabled={!ready} onPress={send} />
        <ErrorText text={error} />
      </View>
    );

  return (
    <Screen back="back" title={t('experts.join.eyebrow')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  agree: { flexDirection: 'row', gap: space.sm, alignItems: 'center', paddingVertical: space.xs },
  sent: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
});
