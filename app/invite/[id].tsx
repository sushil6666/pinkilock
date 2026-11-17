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
import { lockRole, otherId } from '@/domain/invites';
import { shortCountdown } from '@/domain/time';
import { useNow } from '@/lib/useNow';
import { useInvite, usePerson, useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';

export default function InviteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meId = useStore((s) => s.me?.id ?? '');
  const invite = useInvite(id);
  const other = usePerson(invite ? otherId(invite, meId) : undefined);
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
          <T c={color.textDim}>This ask does not exist any more.</T>
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
      setError(e instanceof Error ? e.message : 'That did not go through.');
    }
    setSheet(false);
    setBusy(false);
  };

  let head: [string, string];
  let footer: ReactNode;
  if (role === 'first') {
    head = [`${name} wants to lock this in.`, `You go first: slide your pinky in, then ${name} seals it. Until both are in, nothing is promised.`];
    footer = <><Button icon="lock" label="Lock it" onPress={toLock} /><Button kind="ghost" label="Pass" onPress={() => setSheet(true)} /></>;
  } else if (role === 'seal') {
    head = [`${name}'s pinky is out.`, 'They said yes with the gesture. Seal it with yours and it is a promise.'];
    footer = <><Button icon="lock" label="Seal it" onPress={toLock} /><Button kind="ghost" label="Take it back" onPress={() => setSheet(true)} /></>;
  } else if (invite.status === 'sent') {
    head = [`Waiting on ${name}.`, `Your ask is out. It expires in ${shortCountdown(invite.expiresAt, now)} if they do not answer.`];
    footer = <Button kind="ghost" label="Take it back" onPress={() => setSheet(true)} />;
  } else if (myPinkyOut) {
    head = ['Your pinky is out.', `${name} still has to seal it. You will see it lock the moment they do.`];
    footer = <><Button icon="eye" label="Watch the lock" onPress={toLock} /><Button kind="ghost" label="Pull it back" onPress={() => setSheet(true)} /></>;
  } else if (invite.status === 'locked' || invite.status === 'kept' || invite.status === 'flaked') {
    head = ['This one is locked.', 'It lives in your plans now.'];
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
    head = ['This ask ran out.', `Nobody answered in time. ${iSent ? 'Your ask slot is free again.' : 'Nothing goes on your record.'}`];
    footer = toDiscover;
  }

  return (
    <Screen back="back" title="Vibe check" footer={footer}>
      <Animated.View entering={FadeInDown.duration(360)} style={{ gap: space.xl }}>
        <InviteCard invite={invite} meId={meId} other={other} now={now} onPress={other ? () => router.push(`/profile/${other.id}`) : undefined} />
        <View style={{ gap: space.sm }}>
          <T v="title">{head[0]}</T>
          <T c={color.textDim}>{head[1]}</T>
          {error ? <T v="caption" c={color.flare}>{error}</T> : null}
        </View>
      </Animated.View>

      <Sheet
        visible={sheet}
        onClose={() => setSheet(false)}
        eyebrow={iSent ? 'Take it back' : 'Pass'}
        title={iSent ? 'Withdraw this ask?' : `Pass on ${name}?`}
        body={iSent
          ? `${name} will see that you took it back. Nothing was promised, so no record changes.`
          : `${name} will be told you passed. Nothing was promised, so nobody's score changes. A clear no beats a slow fade.`}
      >
        <Button kind="danger" label={iSent ? 'Yes, take it back' : 'Yes, pass'} onPress={pass} busy={busy} />
        <Button kind="ghost" label="Keep it open" onPress={() => setSheet(false)} />
      </Sheet>
    </Screen>
  );
}
