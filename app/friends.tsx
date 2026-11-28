/**
 * Bring a friend (D118). My link, what a friend who counts gives us both (a week of Pink Gold each,
 * a free Boost for me, a free month at five friends), a Doubles invite that counts as my link, and
 * the rules. A friend who joined with a link sees their own checklist here. The server decides who
 * counts and gives everything (my_referrals); nobody is ever named, and nothing is ever given for a
 * rating or a review.
 */
import { Fold } from '@/components/ui/Fold';
import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { Columns } from '@/components/ui/Columns';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import {
  NEED_KEYS, REFERRAL_BOOSTS, REFERRAL_CAP, REFERRAL_GOLD_DAYS, REFERRAL_MONTH_AT, REFERRAL_MONTH_DAYS, REFERRAL_WINDOW_DAYS,
  emptyReferrals, referralRewards, toMonth, type MyReferrals,
} from '@/domain/referrals';
import { REFERRAL_DAYS } from '@/domain/talk';
import { haptic } from '@/lib/haptics';
import { shown } from '@/lib/report';
import { shareOrCopy } from '@/lib/shareOrCopy';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

const ROUTE = '/friends';
const linkTo = (path: string) => (Platform.OS === 'web' ? `${window.location.origin}${path}` : Linking.createURL(path));
const NEED_ROUTES = { phone: '/account/sign-in?mode=link&kind=phone', face: '/face', plans: '/(tabs)/me', device: null } as const;

