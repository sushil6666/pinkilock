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
import { AddToCalendar } from '@/components/AddToCalendar';
import { LockedReveal } from '@/components/LockedReveal';
import { SpicyHandoff } from '@/components/Spicy';
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
import { shortCountdown, timeLabel, whenLabel, zoneNote } from '@/domain/time';
import { zoneOfCity } from '@/domain/countries';
import { trustOf, trustScore } from '@/domain/trust';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/useNow';
import { useReveal } from '@/lib/useReveal';
import { backend } from '@/services';
import { useInvite, usePerson, useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';
import { t } from '@/i18n';

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
          <T v="display">{t('plan.goneTitle')}</T>
          <T c={color.textDim}>{t('plan.goneBody')}</T>
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
  // A handle that did not work can be flagged for a week after the plan was kept (D077).
  const flaggable = kept && (invite.resolvedAt ?? 0) > now - 7 * 24 * 3600_000;
  const flaked = invite.status === 'flaked';
  const double = isDouble(invite);
  // On a double that was kept without me, I am the one who missed it.
  const myFlake = (flaked && (invite.flakedBy === me.id || (double && !invite.flakedBy && !iAmIn))) || (kept && double && !iAmIn);
  // Another clock, named, when it reads differently from mine: theirs on a call, the place's on a date in person.
  const zoneLine = idea.kind === 'irl'
    ? zoneNote(invite.startsAt, zoneOfCity(me.city), { city: me.city })
    : zoneNote(invite.startsAt, zoneOfCity(other.city), { name });
  const both = double ? t('checkIn.both', { a: name, b: theirFriend?.name ?? t('ticket.theirDuo') }) : name;

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
  if (!locked) footer = <Button kind="ghost" icon="user" label={t('plan.profileOf', { name })} onPress={() => router.push(`/profile/${other.id}`)} />;

  return (
    <Screen back="back" title={t(kept && !myFlake ? 'status.kept' : flaked || myFlake ? 'plan.broken' : 'plan.lockedPlan')} footer={footer}>
      <Animated.View entering={FadeInDown.duration(360)}>
        <Columns gap={space.xl} left={<>
        <View style={{ gap: space.sm }}>
          <T v="label" c={kept && !myFlake ? color.gold : flaked || myFlake ? color.flare : color.pink}>
            {myFlake ? t(kept || !invite.flakedBy ? 'status.youMissed' : 'status.youFlaked')
              : kept ? t(double ? 'plan.bothSides' : 'plan.bothShowed')
              : flaked ? (double ? (invite.flakedBy ? t('status.theyFlaked', { name: flaker?.name ?? t('common.someone') }) : t('plan.notEnough')) : t('status.theyFlaked', { name }))
              : t(now >= invite.startsAt ? 'plan.now' : 'plan.startsIn')}
          </T>
          {locked && <Countdown target={invite.startsAt} now={now} tone={phase === 'open' ? color.gold : color.text} />}
          {kept && !myFlake && <T v="mega" c={color.gold}>{t('plan.keptBig')}</T>}
          {(flaked || myFlake) && <T v="mega" c={color.flare}>{t(myFlake ? 'plan.missedBig' : 'plan.stoodUpBig')}</T>}
        </View>

        <View style={styles.card}>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
            <T style={{ fontSize: 40, lineHeight: 50 }} maxFontSizeMultiplier={1}>{idea.emoji}</T>
            <View style={{ flex: 1, gap: 4 }}>
              <T v="title">{idea.title}</T>
              <Meta icon="clock" text={t('plan.whenFor', { when: whenLabel(invite.startsAt, now), minutes: invite.minutes })} />
              {zoneLine ? <Meta icon="globe" text={zoneLine} /> : null}
              <Meta icon={idea.kind === 'irl' ? 'map-pin' : 'smartphone'} text={invite.place} />
            </View>
          </View>
          {invite.note ? <T style={styles.note}>{t('common.quoted', { text: invite.note })}</T> : null}
          {double ? null : <Pressable accessibilityRole="button" accessibilityLabel={t('plan.openProfile', { name })} onPress={() => router.push(`/profile/${other.id}`)} style={styles.who}>
            <Portrait name={name} palette={other.palette} glyph={other.glyph} faceUrl={other.faceUrl} size={44} />
            <View style={{ flex: 1 }}>
              <T v="bodyBold">{t('plan.withName', { name })}</T>
              <T v="caption" c={color.textDim}>{t('common.ageArea', { age: other.age, area: other.area })}</T>
            </View>
            <TrustBadge person={other} brief />
          </Pressable>}
        </View>
        {double ? <DoubleParty invite={invite} meId={me.id} show={locked ? 'checkins' : 'none'} /> : null}
        </>} right={<>

        {locked && (
          <View style={{ gap: space.md }}>
            <T v="label" c={color.textDim}>{t('plan.checkIn')}</T>
            {double ? null : (
              <View style={styles.checks}>
                <Check label={t('common.you')} done={iAmIn} />
                <View style={styles.link} />
                <Check label={name} done={theyAreIn} />
              </View>
            )}
            <T c={color.textDim}>
              {phase === 'early' ? t(double ? 'plan.opensAtDouble' : 'plan.opensAt', { time: timeLabel(invite.startsAt - CHECK_IN_OPENS_BEFORE) })
                : iAmIn ? t('plan.waitingFor', { who: double ? t('plan.theOthers') : name })
                : t('plan.openFor', { left: shortCountdown(invite.startsAt + CHECK_IN_CLOSES_AFTER, now) })}
            </T>
            {phase === 'open' && !(iAmIn && theyAreIn && (!double || invite.checkIns.length === 4)) && (
              <CheckInCodes inviteId={invite.id} name={name} theirNames={double ? [name, theirFriend?.name ?? t('ticket.theirDuo')] : undefined} remote={idea.kind !== 'irl'} done={iAmIn}
                onCheckIn={async (code) => { await checkIn(invite.id, code); haptic.success(); }} />
            )}
            {idea.kind === 'irl' && <Meta icon="shield" text={t('plan.meetPublic')} />}
          </View>
        )}

        {locked && (
          <View style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>{t('plan.iceTitle')}</T>
            <T v="heading">{openerOf(idea.id)}</T>
            <T v="caption" c={color.textDim}>{t('plan.iceBody')}</T>
          </View>
        )}

        {locked && (
          <View style={{ gap: space.sm }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <T v="label" c={color.pink}>{t('plan.dareTitle')}</T>
              <Tag label={t('plan.another')} tone={color.textDim} onPress={() => setDare((n) => n + 1)} />
            </View>
            <T v="heading">{dares[dare % dares.length]}</T>
            <T v="caption" c={color.textDim}>{t('plan.dareBody')}</T>
          </View>
        )}

        {(flaked || myFlake) && (
          <View style={[styles.banner, { borderColor: color.flare, backgroundColor: color.flareWash }]}>
            <T v="bodyBold">{myFlake ? t('plan.onYourRecord') : double ? t('plan.onTheirsDouble') : t('plan.onTheirs', { name })}</T>
            <T c={color.textDim}>{myFlake ? t('plan.scoreNow', { score: trustOf(me).score }) : t('plan.scoreSame')}</T>
          </View>
        )}

        {error ? <ErrorText text={error} /> : null}

        {kept && !myFlake && <DateFeedback inviteId={invite.id} otherId={other.id} name={both} double={double} />}
        {locked && <AddToCalendar invite={invite} idea={idea.title} who={both} />}
        {locked && <ShareMyDate invite={invite} other={other} idea={idea.title} />}

        {!flaked && !double && (
          <View style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>{kept ? t('plan.unlocked', { name }) : t('plan.whatUnlocks')}</T>
            <LockedReveal person={other} reveal={reveal} hint={t('plan.revealHint', { name })} onFlag={flaggable ? () => backend.reportBadContact(invite.id, other.id) : undefined} />
          </View>
        )}
        {!flaked && !myFlake && !double && <SpicyHandoff otherId={other.id} name={name} route="/plan/[id]" />}
        {!flaked && double && [other, theirFriend].map((p, k) => p ? (
          <View key={p.id} style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>{kept && showable(p.id) ? t('plan.unlocked', { name: p.name }) : t('plan.whatUnlocksFrom', { name: p.name })}</T>
            <LockedReveal person={p} reveal={k === 0 ? reveal : friendReveal} onFlag={flaggable ? () => backend.reportBadContact(invite.id, p.id) : undefined}
              hint={kept ? t('plan.staysLocked') : t('plan.revealHintDouble', { name: p.name })} />
          </View>
        ) : null)}

        {locked && !iAmIn && (
          <View style={{ gap: space.sm, marginTop: space.md }}>
            <Button kind="quiet" label={t('plan.cantMake')} onPress={() => setSheet(true)} />
            {backend.kind === 'mock' && phase === 'early' && (
              <Button kind="ghost" icon="fast-forward" label={t('plan.demoSoon')} onPress={() => run(() => bringForward(invite.id), haptic.tick)} />
            )}
          </View>
        )}
        </>} />
      </Animated.View>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        eyebrow={t('plan.bailEyebrow')}
        title={double ? t('plan.bailDouble') : t('plan.bailOn', { name })}
        body={t('plan.bailBody', { who: double ? t('plan.otherThree') : name, from: trustOf(me).score, to: me.trustScore === undefined ? trustScore(me.kept, me.flaked + 1) : t('plan.lower') })}
      >
        <HoldButton tone="flare" label={t('plan.holdBail')} busy={busy} onComplete={() => run(() => bail(invite.id), () => setSheet(false))} />
        <Button kind="ghost" label={t('plan.illBeThere')} onPress={() => setSheet(false)} />
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
    <View style={{ alignItems: 'center', gap: 6, width: 96 }} accessible accessibilityLabel={t('party.personSpoken', { name: label, said: t(done ? 'party.checkedIn' : 'party.notCheckedInSpoken') })}>
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
