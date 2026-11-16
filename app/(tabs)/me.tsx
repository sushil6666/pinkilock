/** Me: my card as others see it, my trust score and how it is worked out, and the prototype tools. */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Portrait } from '@/components/Portrait';
import { TrustBadge } from '@/components/TrustBadge';
import { Chip } from '@/components/ui/Chip';
import { HoldButton } from '@/components/ui/HoldButton';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { IDEAS } from '@/domain/ideas';
import { trustScore } from '@/domain/trust';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';

export default function Me() {
  const me = useStore((s) => s.me);
  const contact = useStore((s) => s.myContact);
  const updateMe = useStore((s) => s.updateMe);
  const demoReset = useStore((s) => s.demoReset);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  if (!me) return null;

  const toggleIdea = async (id: string) => {
    const has = me.ideaIds.includes(id);
    if (has && me.ideaIds.length <= 3) return setError('Keep at least three. They are how people ask you out.');
    if (!has && me.ideaIds.length >= 6) return setError('Six is the cap. Drop one first.');
    setError('');
    try {
      await updateMe({ ideaIds: has ? me.ideaIds.filter((x) => x !== id) : [...me.ideaIds, id] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save.');
    }
  };

  const reset = async () => {
    setResetting(true);
    await demoReset();
    router.replace('/onboarding');
  };

  const live = backend.kind === 'supabase';

  return (
    <Screen inTabs>
      <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center', marginBottom: space.xl }}>
        <Portrait name={me.name} palette={me.palette} glyph={me.glyph} size={84} />
        <View style={{ flex: 1 }}>
          <T v="display" numberOfLines={1} adjustsFontSizeToFit>{me.name}</T>
          <T v="caption" c={color.textDim}>{me.age}  /  {me.area}{me.pronouns ? `  /  ${me.pronouns}` : ''}</T>
        </View>
      </View>

      <TrustBadge person={me} size="lg" />
      <T v="caption" c={color.textDim} style={{ marginTop: space.sm }}>
        {live
          ? 'Worked out from your kept promises, bails and no-shows. Refreshes every few minutes.'
          : `Kept promises push it up, flakes pull it down. One flake from here would make it ${trustScore(me.kept, me.flaked + 1)}.`}
      </T>

      {me.tagline ? <T v="heading" style={{ marginTop: space.xl }}>{me.tagline}</T> : null}
      {me.vibes.length > 0 && (
        <View style={[styles.wrap, { marginTop: space.md }]}>{me.vibes.map((v) => <Chip key={v} label={v} />)}</View>
      )}

      <T v="label" c={color.textDim} style={styles.section}>I am up for  /  tap to change</T>
      <View style={styles.wrap}>
        {IDEAS.map((i) => <Chip key={i.id} label={`${i.emoji} ${i.title}`} selected={me.ideaIds.includes(i.id)} onPress={() => toggleIdea(i.id)} />)}
      </View>
      {error ? <T v="caption" c={color.flare} style={{ marginTop: space.sm }}>{error}</T> : null}

      <T v="label" c={color.textDim} style={styles.section}>Unlocks when a promise is kept</T>
      <View style={styles.panel}>
        <Feather name="lock" size={18} color={color.pink} />
        <View style={{ flex: 1 }}>
          <T v="label" c={color.textMute}>{contact?.kind ?? 'Contact'}</T>
          <T v="heading">{contact?.handle ?? 'Not set'}</T>
        </View>
      </View>

      <T v="label" c={color.textDim} style={styles.section}>Data</T>
      <View style={styles.panel}>
        <Feather name={live ? 'cloud' : 'smartphone'} size={18} color={live ? color.volt : color.textDim} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{live ? 'Live: Supabase' : 'Mock data on this phone'}</T>
          <T v="caption" c={color.textDim}>{live ? 'Postgres with row-level security and realtime.' : 'Ten made-up people who answer by themselves. Add Supabase keys to go live.'}</T>
        </View>
      </View>

      {!live && (
        <>
          <T v="label" c={color.textDim} style={styles.section}>Prototype tools</T>
          <T v="caption" c={color.textDim} style={{ marginBottom: space.md }}>Wipes this phone's mock data and starts again from onboarding.</T>
          <HoldButton tone="flare" label="Hold to reset the demo" onComplete={reset} busy={resetting} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  section: { marginTop: space.x3, marginBottom: space.md },
  panel: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg },
});
