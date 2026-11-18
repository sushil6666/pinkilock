/**
 * After a kept promise (WP7): "Worth showing up?" and "See them again?", once. The answers feed
 * the satisfaction figure (build plan, target B) and round two; the other person never sees them,
 * and they never touch a Trust Score. "I felt unsafe" opens the report screen as well.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

export function DateFeedback({ inviteId, otherId, name }: { inviteId: string; otherId: string; name: string }) {
  const [state, setState] = useState<{ rated: boolean; roundTwo: boolean } | null>(null);
  const [worth, setWorth] = useState<boolean | null>(null);
  const [again, setAgain] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    backend.dateFeedback(inviteId).then((s) => alive && setState(s), (e) => alive && setError(shown(e, '/plan/[id]')));
    return () => {
      alive = false;
    };
  }, [inviteId]);

  const send = async (unsafe: boolean) => {
    setBusy(true);
    setError('');
    try {
      await backend.rateDate(inviteId, { worth: unsafe ? false : !!worth, again: unsafe ? false : !!again, unsafe });
      setState(await backend.dateFeedback(inviteId));
      if (unsafe) router.push(`/report/${otherId}`);
    } catch (e) {
      setError(shown(e, '/plan/[id]'));
    }
    setBusy(false);
  };

  if (!state) return error ? <ErrorText text={error} /> : null;

  if (state.rated) {
    return state.roundTwo ? (
      <View style={{ gap: space.sm, borderWidth: 1, borderColor: color.gold, borderRadius: radius.card, backgroundColor: color.goldWash, padding: space.lg }}>
        <T v="label" c={color.gold}>Round two</T>
        <T v="heading">{`You and ${name} both want to meet again.`}</T>
        <Button icon="repeat" label={`Plan round two with ${name}`} onPress={() => router.push({ pathname: '/invite/new', params: { to: otherId } })} />
      </View>
    ) : (
      <T v="caption" c={color.textDim}>Thanks. Only Pinkilock sees your answers.</T>
    );
  }

  return (
    <View style={{ gap: space.md }}>
      <T v="label" c={color.textDim}>Worth showing up?</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label="Yes" selected={worth === true} onPress={() => setWorth(true)} />
        <Chip label="No" selected={worth === false} onPress={() => setWorth(false)} />
      </View>
      <T v="label" c={color.textDim}>{`See ${name} again?`}</T>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <Chip label="Yes" selected={again === true} onPress={() => setAgain(true)} />
        <Chip label="Not this time" selected={again === false} onPress={() => setAgain(false)} />
      </View>
      <T v="caption" c={color.textDim}>{`${name} never sees this. If you both say yes to meeting again, you both find out.`}</T>
      <ErrorText text={error} />
      <Button label="Send" onPress={() => send(false)} disabled={worth === null || again === null} busy={busy} />
      <Button kind="quiet" label="I felt unsafe" onPress={() => send(true)} />
    </View>
  );
}
