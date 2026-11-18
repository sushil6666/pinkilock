/** One vibe check. What you can do here depends on whose move it is (domain/invites lockRole). */
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { InviteCard } from '@/components/InviteCard';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { friendOn, isDouble, lockRole, otherId } from '@/domain/invites';
import { DoubleParty } from '@/components/DoubleParty';
import { shortCountdown } from '@/domain/time';
import { useNow } from '@/lib/useNow';
import { useInvite, usePerson, useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';
import { t } from '@/i18n';

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meId = useStore((s) => s.me?.id ?? '');
  const invite = useInvite(id);
  const other = usePerson(invite ? otherId(invite, meId) : undefined);
  const theirFriend = usePerson(invite ? friendOn(invite, otherId(invite, meId)) ?? undefined : undefined);
  const asker = usePerson(invite?.fromId);
  const decliner = usePerson(invite?.declinedBy ?? undefined);
  const decline = useStore((s) => s.declineInvite);
  const now = useNow();
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!invite) {
    return (
      <Screen desk="form" back="back" scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
          <T v="display">{t('ask.goneTitle')}</T>
          <T c={color.textDim}>{t('ask.goneBody')}</T>
        </View>
      </Screen>
    );
  }

  const name = other?.name ?? t('ask.they');
  const role = lockRole(invite, meId);
  const iSent = invite.fromId === meId;
  const myPinkyOut = invite.status === 'half_locked' && invite.firstPinkyBy === meId;
  // Replace, so the plan that follows a lock does not sit on top of this now-stale ask.
  const toLock = () => router.replace(`/lock/${invite.id}`);
  const toDiscover = <Button kind="ghost" icon="compass" label={t('ask.backToDiscover')} onPress={() => router.replace('/(tabs)')} />;

  const pass = async () => {
    setBusy(true);
    setError('');
    try {
      await decline(invite.id);
    } catch (e) {
      setError(shown(e, '/invite/[id]'));
    }
    setSheet(false);
    setBusy(false);
  };

  const double = isDouble(invite);
  const out = invite.pinkies?.length ?? 0;
  const theirs = t('checkIn.both', { a: name, b: theirFriend?.name ?? t('ticket.theirDuo') });
  const askerName = asker?.name ?? t('ask.theAsker');

  let head: [string, string];
  let footer: ReactNode;
  if (double && role === 'first') {
    head = [t('ask.doubleWith', { who: theirs }), iSent ? t('ask.doubleFirstYouSeal') : t('ask.doubleFirstTheySeal', { name: askerName })];
    footer = <><Button icon="lock" label={t('ask.pinkyOut')} onPress={toLock} /><Button kind="ghost" label={t('ask.pass')} onPress={() => setSheet(true)} /></>;
  } else if (double && role === 'seal') {
    head = [t('ask.allThreeOut'), t('ask.sealDouble')];
    footer = <><Button icon="lock" label={t('ask.sealIt')} onPress={toLock} /><Button kind="ghost" label={t('ask.takeBack')} onPress={() => setSheet(true)} /></>;
  } else if (double && (invite.status === 'sent' || invite.status === 'half_locked')) {
    head = iSent
      ? [t('ask.waitingOthers'), t('ask.outOfThree', { out, left: shortCountdown(invite.expiresAt, now) })]
      : [t('ask.yourPinkyOut'), t('ask.locksWhenSealed', { name: askerName })];
    footer = <Button kind="ghost" label={t(iSent ? 'ask.takeBack' : 'ask.pullBack')} onPress={() => setSheet(true)} />;
  } else if (double && invite.status === 'declined' && invite.declinedBy !== meId) {
    head = [t('ask.namePassed', { name: decliner?.name ?? t('common.someone') }), t('ask.doubleOffBody')];
    footer = toDiscover;
  } else if (role === 'first') {
    head = [t('ask.wantsToLock', { name }), t('ask.youGoFirst', { name })];
    footer = <><Button icon="lock" label={t('ask.lockIt')} onPress={toLock} /><Button kind="ghost" label={t('ask.pass')} onPress={() => setSheet(true)} /></>;
  } else if (role === 'seal') {
    head = [t('ask.theirPinkyOut', { name }), t('ask.theySaidYes')];
    footer = <><Button icon="lock" label={t('ask.sealIt')} onPress={toLock} /><Button kind="ghost" label={t('ask.takeBack')} onPress={() => setSheet(true)} /></>;
  } else if (invite.status === 'sent') {
    head = [t('ask.waitingOn', { name }), t('ask.sent', { left: shortCountdown(invite.expiresAt, now) })];
    footer = <Button kind="ghost" label={t('ask.takeBack')} onPress={() => setSheet(true)} />;
  } else if (myPinkyOut) {
    head = [t('ask.yourPinkyOut'), t('ask.stillToSeal', { name })];
    footer = <><Button icon="eye" label={t('ask.watchLock')} onPress={toLock} /><Button kind="ghost" label={t('ask.pullBack')} onPress={() => setSheet(true)} /></>;
  } else if (invite.status === 'locked' || invite.status === 'kept' || invite.status === 'flaked') {
    head = [t('ask.isLocked'), t('ask.inPlans')];
    footer = <Button icon="lock" label={t('ask.openPlan')} onPress={() => router.replace(`/plan/${invite.id}`)} />;
  } else if (invite.status === 'declined') {
    head = invite.declinedBy === meId
      ? [t('ask.youClosed'), t('ask.noPromise')]
      : [t('ask.namePassed', { name }), t('ask.noPromiseSlot')];
    footer = toDiscover;
  } else if (invite.status === 'ended') {
    head = [t('ask.ended'), t('ask.endedBody')];
    footer = toDiscover;
  } else {
    head = [t('ask.ranOut'), t(iSent ? 'ask.ranOutMine' : 'ask.ranOutTheirs')];
    footer = toDiscover;
  }

  return (
    <Screen desk="form" back="back" title={t('ask.title')} footer={footer}>
      <Animated.View entering={FadeInDown.duration(360)} style={{ gap: space.xl }}>
        <InviteCard invite={invite} meId={meId} other={other} now={now} onPress={other ? () => router.push(`/profile/${other.id}`) : undefined} />
        {double ? <DoubleParty invite={invite} meId={meId} show={invite.status === 'sent' || invite.status === 'half_locked' ? 'pinkies' : 'none'} /> : null}
        <View style={{ gap: space.sm }}>
          <T v="title">{head[0]}</T>
          <T c={color.textDim}>{head[1]}</T>
          {error ? <ErrorText text={error} /> : null}
        </View>
      </Animated.View>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        eyebrow={t(iSent ? 'ask.takeBack' : 'ask.pass')}
        title={double ? t('ask.callOffDouble') : iSent ? t('ask.withdraw') : t('ask.passOn', { name })}
        body={double ? t('ask.callOffBody') : t(iSent ? 'ask.withdrawBody' : 'ask.passBody', { name })}
      >
        <Button kind="danger" label={t(iSent ? 'ask.yesTakeBack' : 'ask.yesPass')} onPress={pass} busy={busy} />
        <Button kind="ghost" label={t('ask.keepOpen')} onPress={() => setSheet(false)} />
      </Sheet>
    </Screen>
  );
}
