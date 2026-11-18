/**
 * A locked plan: the countdown, check-in when the window opens, the way out (bail, at a cost),
 * and after you both show, the reveal.
 */
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { CheckInCodes } from '@/components/CheckInCodes';
import { Countdown } from '@/components/Countdown';
import { DateFeedback } from '@/components/DateFeedback';
import { ShareMyDate } from '@/components/ShareMyDate';
import { LockedReveal } from '@/components/LockedReveal';
import { Portrait } from '@/components/Portrait';
import { TrustBadge } from '@/components/TrustBadge';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { HoldButton } from '@/components/ui/HoldButton';
import { Columns } from '@/components/ui/Columns';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { daresFor, ideaOf, openerOf } from '@/domain/ideas';
import { CHECK_IN_CLOSES_AFTER, CHECK_IN_OPENS_BEFORE, canReveal, checkInPhase, friendOn, isDouble, otherId } from '@/domain/invites';
import { DoubleParty } from '@/components/DoubleParty';
import { shortCountdown, timeLabel, whenLabel } from '@/domain/time';
import { trustOf, trustScore } from '@/domain/trust';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/useNow';
import { useReveal } from '@/lib/useReveal';
import { backend } from '@/services';
import { useInvite, usePerson, useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';

export default function PlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useStore((s) => s.me);
  const invite = useInvite(id);
  const other = usePerson(invite && me ? otherId(invite, me.id) : undefined);
  // A double: the other side's second person, and whoever bailed.
  const theirFriend = usePerson(invite && me ? friendOn(invite, otherId(invite, me.id)) ?? undefined : undefined);
  const flaker = usePerson(invite?.flakedBy ?? undefined);
  const checkIn = useStore((s) => s.checkIn);
  const bail = useStore((s) => s.bail);
  const bringForward = useStore((s) => s.demoBringForward);
  const now = useNow();
  // Each reveal is asked for only when the server would give it (on a double: opposite sides, both came).
  const showable = (id: string | undefined) => !!invite && !!me && !!id && canReveal(invite, me.id, id);
  const reveal = useReveal(showable(other?.id) ? invite!.id : undefined, other?.id);
  const friendReveal = useReveal(showable(theirFriend?.id) ? invite!.id : undefined, theirFriend?.id);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dare, setDare] = useState(0);

  if (!invite || !me || !other) {
    return (
      <Screen back="back" scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
          <T v="display">No plan{'\n'}here.</T>
          <T c={color.textDim}>This plan is no longer available.</T>
        </View>
      </Screen>
    );
  }

  const idea = ideaOf(invite.ideaId);
  const dares = daresFor(idea.kind);
  const name = other.name;
  const phase = checkInPhase(invite, now);
  const iAmIn = invite.checkIns.includes(me.id);
  const theyAreIn = invite.checkIns.includes(other.id);
  const locked = invite.status === 'locked';
  const kept = invite.status === 'kept';
  const flaked = invite.status === 'flaked';
  const double = isDouble(invite);
  // On a double that was kept without me, I am the one who missed it.
  const myFlake = (flaked && (invite.flakedBy === me.id || (double && !invite.flakedBy && !iAmIn))) || (kept && double && !iAmIn);
  const both = double ? `${name} and ${theirFriend?.name ?? 'their duo'}` : name;

  const run = async (work: () => Promise<void>, ok: () => void) => {
    setBusy(true);
    setError('');
    try {
      await work();
      ok();
    } catch (e) {
      haptic.warning();
      setError(shown(e, '/plan/[id]'));
    }
    setBusy(false);
  };

  let footer = null;
  if (!locked) footer = <Button kind="ghost" icon="user" label={`${name}'s profile`} onPress={() => router.push(`/profile/${other.id}`)} />;

  return (
    <Screen back="back" title={kept && !myFlake ? 'Promise kept' : flaked || myFlake ? 'Promise broken' : 'Locked plan'} footer={footer}>
      <Animated.View entering={FadeInDown.duration(360)}>
        <Columns gap={space.xl} left={<>
        <View style={{ gap: space.sm }}>
          <T v="label" c={kept && !myFlake ? color.gold : flaked || myFlake ? color.flare : color.pink}>
            {myFlake ? (kept || !invite.flakedBy ? 'You missed it' : 'You flaked')
              : kept ? (double ? 'Both sides showed' : 'You both showed')
              : flaked ? (double ? (invite.flakedBy ? `${flaker?.name ?? 'Someone'} flaked` : 'Not enough people showed') : `${name} flaked`)
              : now >= invite.startsAt ? 'Happening now' : 'Starts in'}
          </T>
          {locked && <Countdown target={invite.startsAt} now={now} tone={phase === 'open' ? color.gold : color.text} />}
          {kept && !myFlake && <T v="mega" c={color.gold}>Kept.</T>}
          {(flaked || myFlake) && <T v="mega" c={color.flare}>{myFlake ? 'Missed.' : 'Stood up.'}</T>}
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
          {double ? null : <Pressable accessibilityRole="button" accessibilityLabel={`Open ${name}'s profile`} onPress={() => router.push(`/profile/${other.id}`)} style={styles.who}>
            <Portrait name={name} palette={other.palette} glyph={other.glyph} size={44} />
            <View style={{ flex: 1 }}>
              <T v="bodyBold">with {name}</T>
              <T v="caption" c={color.textDim}>{other.age}, {other.area}</T>
            </View>
            <TrustBadge person={other} brief />
          </Pressable>}
        </View>
        {double ? <DoubleParty invite={invite} meId={me.id} show={locked ? 'checkins' : 'none'} /> : null}
        </>} right={<>

        {locked && (
          <View style={{ gap: space.md }}>
            <T v="label" c={color.textDim}>Check-in</T>
            {double ? null : (
              <View style={styles.checks}>
                <Check label="You" done={iAmIn} />
                <View style={styles.link} />
                <Check label={name} done={theyAreIn} />
              </View>
            )}
            <T c={color.textDim}>
              {phase === 'early' ? `Check-in opens at ${timeLabel(invite.startsAt - CHECK_IN_OPENS_BEFORE)}, ten minutes before. ${double ? 'Each of you enters a code from someone on the other side.' : 'When you both check in, the promise is kept.'}`
                : iAmIn ? `You're checked in. Waiting for ${double ? 'the others' : name}.`
                : `Check-in is open for another ${shortCountdown(invite.startsAt + CHECK_IN_CLOSES_AFTER, now)}. Missing it counts as a flake.`}
            </T>
            {phase === 'open' && !(iAmIn && theyAreIn && (!double || invite.checkIns.length === 4)) && (
              <CheckInCodes inviteId={invite.id} name={name} theirNames={double ? [name, theirFriend?.name ?? 'their duo'] : undefined} remote={idea.kind !== 'irl'} done={iAmIn}
                onCheckIn={async (code) => { await checkIn(invite.id, code); haptic.success(); }} />
            )}
            {idea.kind === 'irl' && <Meta icon="shield" text="Meet somewhere public and tell a friend where you are." />}
          </View>
        )}

        {locked && (
          <View style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>Break the ice</T>
            <T v="heading">{openerOf(idea.id)}</T>
            <T v="caption" c={color.textDim}>There's no chat before the date, so here's an opener.</T>
          </View>
        )}

        {locked && (
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="label" c={color.pink}>Dare, if you are brave</T>
              <Tag label="Another" tone={color.textDim} onPress={() => setDare((n) => n + 1)} />
            </View>
            <T v="heading">{dares[dare % dares.length]}</T>
            <T v="caption" c={color.textDim}>Optional. Only you see this one, and either of you can say no.</T>
          </View>
        )}

        {(flaked || myFlake) && (
          <View style={[styles.banner, { borderColor: color.flare, backgroundColor: color.flareWash }]}>
            <T v="bodyBold">{myFlake ? 'This one is on your record.' : double ? 'Only the people who did not show take the hit.' : `This is on ${name}'s record, not yours.`}</T>
            <T c={color.textDim}>{myFlake ? `Your score is now ${trustOf(me).score}. Keep your next few promises to bring it back up.` : "You showed up, so your score didn't change."}</T>
          </View>
        )}

        {error ? <ErrorText text={error} /> : null}

        {kept && !myFlake && <DateFeedback inviteId={invite.id} otherId={other.id} name={both} double={double} />}
        {locked && <ShareMyDate invite={invite} other={other} idea={idea.title} />}

        {!flaked && !double && (
          <View style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>{kept ? `${name}, unlocked` : 'What you unlock'}</T>
            <LockedReveal person={other} reveal={reveal} hint={`Opens when you and ${name} have both checked in.`} />
          </View>
        )}
        {!flaked && double && [other, theirFriend].map((p, k) => p ? (
          <View key={p.id} style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>{kept && showable(p.id) ? `${p.name}, unlocked` : `What you unlock: ${p.name}`}</T>
            <LockedReveal person={p} reveal={k === 0 ? reveal : friendReveal}
              hint={kept ? `Stays locked: it opens only between people from each side who both checked in.` : `Opens if you and ${p.name} both check in.`} />
          </View>
        ) : null)}

        {locked && !iAmIn && (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            <Button kind="quiet" label="Can't make it" onPress={() => setSheet(true)} />
            {backend.kind === 'mock' && phase === 'early' && (
              <Button kind="ghost" icon="fast-forward" label="Prototype: move this to 3 minutes from now" onPress={() => run(() => bringForward(invite.id), haptic.tick)} />
            )}
          </View>
        )}
        </>} />
      </Animated.View>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        eyebrow="Breaking a promise"
        title={double ? 'Bail on the double?' : `Bail on ${name}?`}
        body={`You locked this. Bailing tells ${double ? 'the other three' : name} now, which beats not showing, but it still counts as a flake. Your trust score goes from ${trustOf(me).score} to ${me.trustScore === undefined ? trustScore(me.kept, me.flaked + 1) : 'lower'}.`}
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
      <View style={[styles.dot, done && { backgroundColor: color.gold, borderColor: color.gold }]}>
        <Feather name={done ? 'check' : 'clock'} size={18} color={done ? color.bg : color.textMute} />
      </View>
      <T v="label" c={done ? color.gold : color.textDim} numberOfLines={1}>{label}</T>
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
