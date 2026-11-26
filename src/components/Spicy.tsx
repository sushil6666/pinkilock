/**
 * Spicy mode (D103): the parts the Spicy page, Me and a kept plan share. The safety rules, the
 * entry on Me, and the hand-off on a card or a plan. What shows comes from the server (spicy_with): this
 * file never decides that two people may see each other's usernames.
 */
import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SPICY_UNLOCK, type SpicyShare } from '../domain/wallet';
import { HANDOFF_RULES, SAFETY_RULES, spicyClosed, spicyOff, telegramLink, type Boundary, type Spicy, type SpicyPlan } from '../domain/spicy';
import { quiet } from '../lib/log';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { t, type Key } from '../i18n';
import { SpicyCallPanel } from './SpicyCall';
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
 * On someone's card or a plan with them. Nothing at all unless the server says it is open (both of
 * us on, a card I can see, nobody blocked). Then: their boundaries, the reminder, and my yes. Their usernames only
 * after a kept in-app call, once we both chose to share them (D111), Discord first.
 */
export function SpicyHandoff({ otherId, name, route }: { otherId: string; name: string; route: string }) {
  const [plan, setPlan] = useState<SpicyPlan>(spicyClosed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reload = useCallback(() => { backend.spicyWith(otherId).then(setPlan, quiet('spicy.with')); }, [otherId]);
  useEffect(() => { reload(); }, [reload]);
  if (!plan.open) return null;

  const share = async (yes: boolean) => {
    setBusy(true);
    setError('');
    try {
      setPlan(await backend.spicyShare(otherId, yes));
    } catch (e) {
      setError(shown(e, route));
    }
    setBusy(false);
  };

  const answer = async (yes: boolean) => {
    setBusy(true);
    setError('');
    try {
      setPlan(await backend.spicyYes(otherId, yes));
    } catch (e) {
      setError(shown(e, route));
    }
    setBusy(false);
  };

  const pay = async (share: SpicyShare) => {
    setBusy(true);
    setError('');
    try {
      setPlan(await backend.spicyPay(otherId, share));
    } catch (e) {
      setError(shown(e, route));
    }
    setBusy(false);
  };

  return (
    <View style={styles.panel}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Feather name="zap" size={18} color={color.pink} />
        <T v="label" c={color.pink}>{t('spicy.title')}</T>
      </View>
      <T v="heading">{plan.mutual && !plan.unlock.done ? t('spicy.unlockTitle') : plan.mutual ? t('spicy.mutualTitle') : t('spicy.planTitle')}</T>

      {plan.mutual && !plan.unlock.done ? (
        <Unlock plan={plan} name={name} busy={busy} onPay={(share) => pay(share)} />
      ) : plan.mutual ? (
        <>
          <T c={color.textDim}>{t('spicy.mutualBody', { name })}</T>
          <SpicyCallPanel otherId={otherId} name={name} route={route} onSettled={reload} />
          <T v="label" c={color.textDim}>{t('spicy.shareTitle')}</T>
          {!plan.keptCall ? <T v="caption" c={color.textDim}>{t('spicy.shareLocked')}</T> : (
            <>
              <T v="caption" c={color.textDim}>{t('spicy.shareBody', { name })}</T>
              {plan.myShare && !(plan.discord || plan.telegram || plan.signal) ? <T v="caption" c={color.gold}>{t('spicy.shareWaiting', { name })}</T> : null}
            </>
          )}
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
          {plan.keptCall ? (plan.myShare
            ? <Button kind="quiet" label={t('spicy.unshare')} busy={busy} onPress={() => share(false)} />
            : <Button kind="ghost" icon="share-2" wrap label={t('spicy.share', { name })} busy={busy} onPress={() => share(true)} />) : null}
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
      <Button kind="ghost" icon="flag" label={t('spicy.report', { name })} onPress={() => router.push(`/report/${otherId}`)} />
    </View>
  );
}

/**
 * The unlock (D105): 600 credits to Pinkilock for this match, one pays it all or 300 each, and
 * whoever paid half may pay the rest. The server says what is paid; nothing goes to the other person.
 */
function Unlock({ plan, name, busy, onPay }: { plan: SpicyPlan; name: string; busy: boolean; onPay: (share: SpicyShare) => void }) {
  const half = SPICY_UNLOCK / 2;
  const rest = SPICY_UNLOCK - plan.unlock.mine - plan.unlock.theirs;
  const paidHalf = plan.unlock.mine >= half;
  return (
    <View style={{ gap: space.sm }}>
      <T c={color.textDim}>{t('spicy.unlockBody', { total: SPICY_UNLOCK, half, name })}</T>
      <View style={styles.meter}>
        <View style={[styles.meterFill, { flex: plan.unlock.mine + plan.unlock.theirs }]} />
        <View style={{ flex: Math.max(rest, 0) }} />
      </View>
      <T v="caption" c={color.textDim}>{t('spicy.unlockPaid', { mine: plan.unlock.mine, theirs: plan.unlock.theirs, name, total: SPICY_UNLOCK })}</T>
      {paidHalf ? <T v="caption" c={color.gold}>{t('spicy.unlockWaiting', { name })}</T> : null}
      {!paidHalf && rest >= half ? <Button kind="ghost" icon="star" label={t('spicy.payHalf', { n: Math.min(half - plan.unlock.mine, rest) })} busy={busy} onPress={() => onPay('half')} /> : null}
      <Button icon="unlock" label={t(rest === SPICY_UNLOCK ? 'spicy.payAll' : 'spicy.payRest', { n: rest })} busy={busy} onPress={() => onPay('full')} />
      <T v="caption" c={color.textMute}>{t('spicy.unlockBack')}</T>
      <T v="caption" c={color.textMute}>{t('spicy.unlockBought')}</T>
      <Button kind="quiet" label={t('spicy.openWallet')} onPress={() => router.push('/wallet')} />
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { flexDirection: 'row', height: 8, borderRadius: radius.pill, backgroundColor: color.surface, overflow: 'hidden' },
  meterFill: { backgroundColor: color.gold },
  rule: { flexDirection: 'row', gap: space.sm },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.pinkDeep, borderRadius: radius.card, backgroundColor: color.pinkWash, padding: space.lg, marginTop: space.md },
  panel: { borderWidth: 1, borderColor: color.pinkDeep, borderRadius: radius.card, backgroundColor: color.pinkWash, padding: space.lg, gap: space.md },
  handle: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: 4 },
});
