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

export default function Blocked() {
  const unblock = useStore((s) => s.unblock);
  const [list, setList] = useState<BlockedPerson[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => {
    backend.blockedPeople().then(setList, (e) => setError(e instanceof Error ? e.message : 'Could not load the list.'));
  }, []);
  useEffect(load, [load]);

  const lift = async (id: string) => {
    setBusy(id);
    setError('');
    try {
      await unblock(id);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through.');
    }
    setBusy('');
  };

  return (
    <Screen back="back" title="Blocked">
      <View style={{ gap: space.lg }}>
        <T v="display">Blocked</T>
        <T c={color.textDim}>They cannot see you and you cannot see them. Unblocking brings their card back; plans that ended stay ended.</T>
        {error ? <T v="caption" c={color.flare}>{error}</T> : null}
        {list?.length === 0 ? <T c={color.textMute}>Nobody. Good.</T> : null}
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
