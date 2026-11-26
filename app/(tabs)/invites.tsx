/** Asks: vibe checks waiting on me, and the ones I sent. Locked ones move to Plans. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { InviteCard } from '@/components/InviteCard';
import { Button } from '@/components/ui/Button';
import { Grid } from '@/components/ui/Columns';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { DAY, MAX_OPEN_ASKS, isOpen, otherId } from '@/domain/invites';
import { BOUNCE_DAYS } from '@/domain/selfLove';
import { MEMBER_OPEN_ASKS, asksInView } from '@/domain/pinkGold';
import { Feather } from '@expo/vector-icons';
import type { Invite } from '@/domain/types';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/useNow';
import { aria } from '@/lib/web';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

type Side = 'in' | 'out';

export default function Invites() {
  const meId = useStore((s) => s.me?.id ?? '');
  const invites = useStore((s) => s.invites);
  const profiles = useStore((s) => s.profiles);
  const now = useNow();
  const [side, setSide] = useState<Side>('in');

  // "Sent" is what I asked; everything else waits on me, including a double my duo partner sent.
  const mine = (i: Invite) => (side === 'in' ? i.fromId !== meId : i.fromId === meId);
  const open = invites.filter((i) => mine(i) && isOpen(i)).sort((a, b) => a.expiresAt - b.expiresAt);
  const closed = invites.filter((i) => mine(i) && (i.status === 'declined' || i.status === 'expired' || i.status === 'ended')).sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
  // Bounce back (D101): an ask of mine that someone else said no to, or that ran out, lately.
  const stung = invites.find((i) => i.fromId === meId && ((i.status === 'declined' && i.declinedBy && i.declinedBy !== meId) || i.status === 'expired')
    && (i.resolvedAt ?? 0) > now - BOUNCE_DAYS * DAY);
  // See who asked you (D116): members see every ask waiting on them; others the next one and a count.
  const gold = useStore((s) => !!s.me?.pinkGold);
  const inView = side === 'in' ? asksInView(open, gold) : { shown: open, more: 0 };
  const counts = { in: invites.filter((i) => i.fromId !== meId && isOpen(i)).length, out: invites.filter((i) => i.fromId === meId && isOpen(i)).length };

  const row = (i: Invite, k: number) => (
    <Animated.View key={i.id} entering={FadeInDown.delay(k * 60).duration(320)}>
      <InviteCard compact invite={i} meId={meId} other={profiles.find((p) => p.id === otherId(i, meId))} now={now} onPress={() => router.push(`/invite/${i.id}`)} />
    </Animated.View>
  );

  return (
    <Screen inTabs>
      <T v="display" style={{ marginBottom: space.lg }}>{t('asks.title')}</T>

      <View style={styles.seg} accessibilityRole="tablist">
        {(['in', 'out'] as Side[]).map((s) => (
          <Pressable key={s} accessibilityRole="tab" accessibilityState={{ selected: side === s }} {...aria({ selected: side === s })} onPress={() => { haptic.tick(); setSide(s); }} style={[styles.segBtn, side === s && styles.segOn]}>
            <T v="label" c={side === s ? color.onPink : color.textDim}>{t(s === 'in' ? 'asks.forYou' : 'asks.sent', { count: counts[s] })}</T>
          </Pressable>
        ))}
      </View>

      <View key={side} style={{ gap: space.md, marginTop: space.lg }}>
        {side === 'out' && stung ? (
          <View style={styles.bounce}>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Feather name="sunrise" size={20} color={color.pink} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyBold">{t('bounce.notice')}</T>
                <T v="caption" c={color.textDim}>{t('bounce.noticeBody')}</T>
              </View>
            </View>
            <Button kind="ghost" icon="arrow-right" label={t('bounce.noticeOpen')} onPress={() => router.push({ pathname: '/self-love/bounce-back', params: { after: stung.status === 'expired' ? 'expired' : 'no', invite: stung.id } })} />
          </View>
        ) : null}
        {side === 'out' && <T v="caption" c={color.textDim}>{t('asks.openOf', { count: counts.out, max: gold ? MEMBER_OPEN_ASKS : MAX_OPEN_ASKS })}</T>}
        <Grid>{inView.shown.map(row)}</Grid>
        {inView.more > 0 && (
          <View style={styles.more}>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <Feather name="eye-off" size={20} color={color.gold} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyBold">{t('asks.moreWaiting', { count: inView.more })}</T>
                <T v="caption" c={color.textDim}>{t('asks.moreBody')}</T>
              </View>
            </View>
            <Button kind="ghost" icon="star" label={t('asks.seeAllGold')} onPress={() => router.push('/pink-gold')} />
          </View>
        )}
        {open.length === 0 && (
          <View style={styles.empty}>
            <T v="title">{t(side === 'in' ? 'asks.noneIn' : 'asks.noneOut')}</T>
            <T c={color.textDim}>{t(side === 'in' ? 'asks.noneInBody' : 'asks.noneOutBody')}</T>
            <Button kind="ghost" icon="compass" label={t('asks.goDiscover')} onPress={() => router.push('/(tabs)')} />
          </View>
        )}
        {closed.length > 0 && <T v="label" c={color.textMute} style={{ marginTop: space.lg }}>{t('asks.closed')}</T>}
        <Grid>{closed.map(row)}</Grid>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: 4, gap: 4 },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.card - 4 },
  segOn: { backgroundColor: color.pink },
  bounce: { gap: space.md, borderWidth: 1, borderColor: color.pinkDeep, backgroundColor: color.pinkWash, borderRadius: radius.card, padding: space.lg },
  more: { gap: space.md, borderWidth: 1, borderColor: color.gold, backgroundColor: color.goldWash, borderRadius: radius.card, padding: space.lg },
  empty: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: space.xl, gap: space.md, backgroundColor: color.surface },
});
