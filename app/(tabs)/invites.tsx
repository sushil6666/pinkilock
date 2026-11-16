/** Asks: vibe checks waiting on me, and the ones I sent. Locked ones move to Plans. */
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { InviteCard } from '@/components/InviteCard';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { MAX_OPEN_ASKS, isOpen, otherId } from '@/domain/invites';
import type { Invite } from '@/domain/types';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/useNow';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';

type Side = 'in' | 'out';

export default function Invites() {
  const meId = useStore((s) => s.me?.id ?? '');
  const invites = useStore((s) => s.invites);
  const profiles = useStore((s) => s.profiles);
  const now = useNow();
  const [side, setSide] = useState<Side>('in');

  const mine = (i: Invite) => (side === 'in' ? i.toId === meId : i.fromId === meId);
  const open = invites.filter((i) => mine(i) && isOpen(i)).sort((a, b) => a.expiresAt - b.expiresAt);
  const closed = invites.filter((i) => mine(i) && (i.status === 'declined' || i.status === 'expired')).sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
  const counts = { in: invites.filter((i) => i.toId === meId && isOpen(i)).length, out: invites.filter((i) => i.fromId === meId && isOpen(i)).length };

  const row = (i: Invite, k: number) => (
    <Animated.View key={i.id} entering={FadeInDown.delay(k * 60).duration(320)}>
      <InviteCard compact invite={i} meId={meId} other={profiles.find((p) => p.id === otherId(i, meId))} now={now} onPress={() => router.push(`/invite/${i.id}`)} />
    </Animated.View>
  );

  return (
    <Screen inTabs>
      <T v="display" style={{ marginBottom: space.lg }}>Vibe{'\n'}checks</T>

      <View style={styles.seg} accessibilityRole="tablist">
        {(['in', 'out'] as Side[]).map((s) => (
          <Pressable key={s} accessibilityRole="tab" accessibilityState={{ selected: side === s }} onPress={() => { haptic.tick(); setSide(s); }} style={[styles.segBtn, side === s && styles.segOn]}>
            <T v="label" c={side === s ? color.onPink : color.textDim}>{s === 'in' ? 'For you' : 'Sent'}  {counts[s]}</T>
          </Pressable>
        ))}
      </View>

      <View key={side} style={{ gap: space.md, marginTop: space.lg }}>
        {side === 'out' && <T v="caption" c={color.textDim}>{counts.out} of {MAX_OPEN_ASKS} asks open. Three at a time keeps every one of them meant.</T>}
        {open.map(row)}
        {open.length === 0 && (
          <View style={styles.empty}>
            <T v="title">{side === 'in' ? 'Nobody waiting on you.' : 'Nothing out there yet.'}</T>
            <T c={color.textDim}>{side === 'in' ? 'When someone asks you to something, it lands here with a clock on it.' : 'Pick a person, pick one tiny plan, put a time on it.'}</T>
            <Button kind="ghost" icon="compass" label="Go to Discover" onPress={() => router.push('/(tabs)')} />
          </View>
        )}
        {closed.length > 0 && <T v="label" c={color.textMute} style={{ marginTop: space.lg }}>Closed</T>}
        {closed.map(row)}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  seg: { flexDirection: 'row', borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: 4, gap: 4 },
  segBtn: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.card - 4 },
  segOn: { backgroundColor: color.pink },
  empty: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: space.xl, gap: space.md, backgroundColor: color.surface },
});
