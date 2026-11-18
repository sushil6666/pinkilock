/** People I blocked, with a way back. Who blocked me is never shown, or known to the app. */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import type { BlockedPerson } from '@/domain/types';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';

export default function Blocked() {
  const unblock = useStore((s) => s.unblock);
  const [list, setList] = useState<BlockedPerson[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    backend.blockedPeople().then(setList, (e) => setError(shown(e, '/account/blocked')));
  }, []);
  useEffect(load, [load]);

  const lift = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      await unblock(id);
      load();
    } catch (e) {
      setError(shown(e, '/account/blocked'));
    }
    setBusy('');
  };

  return (
    <Screen back="back" title="Blocked">
      <View style={{ gap: space.lg }}>
        <T v="display">Blocked</T>
        <T c={color.textDim}>They cannot see you and you cannot see them. Unblocking brings their card back; plans that ended stay ended.</T>
        {error ? <ErrorText text={error} /> : null}
        {list?.length === 0 ? <T c={color.textMute}>You haven't blocked anyone.</T> : null}
        {list?.map((p) => (
          <View key={p.profileId} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md }}>
            <View style={{ flex: 1 }}>
              <T v="bodyBold">{p.name}</T>
              <T v="caption" c={color.textDim}>Blocked {new Date(p.blockedAt).toLocaleDateString()}</T>
            </View>
            <Button kind="ghost" label="Unblock" busy={busy === p.profileId} onPress={() => lift(p.profileId)} />
          </View>
        ))}
      </View>
    </Screen>
  );
}
