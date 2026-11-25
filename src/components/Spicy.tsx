/**
 * Spicy mode (D103): the parts the Spicy page, Me and a kept plan share. The safety rules, the
 * entry on Me, and the hand-off on a plan. What shows comes from the server (spicy_plan): this
 * file never decides that two people may see each other's usernames.
 */
import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HANDOFF_RULES, SAFETY_RULES, spicyClosed, spicyOff, telegramLink, type Boundary, type Spicy, type SpicyPlan } from '../domain/spicy';
import { quiet } from '../lib/log';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { t, type Key } from '../i18n';
import { Button } from './ui/Button';
import { Tag } from './ui/Chip';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

/** The rules, numbered. `only` shows some of them (the reminder on a plan). */
export function SafetyRules({ only }: { only?: readonly number[] }) {
  const list = only ?? Array.from({ length: SAFETY_RULES }, (_, i) => i + 1);
  return (
    <View style={{ gap: space.sm }}>
      {list.map((n) => (
        <View key={n} style={styles.rule}>
          <Feather name="shield" size={16} color={color.gold} style={{ marginTop: 3 }} />
          <T style={{ flex: 1 }}>{t(`spicy.rules.r${n}` as Key)}</T>
        </View>
      ))}
    </View>
  );
}

export function BoundaryTags({ list }: { list: Boundary[] }) {
  return (
    <View style={styles.tags}>
      {list.map((b) => <Tag key={b} label={t(`spicy.boundaries.${b}`)} tone={color.pink} />)}
    </View>
  );
}

/** My own Spicy state, fresh each time the screen comes into view. */
export function useMySpicy() {
  const [state, setState] = useState<Spicy | null>(null);
  useFocusEffect(useCallback(() => {
    backend.spicy().then(setState, quiet('spicy.load'));
  }, []));
  return [state ?? spicyOff, setState, !!state] as const;
}

/** The way in, on Me. Says whether it is on, nothing more. */
export function SpicyEntry() {
  const [state] = useMySpicy();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('spicy.meOpen')} onPress={() => router.push('/spicy')} style={({ pressed }) => [styles.entry, pressed && { opacity: 0.85 }]}>
      <Feather name="zap" size={22} color={color.pink} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" c={color.pink}>{t('spicy.eyebrow')}</T>
        <T v="heading">{t('spicy.title')}</T>
        <T v="caption" c={color.textDim}>{t(state.on ? 'spicy.meBodyOn' : 'spicy.meBodyOff')}</T>
      </View>
      <Feather name="chevron-right" size={20} color={color.textDim} />
    </Pressable>
  );
}

/**
 * On a kept plan. Nothing at all unless the server says it is open (kept, one-on-one, nobody
 * blocked, both of us on). Then: their boundaries, the reminder, and my yes. Their usernames only
 * once we both said yes, Discord first.
 */
export function SpicyHandoff({ inviteId, otherId, name }: { inviteId: string; otherId: string; name: string }) {
  const [plan, setPlan] = useState<SpicyPlan>(spicyClosed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    backend.spicyPlan(inviteId).then(setPlan, quiet('spicy.plan'));
  }, [inviteId]);
  if (!plan.open) return null;

  const answer = async (yes: boolean) => {
    setBusy(true);
    setError('');
    try {
      setPlan(await backend.spicyYes(inviteId, yes));
    } catch (e) {
      setError(shown(e, '/plan/[id]'));
    }
    setBusy(false);
  };

  return (
    <View style={styles.panel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Feather name="zap" size={18} color={color.pink} />
        <T v="label" c={color.pink}>{t('spicy.title')}</T>
      </View>
      <T v="heading">{plan.mutual ? t('spicy.mutualTitle') : t('spicy.planTitle')}</T>

      {plan.mutual ? (
        <>
          <T c={color.textDim}>{t('spicy.mutualBody', { name })}</T>
          {plan.discord ? (
            <View style={styles.handle}>
              <T v="label" c={color.textDim}>{t('spicy.discord')}</T>
              <T v="title" selectable>{plan.discord}</T>
              <T v="caption" c={color.textDim}>{t('spicy.discordHow')}</T>
            </View>
          ) : null}
          {plan.telegram ? (
            <View style={styles.handle}>
              <T v="label" c={color.textDim}>{t('spicy.telegram')}</T>
              <T v="title" selectable>@{plan.telegram}</T>
              <Button kind="ghost" icon="send" label={t('spicy.openTelegram')} onPress={() => Linking.openURL(telegramLink(plan.telegram!)).catch(quiet('spicy.telegram'))} />
            </View>
          ) : null}
          {plan.signal ? (
            <View style={styles.handle}>
              <T v="label" c={color.textDim}>{t('spicy.signal')}</T>
              <T v="title" selectable>{plan.signal}</T>
              <T v="caption" c={color.textDim}>{t('spicy.signalHow')}</T>
            </View>
          ) : null}
        </>
      ) : (
        <T c={color.textDim}>{t('spicy.planBody', { name })}</T>
      )}

      <T v="label" c={color.textDim}>{t('spicy.theirBoundaries', { name })}</T>
      {plan.theirBoundaries.length ? <BoundaryTags list={plan.theirBoundaries} /> : <T v="caption" c={color.textDim}>{t('spicy.noBoundaries', { name })}</T>}

      {plan.mutual ? null : (
        <>
          <T v="label" c={color.textDim}>{t('spicy.remember')}</T>
          <SafetyRules only={HANDOFF_RULES} />
        </>
      )}

      {plan.myYes && !plan.mutual ? <T v="caption" c={color.gold}>{t('spicy.waiting', { name })}</T> : null}
      {error ? <ErrorText text={error} /> : null}
      {plan.myYes
        ? <Button kind="quiet" label={t('spicy.takeBack')} busy={busy} onPress={() => answer(false)} />
        : <Button icon="zap" label={t('spicy.yes')} busy={busy} onPress={() => answer(true)} />}
      <T v="caption" c={color.textMute}>{t('spicy.stop', { name })}</T>
      <Button kind="ghost" icon="flag" label={t('spicy.report', { name })} onPress={() => router.push(`/report/${otherId}?invite=${inviteId}`)} />
    </View>
  );
}

const styles = StyleSheet.create({
  rule: { flexDirection: 'row', gap: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.pinkDeep, borderRadius: radius.card, backgroundColor: color.pinkWash, padding: space.lg, marginTop: space.md },
  panel: { borderWidth: 1, borderColor: color.pinkDeep, borderRadius: radius.card, backgroundColor: color.pinkWash, padding: space.lg, gap: space.md },
  handle: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: 4 },
});
