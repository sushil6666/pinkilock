/**
 * Pink Gold (D115, D116): the membership and Boosts. What members get, the four plans and the two
 * Boost packs, bought through Razorpay on the website (the phone apps wait for Play Billing, O15),
 * and using a Boost. Paid in rupees, never with credits. The server prices and decides everything
 * (wallet_open_order, wallet_paid, wallet_boost); this page shows what my_wallet says.
 */
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { PinkGold } from '@/components/PinkGold';
import { useMyWallet } from '@/components/Wallet';
import { Button } from '@/components/ui/Button';
import { Columns } from '@/components/ui/Columns';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { BOOST_PACKS, PLANS, perMonth, saves } from '@/domain/pinkGold';
import type { TopUpStatus } from '@/domain/wallet';
import { haptic } from '@/lib/haptics';
import { quiet } from '@/lib/log';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { fmtDay, fmtNumber, fmtTime, t } from '@/i18n';

const ROUTE = '/pink-gold';
const PERKS = [['award', 'badge'], ['eye', 'whoAsked'], ['send', 'asks'], ['trending-up', 'boosts'], ['compass', 'discover'], ['map', 'cities'], ['message-circle', 'saathi']] as const;
const rupees = (n: number) => fmtNumber(n);

export default function PinkGoldPage() {
  const me = useStore((s) => s.me);
  const wallet = useMyWallet();
  const setWallet = useStore((s) => s.setWallet);
  // D117: while payments are paused the perks stay and nothing is priced or sold.
  const paid = useStore((s) => s.paid);
  const [status, setStatus] = useState<TopUpStatus>({ open: false, test: false });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    backend.topUpStatus().then(setStatus, quiet('gold.status'));
  }, []);
  if (!me || !wallet) return <Screen back="back" title={t('pinkGold.name')}>{null}</Screen>;

  const run = (what: string, work: () => Promise<string | void>) => async () => {
    setBusy(what);
    setError('');
    setNote('');
    try {
      const said = await work();
      if (said) setNote(said);
      haptic.success();
    } catch (e) {
      haptic.warning();
      setError(shown(e, ROUTE));
    }
    setBusy('');
  };
  const buy = (id: string, done: string) => run(id, async () => {
    const before = wallet;
    const next = await backend.topUp(id);
    setWallet(next);
    // Closed without paying: nothing changed, and nothing is said.
    const changed = next.goldUntil !== before.goldUntil || next.gold !== before.gold || (next.boosts ?? 0) > (before.boosts ?? 0);
    return changed ? done : undefined;
  });
  const boosted = !!wallet.boostUntil && wallet.boostUntil > Date.now();
  const boosts = wallet.boosts ?? 0;
  const canPay = status.open;
  const payNote = canPay ? (status.test ? t('gold.test') : null) : t(Platform.OS === 'web' ? 'gold.off' : 'gold.app');

  const left = (
    <>
      <Animated.View entering={FadeInDown.duration(320)} style={[styles.panel, styles.hero]}>
        <T v="label" c={color.gold}>{t('gold.eyebrow')}</T>
        <PinkGold person={{ name: me.name, pinkGold: true }} mine={!!wallet.gold} />
        <T v="display">{t('pinkGold.name')}</T>
        <T c={color.textDim}>{t('gold.intro')}</T>
        {wallet.gold ? (
          <View style={styles.row}>
            <Feather name="check-circle" size={16} color={color.gold} />
            <T v="bodyBold" c={color.gold} style={{ flex: 1 }}>{wallet.goldUntil ? t('gold.on', { date: fmtDay(wallet.goldUntil) }) : t('gold.onForever')}</T>
          </View>
        ) : null}
      </Animated.View>

      <View style={styles.panel}>
        <T v="heading">{t('gold.perksTitle')}</T>
        {PERKS.map(([icon, key]) => (
          <View key={key} style={styles.perk}>
            <View style={styles.perkIcon}><Feather name={icon} size={16} color={color.onPink} /></View>
            <T style={{ flex: 1 }}>{t(`gold.perks.${key}`)}</T>
          </View>
        ))}
      </View>
    </>
  );

  const right = (
    <>
      {paid ? null : (
        <View style={styles.panel}>
          <View style={styles.row}>
            <Feather name="pause-circle" size={18} color={color.gold} />
            <T v="heading" style={{ flex: 1 }}>{t('paused.goldTitle')}</T>
          </View>
          <T c={color.textDim}>{t('paused.goldBody')}</T>
        </View>
      )}
      {paid ? <View style={styles.panel}>
        <T v="heading">{t('gold.plansTitle')}</T>
        <T v="caption" c={color.textDim}>{t('gold.plansBody')}</T>
        {payNote ? <T v="caption" c={canPay ? color.gold : color.textDim}>{payNote}</T> : null}
        <View style={styles.grid}>
          {PLANS.map((p) => (
            <View key={p.id} style={[styles.plan, p.id === 'g12' && styles.planBest]}>
              {p.id === 'g12' ? <T v="label" c={color.pink}>{t('gold.best')}</T> : <T v="label" c={color.textMute}>{' '}</T>}
              <T v="bodyBold">{t('gold.months', { count: p.months })}</T>
              <T v="title" c={color.gold}>{t('gold.price', { rupees: rupees(p.rupees) })}</T>
              <T v="caption" c={color.textDim}>{p.months > 1 ? t('gold.perMonth', { rupees: rupees(perMonth(p)) }) : ' '}</T>
              <T v="caption" c={color.pink}>{saves(p) > 0 ? t('gold.save', { rupees: rupees(saves(p)) }) : ' '}</T>
              {canPay ? (
                <Button kind={p.id === 'g3' ? 'primary' : 'ghost'} label={t('gold.pay', { rupees: rupees(p.rupees) })} busy={busy === p.id}
                  disabled={!!busy} onPress={buy(p.id, t('gold.donePlan'))} />
              ) : null}
            </View>
          ))}
        </View>
      </View> : null}

      <View style={styles.panel}>
        <T v="heading">{t('gold.boostsTitle')}</T>
        <T v="caption" c={color.textDim}>{t('gold.boostsBody')}</T>
        {boosted ? <T v="bodyBold" c={color.gold}>{t('gold.boostOn', { time: `${fmtDay(wallet.boostUntil!)}, ${fmtTime(wallet.boostUntil!)}` })}</T> : null}
        <T c={boosts ? color.text : color.textDim}>
          {boosts && wallet.boostLapses ? t('gold.boostsHave', { count: boosts, date: fmtDay(wallet.boostLapses) }) : t('gold.boostsNone')}
        </T>
        {boosts > 0 ? (
          <Button icon="trending-up" label={t('gold.useBoost')} busy={busy === 'use'} disabled={boosted || !!busy}
            onPress={run('use', async () => setWallet(await backend.boost()))} />
        ) : null}
        {paid ? null : <T v="caption" c={color.textDim}>{t('paused.boosts')}</T>}
        {paid ? <View style={styles.grid}>
          {BOOST_PACKS.map((b) => (
            <View key={b.id} style={styles.plan}>
              <T v="bodyBold">{t('gold.boostPack', { count: b.boosts })}</T>
              <T v="title" c={color.gold}>{t('gold.price', { rupees: rupees(b.rupees) })}</T>
              <T v="caption" c={color.pink}>{b.boosts > 1 ? t('gold.save', { rupees: rupees(BOOST_PACKS[0].rupees * b.boosts - b.rupees) }) : ' '}</T>
              {canPay ? (
                <Button kind="ghost" label={t('gold.pay', { rupees: rupees(b.rupees) })} busy={busy === b.id} disabled={!!busy} onPress={buy(b.id, t('gold.doneBoosts'))} />
              ) : null}
            </View>
          ))}
        </View> : null}
        {note ? <T v="caption" c={color.gold}>{note}</T> : null}
        {error ? <ErrorText text={error} /> : null}
      </View>
    </>
  );

  return (
    <Screen back="back" title={t('pinkGold.name')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md },
  hero: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  perk: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 36 },
  perkIcon: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: color.pink, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  plan: { flexGrow: 1, flexBasis: '40%', borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surfaceHi, padding: space.md, gap: space.xs, alignItems: 'center' },
  planBest: { borderColor: color.gold, borderWidth: 1.5 },
});