export default function BringAFriend() {
  const duoId = useStore((s) => s.duoId);
  const [state, setState] = useState<MyReferrals>(emptyReferrals());
  const [busy, setBusy] = useState('');
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => backend.myReferrals().then(setState, (e) => setError(shown(e, ROUTE))), []);
  useEffect(() => {
    void load();
  }, [load]);

  const run = (what: string, work: () => Promise<void>) => async () => {
    setBusy(what);
    setError('');
    setCopied('');
    try {
      await work();
    } catch (e) {
      haptic.warning();
      setError(shown(e, ROUTE));
    }
    setBusy('');
  };
  const shareLink = run('link', async () => {
    if (!state.code) return;
    if ((await shareOrCopy(t('friends.shareText', { url: linkTo(`/r/${state.code}`), days: REFERRAL_GOLD_DAYS }))) === 'copied') setCopied('link');
  });
  const shareDuo = run('duo', async () => {
    const token = await backend.createDuoLink();
    if ((await shareOrCopy(t('friends.duoShareText', { url: linkTo(`/duo/${token}`) }))) === 'copied') setCopied('duo');
  });

  const got = referralRewards(state.counted);
  const more = toMonth(state.counted);
  const waiting = Math.max(state.joined - state.counted, 0);

  const left = (
    <>
      <Animated.View entering={FadeInDown.duration(320)} style={[styles.panel, styles.hero]}>
        <T v="label" c={color.gold}>{t('friends.eyebrow')}</T>
        <T v="display">{t('friends.title')}</T>
        <T c={color.textDim}>{t('friends.intro', { days: REFERRAL_GOLD_DAYS })}</T>
        <Button icon="share-2" label={t('friends.share')} disabled={!state.code} busy={busy === 'link'} onPress={shareLink} />
        {copied === 'link' ? <T v="caption" c={color.gold}>{t('friends.copied')}</T> : null}
        {backend.demoReferral ? (
          <Button kind="ghost" icon="user-plus" label={t('friends.demo')} busy={busy === 'demo'}
            onPress={run('demo', async () => {
              setState(await backend.demoReferral!());
              setTimeout(() => void load(), 4500);
            })} />
        ) : null}
      </Animated.View>

      <Fold icon="gift" accent title={t('friends.rewardsTitle')} value={t('fold.perks', { count: 4 })}>
        <Reward icon="award" title={t('friends.goldTitle', { days: REFERRAL_GOLD_DAYS })} body={t('friends.goldBody', { days: REFERRAL_GOLD_DAYS })} />
        <Reward icon="trending-up" title={t('friends.boostTitle', { count: REFERRAL_BOOSTS })} body={t('friends.boostBody')} />
        <Reward icon="gift" title={t('friends.monthTitle', { count: REFERRAL_MONTH_AT })} body={t('friends.monthBody', { count: REFERRAL_MONTH_AT, days: REFERRAL_MONTH_DAYS })} />
        <Reward icon="phone-call" title={t('friends.callTitle')} body={t('friends.callBody')} />
      </Fold>

      <Fold icon="users" title={t('friends.duoTitle')} open={copied === 'duo'}>
        <T c={color.textDim}>{t('friends.duoBody')}</T>
        <Button kind="ghost" icon="user-plus" label={t('friends.duoShare')} busy={busy === 'duo'} disabled={!!duoId || !!busy} onPress={shareDuo} />
        {duoId ? <T v="caption" c={color.textDim}>{t('friends.duoHave')}</T> : null}
        {copied === 'duo' ? <T v="caption" c={color.gold}>{t('friends.copied')}</T> : null}
      </Fold>
    </>
  );

  const right = (
    <>
      <Fold icon="bar-chart-2" title={t('friends.progressTitle')} value={`${Math.min(state.counted, REFERRAL_MONTH_AT)} / ${REFERRAL_MONTH_AT}`}>
        <View style={styles.dots} accessibilityLabel={t('friends.progressLabel', { count: Math.min(state.counted, REFERRAL_MONTH_AT), max: REFERRAL_MONTH_AT })}>
          {Array.from({ length: REFERRAL_MONTH_AT }, (_, i) => (
            <View key={i} style={[styles.dot, i < state.counted && styles.dotOn]}>
              {i < state.counted ? <Feather name="check" size={16} color={color.onPink} /> : null}
            </View>
          ))}
        </View>
        <T c={color.textDim}>
          {state.month ? t('friends.monthGot') : t('friends.toMonth', { count: more })}
        </T>
        <View style={styles.stats}>
          <Stat n={state.joined} label={t('friends.joined')} />
          <Stat n={state.counted} label={t('friends.counted')} />
          <Stat n={waiting} label={t('friends.waiting')} />
        </View>
        {state.counted ? (
          <T v="caption" c={color.gold}>{t('friends.gotSoFar', { days: got.goldDays, count: got.boosts })}</T>
        ) : null}
        {waiting ? <T v="caption" c={color.textDim}>{t('friends.waitingBody')}</T> : null}
        <Button kind="ghost" icon="award" label={t('friends.seeGold')} onPress={() => router.push('/pink-gold')} />
      </Fold>

      {state.mine ? (
        <View style={[styles.panel, state.mine.counted && styles.hero]}>
          <T v="heading">{state.mine.counted ? t('friends.mineDone', { days: REFERRAL_GOLD_DAYS }) : t('friends.mineTitle', { days: REFERRAL_GOLD_DAYS })}</T>
          {state.mine.counted ? null : NEED_KEYS.map((k) => {
            const done = state.mine![k];
            const go = NEED_ROUTES[k];
            return (
              <View key={k} style={styles.row}>
                <Feather name={done ? 'check-circle' : 'circle'} size={18} color={done ? color.gold : color.textMute} />
                <T style={{ flex: 1 }} c={done ? color.text : color.textDim}>{t(`friends.need.${k === 'phone' && !state.needsPhone ? 'linked' : k}`)}</T>
                {!done && go ? <Tag label={t('friends.do')} tone={color.gold} onPress={() => router.push(go)} /> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <Fold icon="list" title={t('friends.rulesTitle')}>
        {(['rules.counts', 'rules.week', 'rules.device', 'rules.self', 'rules.cap', 'rules.never'] as const).map((k) => (
          <View key={k} style={styles.rule}>
            <Feather name="check" size={14} color={color.gold} />
            <T v="caption" c={color.textDim} style={{ flex: 1 }}>
              {t(`friends.${k}`, { phone: t(state.needsPhone ? 'friends.aPhone' : 'friends.aPhoneOrEmail'), days: REFERRAL_DAYS, count: REFERRAL_CAP, window: REFERRAL_WINDOW_DAYS })}
            </T>
          </View>
        ))}
      </Fold>
      {error ? <ErrorText text={error} /> : null}
    </>
  );

  return (
    <Screen back="back" title={t('friends.title')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

function Reward({ icon, title, body }: { icon: keyof typeof Feather.glyphMap; title: string; body: string }) {
  return (
    <View style={styles.reward}>
      <View style={styles.rewardIcon}><Feather name={icon} size={16} color={color.onPink} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bodyBold">{title}</T>
        <T v="caption" c={color.textDim}>{body}</T>
      </View>
    </View>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <View style={styles.stat}>
      <T v="title" c={color.gold}>{String(n)}</T>
      <T v="caption" c={color.textDim}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md },
  hero: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm },
  reward: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  rewardIcon: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: color.pink, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: space.sm },
  dot: { flex: 1, height: 36, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, backgroundColor: color.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: color.pink, borderColor: color.pink },
  stats: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surfaceHi, paddingVertical: space.md },
});
