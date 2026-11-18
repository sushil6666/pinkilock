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
      <Screen back="back" scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
          <T v="display">Gone.</T>
          <T c={color.textDim}>This ask is no longer available.</T>
        </View>
      </Screen>
    );
  }

  const name = other?.name ?? 'They';
  const role = lockRole(invite, meId);
  const iSent = invite.fromId === meId;
  const myPinkyOut = invite.status === 'half_locked' && invite.firstPinkyBy === meId;
  // Replace, so the plan that follows a lock does not sit on top of this now-stale ask.
  const toLock = () => router.replace(`/lock/${invite.id}`);
  const toDiscover = <Button kind="ghost" icon="compass" label="Back to Discover" onPress={() => router.replace('/(tabs)')} />;

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
  const theirs = `${name} and ${theirFriend?.name ?? 'their duo'}`;

  let head: [string, string];
  let footer: ReactNode;
  if (double && role === 'first') {
    head = [`A double with ${theirs}.`, `All four put a pinky out, in any order; ${iSent ? 'you seal' : `${asker?.name ?? 'the asker'} seals`} it last. Until all four are in, nothing is promised.`];
    footer = <><Button icon="lock" label="Pinky out" onPress={toLock} /><Button kind="ghost" label="Pass" onPress={() => setSheet(true)} /></>;
  } else if (double && role === 'seal') {
    head = ['All three pinkies are out.', 'Add yours to seal it and make it a promise for all four of you.'];
    footer = <><Button icon="lock" label="Seal it" onPress={toLock} /><Button kind="ghost" label="Take it back" onPress={() => setSheet(true)} /></>;
  } else if (double && (invite.status === 'sent' || invite.status === 'half_locked')) {
    head = iSent
      ? ['Waiting on the others.', `${out} of 3 pinkies are out. It expires in ${shortCountdown(invite.expiresAt, now)} if not everyone answers.`]
      : ['Your pinky is out.', `It locks once everyone is in and ${asker?.name ?? 'the asker'} seals it.`];
    footer = <Button kind="ghost" label={iSent ? 'Take it back' : 'Pull it back'} onPress={() => setSheet(true)} />;
  } else if (double && invite.status === 'declined' && invite.declinedBy !== meId) {
    head = [`${decliner?.name ?? 'Someone'} passed.`, 'The double is off for all four. No promise was made, so nothing goes on anyone\'s record.'];
    footer = toDiscover;
  } else if (role === 'first') {
    head = [`${name} wants to lock this in.`, `You go first: slide your pinky in, then ${name} seals it. Until both are in, nothing is promised.`];
    footer = <><Button icon="lock" label="Lock it" onPress={toLock} /><Button kind="ghost" label="Pass" onPress={() => setSheet(true)} /></>;
  } else if (role === 'seal') {
    head = [`${name}'s pinky is out.`, 'They said yes. Add your pinky to seal it and make it a promise.'];
    footer = <><Button icon="lock" label="Seal it" onPress={toLock} /><Button kind="ghost" label="Take it back" onPress={() => setSheet(true)} /></>;
  } else if (invite.status === 'sent') {
    head = [`Waiting on ${name}.`, `Your ask has been sent. It expires in ${shortCountdown(invite.expiresAt, now)} if they don't reply.`];
    footer = <Button kind="ghost" label="Take it back" onPress={() => setSheet(true)} />;
  } else if (myPinkyOut) {
    head = ['Your pinky is out.', `${name} still has to seal it. You will see it lock the moment they do.`];
    footer = <><Button icon="eye" label="Watch the lock" onPress={toLock} /><Button kind="ghost" label="Pull it back" onPress={() => setSheet(true)} /></>;
  } else if (invite.status === 'locked' || invite.status === 'kept' || invite.status === 'flaked') {
    head = ['This one is locked.', "It's now in your plans."];
    footer = <Button icon="lock" label="Open the plan" onPress={() => router.replace(`/plan/${invite.id}`)} />;
  } else if (invite.status === 'declined') {
    head = invite.declinedBy === meId
      ? ['You closed this one.', 'No promise was made, so nothing goes on anyone\'s record.']
      : [`${name} passed.`, 'No promise was made, so nothing goes on anyone\'s record. Your ask slot is free again.'];
    footer = toDiscover;
  } else if (invite.status === 'ended') {
    head = ['This one ended.', 'It closed without anyone flaking, so nothing goes on anyone\'s record.'];
    footer = toDiscover;
  } else {
    head = ['This ask ran out.', `No one replied in time. ${iSent ? 'Your ask slot is free again.' : 'Nothing goes on your record.'}`];
    footer = toDiscover;
  }

  return (
    <Screen back="back" title="Vibe check" footer={footer}>
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
        eyebrow={iSent ? 'Take it back' : 'Pass'}
        title={double ? 'Call off this double?' : iSent ? 'Withdraw this ask?' : `Pass on ${name}?`}
        body={double
          ? 'It ends for all four of you, and the others will see it is off. Nothing was promised, so nobody\'s score changes.'
          : iSent
          ? `${name} will see that you took it back. Nothing was promised, so no record changes.`
          : `${name} will be told you passed. Nothing was promised, so nobody's score changes. A clear no beats a slow fade.`}
      >
        <Button kind="danger" label={iSent ? 'Yes, take it back' : 'Yes, pass'} onPress={pass} busy={busy} />
        <Button kind="ghost" label="Keep it open" onPress={() => setSheet(false)} />
      </Sheet>
    </Screen>
  );
}
