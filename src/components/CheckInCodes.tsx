/**
 * Check-in by swapping codes (docs/build-plan.md, WP4). My code is big, to show across a table or
 * read out on a call; their code goes in the box. Only two people who are together can swap them,
 * which is what makes a kept promise mean "we met".
 */
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space, type } from '../theme/tokens';
import { Button } from './ui/Button';
import { ErrorText } from './ui/ErrorText';
import { inputStyle } from './ui/input';
import { T } from './ui/T';

interface Props {
  inviteId: string;
  name: string;
  remote: boolean;
  /** I am checked in: my code stays up for them, the box goes. */
  done: boolean;
  onCheckIn: (theirCode: string) => Promise<void>;
}

export function CheckInCodes({ inviteId, name, remote, done, onCheckIn }: Props) {
  const [mine, setMine] = useState<string | null>(null);
  const [theirs, setTheirs] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    backend.myCheckInCode(inviteId).then((c) => alive && setMine(c), (e) => alive && setError(shown(e, '/plan/[id]')));
    return () => {
      alive = false;
    };
  }, [inviteId]);

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await onCheckIn(theirs);
    } catch (e) {
      setError(shown(e, '/plan/[id]'));
      setTheirs('');
    }
    setBusy(false);
  };

  const demo = backend.demoTheirCode?.(inviteId);

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.mine} accessible accessibilityLabel={mine ? `Your check-in code: ${mine.split('').join(' ')}` : 'Your check-in code is loading'}>
        <T v="label" c={color.textDim}>Your code</T>
        <T v="mega" c={color.volt} selectable>{mine ?? '····'}</T>
        <T v="caption" c={color.textDim}>{remote ? `Read it out to ${name} on the call.` : `Show it to ${name}.`}</T>
      </View>
      {done ? <T c={color.textDim}>{`You are in. Keep your code up until ${name} has entered it.`}</T> : (<>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.textDim}>{`${name}'s code`}</T>
        <TextInput
          value={theirs}
          onChangeText={(t) => setTheirs(t.replace(/[^0-9]/g, '').slice(0, 4))}
          placeholder="····"
          placeholderTextColor={color.textMute}
          keyboardType="number-pad"
          maxLength={4}
          style={[inputStyle, type.title, { letterSpacing: 8 }]}
          accessibilityLabel={`${name}'s check-in code`}
        />
        {demo ? <T v="caption" c={color.textMute}>Prototype: {name} reads out {demo}.</T> : null}
      </View>
      <ErrorText text={error} />
      <Button icon="check" label="Check in" onPress={submit} disabled={theirs.length !== 4} busy={busy} />
      <T v="caption" c={color.textDim}>Codes only work between two people who are together. Nobody can check in for you.</T>
      </>)}
    </View>
  );
}

const styles = StyleSheet.create({
  mine: { gap: 2, borderWidth: 1, borderColor: color.volt, borderRadius: radius.card, backgroundColor: color.voltWash, padding: space.lg, alignItems: 'flex-start' },
});
