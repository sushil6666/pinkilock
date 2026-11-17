/** Someone's profile: what they are up for, their record, and what stays locked until you both show. */
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LockedReveal } from '@/components/LockedReveal';
import { Portrait } from '@/components/Portrait';
import { Spark } from '@/components/Spark';
import { TrustBadge } from '@/components/TrustBadge';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Chip';
import { HoldButton } from '@/components/ui/HoldButton';
import { Screen, backToDiscover } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { ideaOf } from '@/domain/ideas';
import { isLive, isOpen, otherId } from '@/domain/invites';
import { useReveal } from '@/lib/useReveal';
import { usePerson, useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useStore((s) => s.me);
  const person = usePerson(id);
  const invites = useStore((s) => s.invites);
  const between = invites.filter((i) => me && otherId(i, me.id) === id);
  const live = between.find(isLive);
  const kept = between.find((i) => i.status === 'kept');
  const reveal = useReveal(kept?.id);
  const block = useStore((s) => s.block);
  const [safety, setSafety] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const doBlock = async () => {
    setBusy(true);
    setError('');
    try {
      await block(id);
      setSafety(false);
      backToDiscover();
    } catch (e) {
      setError(shown(e, '/profile/[id]'));
      setBusy(false);
    }
  };

  if (!person || !me) {
    return (
      <Screen back="back" scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.md }}>
          <T v="display">Gone.</T>
          <T c={color.textDim}>This profile is not around any more.</T>
        </View>
      </Screen>
    );
  }

  const shared = person.ideaIds.filter((x) => me.ideaIds.includes(x));
  const footer = live
    ? <Button icon={live.status === 'locked' ? 'lock' : 'send'} label={live.status === 'locked' ? 'Open your plan' : 'Open your ask'} onPress={() => router.push(live.status === 'locked' ? `/plan/${live.id}` : `/invite/${live.id}`)} />
    : <Button icon="send" label={`Send ${person.name} a vibe check`} onPress={() => router.push({ pathname: '/invite/new', params: { to: person.id } })} />;

  return (
    <Screen back="back" title={person.area} footer={footer}>
      <View style={styles.hero}>
        <Portrait name={person.name} palette={person.palette} glyph={person.glyph} fill style={StyleSheet.absoluteFill} />
        <View style={{ padding: space.lg, gap: 4 }}>
          <T v="display" numberOfLines={1} adjustsFontSizeToFit>{person.name}, {person.age}</T>
          <T v="caption" c={color.textDim}>{person.area}, {person.city}{person.distanceKm > 0 ? `  /  ${person.distanceKm} km` : ''}{person.pronouns ? `  /  ${person.pronouns}` : ''}</T>
        </View>
      </View>

      <View style={{ gap: space.xl, marginTop: space.xl }}>
        <TrustBadge person={person} size="lg" />

        {person.tagline ? <T v="heading">{person.tagline}</T> : null}
        {me && me.id !== person.id ? <Spark me={me} person={person} /> : null}
        {person.vibes.length > 0 && <View style={styles.wrap}>{person.vibes.map((v) => <Chip key={v} label={v} />)}</View>}

        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>Up for</T>
          {person.ideaIds.map((ideaId) => {
            const idea = ideaOf(ideaId);
            return (
              <Pressable
                key={ideaId}
                disabled={!!live}
                accessibilityRole="button"
                accessibilityLabel={`Ask ${person.name} to ${idea.title}`}
                onPress={() => router.push({ pathname: '/invite/new', params: { to: person.id, idea: ideaId } })}
                style={({ pressed }) => [styles.idea, pressed && { borderColor: color.pink }]}
              >
                <T style={{ fontSize: 26, lineHeight: 34 }} maxFontSizeMultiplier={1}>{idea.emoji}</T>
                <View style={{ flex: 1 }}>
                  <T v="bodyBold">{idea.title}</T>
                  <T v="caption" c={color.textDim}>{idea.minutes} min  /  {idea.blurb}</T>
                </View>
                {shared.includes(ideaId) ? <Tag label="You too" tone={color.volt} /> : !live ? <Feather name="arrow-up-right" size={18} color={color.textMute} /> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>Contact and more photos</T>
          <LockedReveal
            person={person}
            reveal={reveal}
            hint={live && !isOpen(live)
              ? `Opens when you and ${person.name} both check in to your plan.`
              : `Stays locked until you and ${person.name} lock a plan and both show up for it.`}
          />
        </View>

        <Button kind="quiet" icon="shield" label="Block or report" onPress={() => setSafety(true)} />
      </View>

      <Sheet
        visible={safety}
        onClose={() => setSafety(false)}
        eyebrow="Safety"
        title={`Block ${person.name}?`}
        body={`You stop seeing each other, here and in Discover, and any plan between you ends. Nobody's score changes. ${person.name} is not told.`}
      >
        {error ? <ErrorText text={error} /> : null}
        <HoldButton tone="flare" label={`Hold to block ${person.name}`} busy={busy} onComplete={doBlock} />
        <Button kind="ghost" icon="flag" label="Report instead" onPress={() => {
          setSafety(false);
          router.push({ pathname: '/report/[id]', params: { id: person.id, invite: (live ?? between[0])?.id ?? '' } });
        }} />
        <Button kind="quiet" label="Never mind" onPress={() => setSafety(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 300, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: color.line, justifyContent: 'flex-end' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  idea: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md, minHeight: 64 },
});
