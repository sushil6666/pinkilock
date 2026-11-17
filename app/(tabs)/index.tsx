/**
 * Discover: one person at a time, no deck to swipe. You either pass or ask them to something
 * specific they said they are up for.
 */
import { Feather } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Portrait } from '@/components/Portrait';
import { Spark } from '@/components/Spark';
import { TrustBadge } from '@/components/TrustBadge';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { ideaOf } from '@/domain/ideas';
import { isLive, otherId } from '@/domain/invites';
import { quiet } from '@/lib/log';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { answersIn } from '@/domain/answers';

export default function Discover() {
  const me = useStore((s) => s.me);
  const profiles = useStore((s) => s.profiles);
  const invites = useStore((s) => s.invites);
  const passedIds = useStore((s) => s.passedIds);
  const pass = useStore((s) => s.pass);
  const restore = useStore((s) => s.restorePasses);
  const refill = useStore((s) => s.refill);

  // New people are fetched, not pushed: on opening Discover, then every minute while it is open.
  useFocusEffect(useCallback(() => {
    refill().catch(quiet('discover.refill'));
    const timer = setInterval(() => refill().catch(quiet('discover.refill')), 60_000);
    return () => clearInterval(timer);
  }, [refill]));

  const busyWith = new Set(me ? invites.filter(isLive).map((i) => otherId(i, me.id)) : []);
  const queue = profiles.filter((p) => !passedIds.includes(p.id) && !busyWith.has(p.id));
  // Running low: ask for the next page before the last card.
  const low = queue.length < 3;
  useEffect(() => {
    if (low && me) refill().catch(quiet('discover.refill'));
  }, [low, me, refill]);

  if (!me) return <Redirect href="/onboarding" />;
  const person = queue[0];

  if (!person) {
    return (
      <Screen inTabs scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
          <T v="label" c={color.pink}>Discover</T>
          <T v="display">That's{'\n'}everyone{'\n'}for now.</T>
          <T c={color.textDim}>No infinite deck here. {busyWith.size > 0 ? `You have ${busyWith.size} ${busyWith.size === 1 ? 'person' : 'people'} in play: go keep those promises.` : 'New people show up as they join near you.'}</T>
          {passedIds.length > 0 && <Button kind="ghost" icon="rotate-ccw" label={`Look again at ${passedIds.length} you passed`} onPress={restore} />}
          {busyWith.size > 0 && <Button label="See your asks" icon="send" onPress={() => router.push('/(tabs)/invites')} />}
        </View>
      </Screen>
    );
  }

  const shared = person.ideaIds.filter((id) => me.ideaIds.includes(id));

  return (
    <Screen inTabs>
      <View style={styles.head}>
        <T v="label" c={color.pink}>Pinkilock</T>
        <T v="label" c={color.textMute}>{queue.length} nearby</T>
      </View>

      <Animated.View key={person.id} entering={FadeIn.duration(260)} style={{ gap: space.lg }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${person.name}'s profile`} onPress={() => router.push(`/profile/${person.id}`)} style={styles.card}>
          <Portrait name={person.name} palette={person.palette} glyph={person.glyph} fill style={StyleSheet.absoluteFill} />
          <View style={styles.cardBody}>
            <TrustBadge person={person} />
            <T v="display" numberOfLines={1} adjustsFontSizeToFit>{person.name}, {person.age}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="map-pin" size={14} color={color.textDim} />
              <T v="caption" c={color.textDim}>{person.area}{person.distanceKm > 0 ? `  /  ${person.distanceKm} km` : ''}{person.pronouns ? `  /  ${person.pronouns}` : ''}</T>
            </View>
            {answersIn(person.answerMinutes) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="clock" size={14} color={color.textDim} />
                <T v="caption" c={color.textDim}>{answersIn(person.answerMinutes)}</T>
              </View>
            ) : null}
          </View>
        </Pressable>

        {person.tagline ? <T v="heading">{person.tagline}</T> : null}

        <Spark me={me} person={person} />

        {person.vibes.length > 0 && (
          <View style={styles.vibes}>
            {person.vibes.map((v) => <Tag key={v} label={v} tone={me.vibes.includes(v) ? color.volt : color.textDim} />)}
          </View>
        )}

        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>Up for  /  tap one to ask</T>
          {person.ideaIds.map((id, i) => {
            const idea = ideaOf(id);
            return (
              <Animated.View key={id} entering={FadeInDown.delay(i * 60).duration(320)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Ask ${person.name} to ${idea.title}, ${idea.minutes} minutes`}
                  onPress={() => router.push({ pathname: '/invite/new', params: { to: person.id, idea: id } })}
                  style={({ pressed }) => [styles.idea, pressed && { backgroundColor: color.surfaceHi, borderColor: color.pink }]}
                >
                  <T style={{ fontSize: 26, lineHeight: 34 }} maxFontSizeMultiplier={1}>{idea.emoji}</T>
                  <View style={{ flex: 1 }}>
                    <T v="bodyBold">{idea.title}</T>
                    <T v="caption" c={color.textDim}>{idea.minutes} min  /  {idea.blurb}</T>
                  </View>
                  {shared.includes(id) ? <Tag label="You too" tone={color.volt} /> : <Feather name="arrow-up-right" size={18} color={color.textMute} />}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button kind="ghost" icon="x" label="Pass" onPress={() => pass(person.id)} style={{ flex: 1 }} />
          <Button icon="send" label="Vibe check" onPress={() => router.push({ pathname: '/invite/new', params: { to: person.id } })} style={{ flex: 2 }} />
        </View>
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  card: { height: 340, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: color.line, justifyContent: 'flex-end' },
  cardBody: { padding: space.lg, gap: space.sm },
  vibes: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  idea: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md, minHeight: 64 },
});
