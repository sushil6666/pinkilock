/**
 * The credits wallet (D104). The balance (bought and earned), top-ups through Razorpay on the
 * website, what credits buy (a boost, an extra open ask; stakes and treats live on a plan), how to
 * earn them, and the history. Credits are never cash: the page says so, and nothing here can send
 * them to anybody. The server decides every number (my_wallet); this page shows it.
 */
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Credits, useMyWallet } from '@/components/Wallet';
import { Button } from '@/components/ui/Button';
import { Columns } from '@/components/ui/Columns';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import {
  COSTS, KEPT_REWARDS_PER_WEEK, MAX_EXTRA_ASKS, PACKS, REWARDS, REWARD_KINDS, STREAK_DAYS, VOUCH_REWARDS_MAX, balance, type RewardKind, type TopUpStatus,
} from '@/domain/wallet';
import { haptic } from '@/lib/haptics';
import { quiet } from '@/lib/log';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { fmtDay, fmtNumber, fmtTime, t } from '@/i18n';

const ROUTE = '/wallet';

export default function WalletPage() {
  const me = useStore((s) => s.me);
  const wallet = useMyWallet();
  const setWallet = useStore((s) => s.setWallet);
  const paid = useStore((s) => s.paid);
  const [status, setStatus] = useState<TopUpStatus>({ open: false, test: false });
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    backend.topUpStatus().then(setStatus, quiet('wallet.status'));
  }, []);
  if (!me || !wallet) return <Screen back="back" title={t('wallet.title')}>{null}</Screen>;

  const total = balance(wallet);
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
  const boosted = wallet.boostUntil && wallet.boostUntil > Date.now();

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.gold}>{t('wallet.eyebrow')}</T>
        <T v="display">{t('wallet.title')}</T>
        <T c={color.textDim}>{t('wallet.intro')}</T>
      </View>

      <Animated.View entering={FadeInDown.duration(320)} style={[styles.panel, styles.balance]}>
        <T v="label" c={color.textDim}>{t('wallet.balance')}</T>
        <Credits n={total} size="display" />
        <View style={styles.row}>
          <T v="caption" c={color.textDim}>{t('wallet.bought', { n: fmtNumber(wallet.paid) })}</T>
          <T v="caption" c={color.textDim}>·</T>
          <T v="caption" c={color.textDim}>{t('wallet.earned', { n: fmtNumber(wallet.earned) })}</T>
        </View>
        <View style={styles.rule}>
          <Feather name="lock" size={14} color={color.gold} style={{ marginTop: 2 }} />
          <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('wallet.rules')}</T>
        </View>
      </Animated.View>

      <View style={styles.panel}>
        <T v="heading">{t('wallet.topTitle')}</T>
        {status.open ? (
          <>
            <T v="caption" c={color.textDim}>{t('wallet.topBody')}</T>
            {status.test ? <T v="caption" c={color.gold}>{t('wallet.topTest')}</T> : null}
            <View style={styles.packs}>
              {PACKS.map((p) => (
                <View key={p.id} style={styles.pack}>
                  <Credits n={p.credits} />
                  {p.credits > p.rupees ? <T v="caption" c={color.pink}>{t('wallet.packBonus', { n: p.credits - p.rupees })}</T> : <T v="caption"> </T>}
                  <Button kind={p.id === 'p199' ? 'primary' : 'ghost'} label={t('wallet.packPrice', { rupees: p.rupees })} busy={busy === p.id}
                    onPress={run(p.id, async () => {
                      const before = balance(wallet);
                      const next = await backend.topUp(p.id);
                      setWallet(next);
                      return balance(next) > before ? t('wallet.topDone', { n: balance(next) - before }) : undefined;
                    })} />
                </View>
              ))}
            </View>
          </>
        ) : (
          <T v="caption" c={color.textDim}>{paid ? t(Platform.OS === 'web' ? 'wallet.topOff' : 'wallet.topApp') : t('paused.wallet')}</T>
        )}
        {note ? <T v="caption" c={color.gold}>{note}</T> : null}
      </View>

      <View style={styles.panel}>
        <T v="heading">{t('wallet.spendTitle')}</T>
        <Spend icon="trending-up" title={t('wallet.boostTitle')} body={boosted ? t('wallet.boostOn', { time: `${fmtDay(wallet.boostUntil!)}, ${fmtTime(wallet.boostUntil!)}` }) : paid ? `${t('wallet.boostBody')} ${t('gold.walletBoost')}` : t('wallet.boostBody')} />
        <Button kind="quiet" icon="star" label={t('gold.walletBoostOpen')} onPress={() => router.push('/pink-gold')} />
        <Spend icon="send" title={t('wallet.extraTitle')} body={wallet.extraAsks ? `${t('wallet.extraBody')} ${t('wallet.extraHave', { n: wallet.extraAsks })}` : t('wallet.extraBody')}
          cost={COSTS.extra_ask} busy={busy === 'extra'} disabled={wallet.extraAsks >= MAX_EXTRA_ASKS || total < COSTS.extra_ask} onPress={run('extra', async () => setWallet(await backend.buyExtraAsk()))} />
        <Spend icon="shield" title={t('wallet.stakeTitle')} body={`${t('wallet.stakeBody', { n: COSTS.stake })} ${t('wallet.stakeWhere')}`} />
        {paid ? <Spend icon="coffee" title={t('wallet.treatTitle')} body={t('wallet.treatBody')} /> : null}
        {error ? <ErrorText text={error} /> : null}
      </View>
    </>
  );

  const progress = (k: RewardKind): string => {
    if (k === 'kept_plan') return t('wallet.rewardNotes.kept_plan', { n: wallet.keptThisWeek });
    if (k === 'vouched') return t('wallet.rewardNotes.vouched', { n: wallet.vouchRewards });
    if (k === 'week_streak') return t('wallet.rewardNotes.week_streak', { n: Math.min(wallet.streak, STREAK_DAYS) });
    if (k === 'verified_handle' || k === 'face_checked') return t(wallet.had.includes(k) ? 'wallet.rewardNotes.done' : 'wallet.rewardNotes.once');
    return '';
  };
  const done = (k: RewardKind) => wallet.had.includes(k) || (k === 'kept_plan' && wallet.keptThisWeek >= KEPT_REWARDS_PER_WEEK) || (k === 'vouched' && wallet.vouchRewards >= VOUCH_REWARDS_MAX);

  const right = (
    <>
      <View style={styles.panel}>
        <T v="heading">{t('wallet.earnTitle')}</T>
        <T v="caption" c={color.textDim}>{t('wallet.earnBody')}</T>
        {REWARD_KINDS.map((k) => (
          <View key={k} style={styles.reward}>
            <Feather name={done(k) ? 'check-circle' : 'gift'} size={18} color={done(k) ? color.gold : color.pink} />
            <View style={{ flex: 1 }}>
              <T>{t(`wallet.rewards.${k}`)}</T>
              {progress(k) ? <T v="caption" c={color.textMute}>{progress(k)}</T> : null}
            </View>
            <T v="bodyBold" c={color.gold}>{t('wallet.reward', { n: REWARDS[k] })}</T>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <T v="heading">{t('wallet.historyTitle')}</T>
        {wallet.history.length ? wallet.history.slice(0, 20).map((h) => (
          <View key={h.id} style={styles.reward}>
            <View style={{ flex: 1 }}>
              <T>{h.reward ? `${t('wallet.kinds.reward')}: ${t(`wallet.rewards.${h.reward}`)}` : t(`wallet.kinds.${h.kind}`)}</T>
              <T v="caption" c={color.textMute}>{`${fmtDay(h.at)}, ${fmtTime(h.at)}`}</T>
            </View>
            <T v="bodyBold" c={h.credits > 0 ? color.gold : h.credits < 0 ? color.textDim : color.textMute}>{h.credits > 0 ? `+${fmtNumber(h.credits)}` : fmtNumber(h.credits)}</T>
          </View>
        )) : <T v="caption" c={color.textDim}>{t('wallet.historyEmpty')}</T>}
      </View>
    </>
  );

  return (
    <Screen back="back" title={t('wallet.title')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

function Spend({ icon, title, body, cost, busy, disabled, onPress }: {
  icon: keyof typeof Feather.glyphMap; title: string; body: string; cost?: number; busy?: boolean; disabled?: boolean; onPress?: () => void;
}) {
  return (
    <View style={styles.spend}>
      <View style={styles.row}>
        <Feather name={icon} size={18} color={color.gold} />
        <T v="bodyBold" style={{ flex: 1 }}>{title}</T>
      </View>
      <T v="caption" c={color.textDim}>{body}</T>
      {cost && onPress ? <Button kind="ghost" label={t('wallet.buy', { n: cost })} busy={busy} disabled={disabled} onPress={onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md },
  balance: { borderColor: color.goldDeep, backgroundColor: color.goldWash, alignItems: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  rule: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  packs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  pack: { flexGrow: 1, flexBasis: '40%', borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surfaceHi, padding: space.md, gap: space.sm, alignItems: 'center' },
  reward: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 40 },
  spend: { gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: color.line },
});
