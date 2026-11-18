/** Plans: what is locked, counting down, and the record of what was kept or flaked. */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Countdown } from '@/components/Countdown';
import { statusLine } from '@/components/InviteCard';
import { Portrait } from '@/components/Portrait';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { ideaOf } from '@/domain/ideas';
import { checkInPhase, isDone, otherId } from '@/domain/invites';
import { shortCountdown, whenLabel } from '@/domain/time';
import type { Invite } from '@/domain/types';
import { useNow } from '@/lib/useNow';
import { useStore } from '@/state/store';
import { elevation } from '@/theme/elevation';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

export default function Plans() {
  const meId = useStore((s) => s.me?.id ?? '');
  const invites = useStore((s) => s.invites);
  const profiles = useStore((s) => s.profiles);
  const now = useNow();

  const locked = invites.filter((i) => i.status === 'locked').sort((a, b) => a.startsAt - b.startsAt);
  const history = invites.filter(isDone).sort((a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0));
  const [next, ...later] = locked;
  const who = (i: Invite) => profiles.find((p) => p.id === otherId(i, meId));
  const open = (i: Invite) => router.push(`/plan/${i.id}`);

  return (
    <Screen inTabs>
      <T v="display" style={{ marginBottom: space.lg }}>{t('plans.title')}</T>

      {next ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t('plans.nextSpoken', { idea: ideaOf(next.ideaId).title, name: who(next)?.name ?? t('common.someone') })} onPress={() => open(next)} style={[styles.hero, elevation('glow')]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <T v="label" c={color.pink}>{t('plans.next')}</T>
            {checkInPhase(next, now) === 'open' && <T v="label" c={color.gold}>{t(next.checkIns.includes(meId) ? 'plans.checkedIn' : 'plans.checkInOpen')}</T>}
          </View>
          <Countdown target={next.startsAt} now={now} tone={now >= next.startsAt ? color.gold : color.text} />
          <View style={styles.heroFoot}>
            <T style={{ fontSize: 30, lineHeight: 38 }} maxFontSizeMultiplier={1}>{ideaOf(next.ideaId).emoji}</T>
            <View style={{ flex: 1 }}>
              <T v="heading" numberOfLines={1}>{ideaOf(next.ideaId).title}</T>
              <T v="caption" c={color.textDim}>{t('lock.withWhen', { who: who(next)?.name ?? t('common.someone'), when: whenLabel(next.startsAt, now) })}</T>
            </View>
            <Feather name="arrow-right" size={20} color={color.pink} />
          </View>
        </Pressable>
      ) : (
        <View style={styles.empty}>
          <T v="title">{t('plans.emptyTitle')}</T>
          <T c={color.textDim}>{t('plans.emptyBody')}</T>
          <Button icon="send" label={t('discover.seeAsks')} onPress={() => router.push('/(tabs)/invites')} />
        </View>
      )}

      {later.length > 0 && <T v="label" c={color.textDim} style={styles.section}>{t('plans.later')}</T>}
      <View style={{ gap: space.sm }}>
        {later.map((i, k) => (
          <Animated.View key={i.id} entering={FadeInDown.delay(k * 60).duration(320)}>
            <Row invite={i} name={who(i)?.name ?? t('common.someone')} portrait={who(i)} right={shortCountdown(i.startsAt, now)} tone={color.pink} sub={whenLabel(i.startsAt, now)} onPress={() => open(i)} />
          </Animated.View>
        ))}
      </View>

      {history.length > 0 && <T v="label" c={color.textDim} style={styles.section}>{t('plans.record')}</T>}
      <View style={{ gap: space.sm }}>
        {history.map((i, k) => {
          const s = statusLine(i, meId, who(i)?.name ?? 'They', now);
          return (
            <Animated.View key={i.id} entering={FadeInDown.delay(k * 60).duration(320)}>
              <Row invite={i} name={who(i)?.name ?? t('common.someone')} portrait={who(i)} right={s.text} tone={s.tone} sub={whenLabel(i.startsAt, now)} onPress={() => open(i)} />
            </Animated.View>
          );
        })}
      </View>
    </Screen>
  );
}

function Row({ invite, name, portrait, right, tone, sub, onPress }: { invite: Invite; name: string; portrait?: { name: string; palette: [string, string]; glyph: string }; right: string; tone: string; sub: string; onPress: () => void }) {
  const idea = ideaOf(invite.ideaId);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('plans.rowSpoken', { idea: idea.title, name, when: sub, status: right })} onPress={onPress} style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.surfaceHi }]}>
      {portrait && <Portrait {...portrait} size={44} />}
      <View style={{ flex: 1 }}>
        <T v="bodyBold" numberOfLines={1}>{`${idea.emoji}  ${idea.title}`}</T>
        <T v="caption" c={color.textDim} numberOfLines={1}>{`${name}  /  ${sub}`}</T>
      </View>
      <T v="label" c={tone} style={{ fontVariant: ['tabular-nums'], maxWidth: 120, textAlign: 'right' }}>{right}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { borderWidth: 1, borderColor: color.pink, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.lg },
  heroFoot: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.md },
  empty: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: space.xl, gap: space.md, backgroundColor: color.surface },
  section: { marginTop: space.x3, marginBottom: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md, minHeight: 68 },
});
