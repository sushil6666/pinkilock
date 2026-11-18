/**
 * Join a friend's duo (docs/build-plan.md F3). Opened from the link they shared; it needs a
 * profile, so a friend who has none goes through onboarding first and comes back here. A duo is
 * how two friends ask two others out on a double: each person is in one duo at a time.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { usePerson, useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';

export default function JoinDuo() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const duo = usePerson(useStore((s) => s.duoId) ?? undefined);
  const joinDuo = useStore((s) => s.joinDuo);
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    backend.duoLinkName(String(token)).then(setName, (e) => { setName(null); setError(shown(e, '/duo/[token]')); });
  }, [token]);

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      await joinDuo(String(token));
      setDone(true);
    } catch (e) {
      setError(shown(e, '/duo/[token]'));
    }
    setBusy(false);
  };

  if (name === undefined) return <Screen back="close" scroll={false}><View /></Screen>;
  if (done) {
    return (
      <Screen back="close">
        <View style={{ gap: space.lg }}>
          <T v="display">{`You and${'\n'}${name}.`}</T>
          <T c={color.textDim}>You are a duo now. Either of you can ask someone with a duo out on a double, and you both come.</T>
          <Button icon="compass" label="Find a double" onPress={() => router.replace('/(tabs)')} />
        </View>
      </Screen>
    );
  }
  if (name === null) {
    return (
      <Screen back="close">
        <View style={{ gap: space.lg }}>
          <T v="display">Link{'\n'}expired.</T>
          <ErrorText text={error || 'This duo link cannot be joined. Ask your friend for a new one.'} tone={color.textDim} />
          <Button kind="ghost" label="Back to Discover" onPress={() => router.replace('/(tabs)')} />
        </View>
      </Screen>
    );
  }
  return (
    <Screen back="close" footer={<><ErrorText text={error} /><Button icon="users" label={`Join ${name}'s duo`} onPress={join} disabled={!!duo} busy={busy} /></>}>
      <View style={{ gap: space.xl }}>
        <T v="display">{`${name} wants${'\n'}you as a duo.`}</T>
        <T c={color.textDim}>
          {duo
            ? `You are already in a duo with ${duo.name}. Leave it in Me first.`
            : `As a duo, you and ${name} can ask two other friends out on a double: four people, one plan, and everyone keeps their own promise.`}
        </T>
        <T v="caption" c={color.textDim}>Only the two of you see who your duo is. Other people see that you have one.</T>
      </View>
    </Screen>
  );
}
