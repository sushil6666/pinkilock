/**
 * A locked plan: the countdown, check-in when the window opens, the way out (bail, at a cost),
 * and after you both show, the reveal.
 */
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Countdown } from '@/components/Countdown';
import { LockedReveal } from '@/components/LockedReveal';
import { Portrait } from '@/components/Portrait';
import { TrustBadge } from '@/components/TrustBadge';
import { Button } from '@/components/ui/Button';
import { HoldButton } from '@/components/ui/HoldButton';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { ideaOf, openerOf } from '@/domain/ideas';
import { CHECK_IN_CLOSES_AFTER, CHECK_IN_OPENS_BEFORE, checkInPhase, otherId } from '@/domain/invites';
import { shortCountdown, timeLabel, whenLabel } from '@/domain/time';
import { trustOf, trustScore } from '@/domain/trust';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/useNow';
import { useReveal } from '@/lib/useReveal';
import { backend } from '@/services';
import { useInvite, usePerson, useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useStore((s) => s.me);
  const invite = useInvite(id);
  const other = usePerson(invite && me ? otherId(invite, me.id) : undefined);
  const checkIn = useStore((s) => s.checkIn);
  const bail = useStore((s) => s.bail);
  const bringForward = useStore((s) => s.demoBringForward);
  const now = useNow();
  const reveal = useReveal(invite?.status === 'kept' ? invite.id : undefined);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!invite || !me || !other) {
    return (
      <Screen back="back" scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
          <T v="display">No plan{'\n'}here.</T>
          <T c={color.textDim}>This plan does not exist any more.</T>
        </View>
      </Screen>
    );
  }

  const idea = ideaOf(invite.ideaId);
  const name = other.name;
  const phase = checkInPhase(invite, now);
  const iAmIn = invite.checkIns.includes(me.id);
  const theyAreIn = invite.checkIns.includes(other.id);
  const locked = invite.status === 'locked';
  const kept = invite.status === 'kept';
  const flaked = invite.status === 'flaked';
  const myFlake = flaked && invite.flakedBy === me.id;

  const run = async (work: () => Promise<void>, ok: () => void) => {
    setBusy(true);
    setError('');
    try {
      await work();
      ok();
    } catch (e) {
      haptic.warning();
      setError(e instanceof Error ? e.message : 'That did not go through. Try again.');
    }
    setBusy(false);
  };

  let footer = null;
  if (locked && phase === 'open' && !iAmIn) footer = <Button icon="check" label="I'm here. Check in" onPress={() => run(() => checkIn(invite.id), haptic.success)} busy={busy} />;
  else if (!locked) footer = <Button kind="ghost" icon="user" label={`${name}'s profile`} onPress={() => router.push(`/profile/${other.id}`)} />;

  return (
    <Screen back="back" title={kept ? 'Promise kept' : flaked ? 'Promise broken' : 'Locked plan'} footer={footer}>
      <Animated.View entering={FadeInDown.duration(360)} style={{ gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <T v="label" c={kept ? color.volt : flaked ? color.flare : color.pink}>
            {kept ? 'You both showed' : flaked ? (myFlake ? 'You flaked' : `${name} flaked`) : now >= invite.startsAt ? 'Happening now' : 'Starts in'}
          </T>
          {locked && <Countdown target={invite.startsAt} now={now} tone={phase === 'open' ? color.volt : color.text} />}
          {kept && <T v="mega" c={color.volt}>Kept.</T>}
          {flaked && <T v="mega" c={color.flare}>{myFlake ? 'Missed.' : 'Stood up.'}</T>}
        </View>

        <View style={styles.card}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
            <T style={{ fontSize: 40, lineHeight: 50 }} maxFontSizeMultiplier={1}>{idea.emoji}</T>
            <View style={{ flex: 1, gap: 4 }}>
              <T v="title">{idea.title}</T>
              <Meta icon="clock" text={`${whenLabel(invite.startsAt, now)}  /  ${invite.minutes} min`} />
              <Meta icon={idea.kind === 'irl' ? 'map-pin' : 'smartphone'} text={invite.place} />
            </View>
          </View>
          {invite.note ? <T style={styles.note}>"{invite.note}"</T> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}'s profile`} onPress={() => router.push(`/profile/${other.id}`)} style={styles.who}>
            <Portrait name={name} palette={other.palette} glyph={other.glyph} size={44} />
            <View style={{ flex: 1 }}>
              <T v="bodyBold">with {name}</T>
              <T v="caption" c={color.textDim}>{other.age}, {other.area}</T>
            </View>
            <TrustBadge person={other} brief />
          </Pressable>
        </View>

        {locked && (
          <View style={{ gap: space.md }}>
            <T v="label" c={color.textDim}>Check-in</T>
            <View style={styles.checks}>
              <Check label="You" done={iAmIn} />
              <View style={styles.link} />
              <Check label={name} done={theyAreIn} />
            </View>
            <T c={color.textDim}>
              {phase === 'early' ? `Opens at ${timeLabel(invite.startsAt - CHECK_IN_OPENS_BEFORE)}, ten minutes before. Both of you check in and the promise is kept.`
                : iAmIn ? `You are in. Waiting for ${name} to check in.`
                : `Open for another ${shortCountdown(invite.startsAt + CHECK_IN_CLOSES_AFTER, now)}. Miss it and it counts as a flake.`}
            </T>
            {idea.kind === 'irl' && <Meta icon="shield" text="Meet somewhere public and tell a friend where you are." />}
          </View>
        )}

        {locked && (
          <View style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>Break the ice</T>
            <T v="heading">{openerOf(idea.id)}</T>
            <T v="caption" c={color.textDim}>No chat before the date, so here is your first line.</T>
          </View>
        )}

        {flaked && (
          <View style={[styles.banner, { borderColor: color.flare, backgroundColor: color.flareWash }]}>
            <T v="bodyBold">{myFlake ? 'This one is on your record.' : `This is on ${name}'s record, not yours.`}</T>
            <T c={color.textDim}>{myFlake ? `Your score is now ${trustOf(me).score}. Keeping the next few brings it back.` : 'You showed up for it. Your score did not move.'}</T>
          </View>
        )}

        {error ? <T v="caption" c={color.flare}>{error}</T> : null}

        {!flaked && (
          <View style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>{kept ? `${name}, unlocked` : 'What you unlock'}</T>
            <LockedReveal person={other} reveal={reveal} hint={`Opens when you and ${name} have both checked in.`} />
          </View>
        )}

        {locked && !iAmIn && (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            <Button kind="quiet" label="Can't make it" onPress={() => setSheet(true)} />
            {backend.kind === 'mock' && phase === 'early' && (
              <Button kind="ghost" icon="fast-forward" label="Prototype: move this to 3 minutes from now" onPress={() => run(() => bringForward(invite.id), haptic.tick)} />
            )}
          </View>
        )}
      </Animated.View>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        eyebrow="Breaking a promise"
        title={`Bail on ${name}?`}
        body={`You locked this. Bailing tells ${name} now, which beats not showing, but it still counts as a flake. Your trust score goes from ${trustOf(me).score} to ${me.trustScore === undefined ? trustScore(me.kept, me.flaked + 1) : 'lower'}.`}
      >
        <HoldButton tone="flare" label="Hold to bail" busy={busy} onComplete={() => run(() => bail(invite.id), () => setSheet(false))} />
        <Button kind="ghost" label="I'll be there" onPress={() => setSheet(false)} />
      </Sheet>
    </Screen>
  );
}

function Meta({ icon, text }: { icon: keyof typeof Feather.glyphMap; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
      <Feather name={icon} size={14} color={color.textDim} style={{ marginTop: 2 }} />
      <T v="caption" c={color.textDim} style={{ flex: 1 }}>{text}</T>
    </View>
  );
}

function Check({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 6, width: 96 }} accessible accessibilityLabel={`${label}: ${done ? 'checked in' : 'not checked in yet'}`}>
      <View style={[styles.dot, done && { backgroundColor: color.volt, borderColor: color.volt }]}>
        <Feather name={done ? 'check' : 'clock'} size={18} color={done ? color.bg : color.textMute} />
      </View>
      <T v="label" c={done ? color.volt : color.textDim} numberOfLines={1}>{label}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md },
  note: { borderLeftWidth: 3, borderLeftColor: color.pink, paddingLeft: space.md },
  who: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.md },
  checks: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  link: { flex: 1, height: 2, backgroundColor: color.line, marginTop: 21, maxWidth: 120 },
  dot: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  banner: { borderWidth: 1, borderRadius: radius.card, padding: space.lg, gap: 4 },
});
