/**
 * The lock screen. It hosts the gesture, tells the backend when my pinky is in, and shows the
 * promise the moment the backend says both are. The motion itself is in components/PinkyLock.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Countdown } from '@/components/Countdown';
import { PinkyLock, type LockPhase } from '@/components/PinkyLock';
import { Button } from '@/components/ui/Button';
import { Screen, goBack } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { ideaOf } from '@/domain/ideas';
import { lockRole, otherId } from '@/domain/invites';
import { whenLabel } from '@/domain/time';
import { haptic } from '@/lib/haptics';
import { useNow } from '@/lib/useNow';
import { useInvite, usePerson, useStore } from '@/state/store';
import { color, gutter, motion, radius, space } from '@/theme/tokens';
import { shown } from '@/lib/report';
import { splitRef } from '@/domain/errors';

export default function LockScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const meId = useStore((s) => s.me?.id ?? '');
  const invite = useInvite(id);
  const other = usePerson(invite ? otherId(invite, meId) : undefined);
  const offerPinky = useStore((s) => s.offerPinky);
  const now = useNow();

  // What this screen was opened to do. Fixed on entry: the invite changes under us as we lock it.
  const entry = useRef(invite ? { role: lockRole(invite, meId), mineOut: invite.status === 'half_locked' && invite.firstPinkyBy === meId } : null).current;
  const [phase, setPhase] = useState<LockPhase>(entry?.mineOut ? 'committed' : 'idle');
  const [missed, setMissed] = useState(false);
  const [error, setError] = useState('');
  const [resetKey, setResetKey] = useState(0);
  const [commitKey, setCommitKey] = useState(0);

  // Android back must not leave a promise half drawn.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => phase === 'sealing');
    return () => sub.remove();
  }, [phase]);

  const commit = useCallback(async () => {
    if (!invite) return;
    setError('');
    setMissed(false);
    try {
      await offerPinky(invite.id);
    } catch (e) {
      haptic.warning();
      setError(shown(e, '/lock/[id]'));
      setResetKey((k) => k + 1);
    }
  }, [invite, offerPinky]);

  const usable = entry && (entry.role === 'first' || entry.role === 'seal' || entry.mineOut);
  if (!invite || !other || !usable) {
    return (
      <Screen back="close" scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
          <T v="display">Nothing{'\n'}to lock.</T>
          <T c={color.textDim}>This ask is not waiting on your pinky right now.</T>
          <Button kind="ghost" label="Back" onPress={goBack} />
        </View>
      </Screen>
    );
  }

  const idea = ideaOf(invite.ideaId);
  const name = other.name;
  const mode = entry.role === 'seal' ? 'seal' : 'first';
  const locked = invite.status === 'locked';
  const closed = invite.status === 'declined' || invite.status === 'expired' || invite.status === 'ended';
  const sealed = phase === 'sealed';

  const errorRef = error ? splitRef(error).ref : null;
  const prompt =
    closed ? `${name.toUpperCase()} PULLED OUT` :
    error ? 'THAT DID NOT LAND' :
    phase === 'idle' ? (missed ? 'ALMOST. ALL THE WAY IN.' : 'SLIDE YOUR PINKY IN') :
    phase === 'committed' ? (locked ? 'HOLD ON' : `PINKY OUT. WAITING ON ${name.toUpperCase()}`) :
    phase === 'sealing' ? 'HOLD ON' : '';

  return (
    <Screen back={phase === 'sealing' || sealed ? false : 'close'} scroll={false} title={sealed ? undefined : 'The Pinkilock'}>
      <View style={styles.top}>
        {sealed ? (
          <Animated.View entering={FadeInDown.springify().damping(motion.spring.snappy.damping).stiffness(motion.spring.snappy.stiffness)} accessibilityLiveRegion="assertive">
            <T v="mega" c={color.pink}>Locked.</T>
          </Animated.View>
        ) : (
          <>
            <T v="label" c={color.textDim}>{mode === 'seal' ? `${name}'s pinky is out` : `You first, then ${name}`}</T>
            <T v="display" numberOfLines={2} adjustsFontSizeToFit>{idea.emoji} {idea.title}</T>
          </>
        )}
        <T c={color.textDim}>with {name}  /  {whenLabel(invite.startsAt, now)}</T>
      </View>

      <View style={{ marginHorizontal: -gutter }}>
        <PinkyLock
          mode={mode}
          startCommitted={entry.mineOut}
          locked={locked}
          resetKey={resetKey}
          commitKey={commitKey}
          onCommit={commit}
          onPhase={setPhase}
          onMiss={() => setMissed(true)}
        />
      </View>

      {sealed ? (
        <Animated.View entering={FadeIn.delay(160).duration(motion.base)} style={styles.bottom}>
          <View style={styles.promise}>
            <T v="label" c={color.pink}>The anti-ghosting promise</T>
            <T>You and {name} both show up, or say so early. A flake goes on the record of whoever flaked.</T>
            <View style={{ marginTop: space.sm }}><Countdown target={invite.startsAt} now={now} /></View>
          </View>
          <Button icon="lock" label="See the plan" onPress={() => router.replace(`/plan/${invite.id}`)} />
          <Button kind="quiet" label="Done" onPress={goBack} />
        </Animated.View>
      ) : (
        <View style={styles.bottom}>
          <T v="heading" center c={error || closed ? color.flare : color.text} accessibilityLiveRegion="polite">{prompt}</T>
          {errorRef ? <T v="caption" center c={color.textMute} selectable accessibilityLabel={`Error reference ${errorRef}`}>{errorRef}</T> : null}
          <T v="caption" center c={color.textDim}>
            {closed ? 'Nothing was promised, so nothing goes on anyone\'s record.'
              : error ? error
              : phase === 'idle' ? 'Locking means: I show up on time, or I bail early and own it.'
              : mode === 'first' && !locked ? `Yours is in. It locks the moment ${name} hooks on. You can leave; it will still lock.`
              : 'Both pinkies are in.'}
          </T>
          {closed ? <Button kind="ghost" label="Back" onPress={goBack} />
            : phase === 'idle' ? <Button kind="quiet" label="Lock without sliding" onPress={() => setCommitKey((k) => k + 1)} />
            : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { gap: space.sm, minHeight: 132, justifyContent: 'flex-end', paddingBottom: space.md },
  bottom: { flex: 1, gap: space.md, paddingTop: space.lg },
  promise: { borderWidth: 1, borderColor: color.pink, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.sm },
});
