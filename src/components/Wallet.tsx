/**
 * The credits wallet (D104): the parts the wallet page, Me, a plan and the composer share. The
 * entry on Me, the stake and treat panel on a plan, and the voucher. What can happen is decided on
 * the server (wallet_stake, treat_plan, treat_options); this file only shows what it says.
 */
import { Entry } from './ui/Entry';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { COSTS, TREATS, balance, type TreatItem, type TreatPartner } from '../domain/wallet';
import { haptic } from '../lib/haptics';
import { quiet } from '../lib/log';
import { shown } from '../lib/report';
import { backend } from '../services';
import { useStore } from '../state/store';
import { color, radius, space } from '../theme/tokens';
import { fmtDay, fmtNumber, fmtTime, t } from '../i18n';
import { Button } from './ui/Button';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

/** My wallet, fresh each time the screen comes into view. */
export function useMyWallet() {
  const wallet = useStore((s) => s.wallet);
  const load = useStore((s) => s.loadWallet);
  useFocusEffect(useCallback(() => {
    load().catch(quiet('wallet.load'));
  }, [load]));
  return wallet;
}

/** The balance as a coin and a number. */
export function Credits({ n, size = 'title' }: { n: number; size?: 'title' | 'display' | 'bodyBold' }) {
  return (
    <View style={styles.credits}>
      <View style={[styles.coin, size === 'display' && styles.coinBig]}><Feather name="star" size={size === 'display' ? 18 : 12} color={color.onGold} /></View>
      <T v={size} c={color.gold}>{fmtNumber(n)}</T>
    </View>
  );
}

/** The way in, on Me. */
export function WalletEntry() {
  const wallet = useMyWallet();
  return <Entry icon={<Feather name="star" size={20} color={color.gold} />} title={t('wallet.title')} value={fmtNumber(wallet ? balance(wallet) : 0)} spoken={t('wallet.meOpen')} onPress={() => router.push('/wallet')} />;
}

/**
 * On a locked plan: put a stake on it, treat the other person (where a partner place is in our
 * city), and, for the person treated, the voucher once it is ready. Nothing at all on a double.
 */
export function PlanWallet({ inviteId, name, locked, route }: { inviteId: string; name: string; locked: boolean; route: string }) {
  const wallet = useMyWallet();
  const setWallet = useStore((s) => s.setWallet);
  // D117: a treat is paid from bought credits, so it waits while payments are paused.
  const paid = useStore((s) => s.paid);
  const [partners, setPartners] = useState<TreatPartner[]>([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (locked) backend.treatOptions(inviteId).then(setPartners, quiet('wallet.treats'));
  }, [inviteId, locked, wallet?.treats.length]);
  if (!wallet) return null;

  const staked = wallet.stakes[inviteId];
  const treat = wallet.treats.find((x) => x.inviteId === inviteId);
  const run = (what: string, work: () => Promise<void>) => async () => {
    setBusy(what);
    setError('');
    try {
      await work();
      haptic.success();
    } catch (e) {
      haptic.warning();
      setError(shown(e, route));
    }
    setBusy('');
  };
  const short = (cost: number, paidOnly = false) => (paidOnly ? wallet.paid : balance(wallet)) < cost;
  if (!locked && !staked && !treat) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Feather name="star" size={16} color={color.gold} />
        <T v="label" c={color.gold} style={{ flex: 1 }}>{t('wallet.title')}</T>
        <Credits n={balance(wallet)} size="bodyBold" />
      </View>

      {staked ? (
        <T c={color.textDim}>{t('wallet.planStaked', { n: staked })}</T>
      ) : locked ? (
        <>
          <T v="heading">{t('wallet.planStakeTitle')}</T>
          <T v="caption" c={color.textDim}>{t('wallet.planStakeBody', { n: COSTS.stake })}</T>
          <Button kind="ghost" icon="shield" label={t('wallet.planStake', { n: COSTS.stake })} busy={busy === 'stake'} disabled={short(COSTS.stake)}
            onPress={run('stake', async () => setWallet(await backend.stakePlan(inviteId)))} />
        </>
      ) : null}

      {treat ? <TreatState treat={treat} name={name} busy={busy === 'no'} onNo={run('no', async () => setWallet(await backend.declineTreat(inviteId)))} /> : null}

      {!treat && locked && paid && partners.map((p) => (
        <View key={p.id} style={{ gap: space.sm }}>
          <T v="heading">{t('wallet.planTreatTitle', { name })}</T>
          <T v="caption" c={color.textDim}>{t('wallet.planTreatBody', { name, partner: p.name, items: p.items.map((i) => t(`wallet.items.${i}`).toLowerCase()).join(', ') })}</T>
          {p.items.map((item: TreatItem) => (
            <Button key={item} kind="ghost" icon="coffee" label={t('wallet.planTreat', { item: t(`wallet.items.${item}`), name, n: treatCost(item) })}
              busy={busy === item} disabled={short(treatCost(item), true)} onPress={run(item, async () => setWallet(await backend.treatPlan(inviteId, p.id, item)))} />
          ))}
        </View>
      ))}

      {error ? <ErrorText text={error} /> : null}
      {paid && short(COSTS.stake) && !staked && locked ? <Button kind="quiet" label={t('wallet.topUpFirst')} onPress={() => router.push('/wallet')} /> : null}
    </View>
  );
}

const treatCost = (item: TreatItem) => TREATS[item];

function TreatState({ treat, name, busy, onNo }: { treat: NonNullable<ReturnType<typeof useMyWallet>>['treats'][number]; name: string; busy: boolean; onNo: () => void }) {
  const item = t(`wallet.items.${treat.item}`).toLowerCase();
  if (treat.mine) return treat.status === 'back' ? null : <T c={color.textDim}>{treat.status === 'used' ? t('wallet.planTreatUsed') : t('wallet.planTreatGiven', { name, item })}</T>;
  if (treat.status === 'used') return <T c={color.textDim}>{t('wallet.planTreatUsed')}</T>;
  if (treat.status === 'ready' && treat.code) {
    return (
      <View style={styles.voucher}>
        <T v="label" c={color.onGold}>{t('wallet.planVoucher', { item, partner: treat.partner })}</T>
        <T v="display" c={color.onGold} selectable style={{ letterSpacing: 4 }}>{treat.code}</T>
        {treat.until ? <T v="caption" c={color.onGold}>{t('wallet.planVoucherUntil', { time: `${fmtDay(treat.until)}, ${fmtTime(treat.until)}` })}</T> : null}
      </View>
    );
  }
  if (treat.status !== 'held') return null;
  return (
    <>
      <T c={color.textDim}>{t('wallet.planTreated', { name, item, partner: treat.partner })}</T>
      <Button kind="quiet" label={t('wallet.planTreatNo')} busy={busy} onPress={onNo} />
    </>
  );
}

const styles = StyleSheet.create({
  credits: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  coin: { width: 20, height: 20, borderRadius: radius.pill, backgroundColor: color.gold, alignItems: 'center', justifyContent: 'center' },
  coinBig: { width: 34, height: 34 },
  coinEntry: { width: 40, height: 40, borderRadius: radius.pill, backgroundColor: color.gold, alignItems: 'center', justifyContent: 'center' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.goldDeep, borderRadius: radius.card, backgroundColor: color.goldWash, padding: space.lg, marginTop: space.md },
  panel: { borderWidth: 1, borderColor: color.goldDeep, borderRadius: radius.card, backgroundColor: color.goldWash, padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  voucher: { borderRadius: radius.card, backgroundColor: color.gold, padding: space.lg, gap: 4, alignItems: 'center' },
});
