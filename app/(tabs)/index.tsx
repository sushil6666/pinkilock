/**
 * Discover: one person at a time, no deck to swipe. You either pass or ask them to something
 * specific they said they are up for.
 */
import { Feather } from '@expo/vector-icons';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Portrait } from '@/components/Portrait';
import { Spark } from '@/components/Spark';
import { TrustBadge } from '@/components/TrustBadge';
import { Button } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Chip';
import { Columns } from '@/components/ui/Columns';
import { useDesktop } from '@/lib/desktop';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { ideaOf } from '@/domain/ideas';
import { isLive, otherId, peopleOf } from '@/domain/invites';
import { quiet } from '@/lib/log';
import { shareOrCopy } from '@/lib/shareOrCopy';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { answersIn } from '@/domain/answers';
import { Vouches } from '@/components/Vouches';
import { fmtDistance, t } from '@/i18n';
import { cardKm } from '@/domain/nearby';

export default function Discover() {
  const me = useStore((s) => s.me);
  const profiles = useStore((s) => s.profiles);
  const invites = useStore((s) => s.invites);
  const passedIds = useStore((s) => s.passedIds);
  const duoId = useStore((s) => s.duoId);
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
  // My duo partner, and everyone on a live double with me, are not people to discover.
  const onPlans = new Set(me ? invites.filter(isLive).flatMap((i) => peopleOf(i)) : []);
  const queue = profiles.filter((p) => p.city === me?.city && !passedIds.includes(p.id) && !busyWith.has(p.id) && !onPlans.has(p.id) && p.id !== duoId);
  // Running low: ask for the next page before the last card.
  const low = queue.length < 3;
  useEffect(() => {
    if (low && me) refill().catch(quiet('discover.refill'));
  }, [low, me, refill]);

  const desktop = useDesktop();
  const [copied, setCopied] = useState(false);
  // Nobody left to see: the one thing that brings more people is a friend telling a friend (D086).
  const inviteFriend = async () => {
    const link = Platform.OS === 'web' ? window.location.origin : Linking.createURL('/');
    setCopied((await shareOrCopy(t('discover.inviteShare', { link }))) === 'copied');
  };
  if (!me) return <Redirect href="/onboarding" />;
  const person = queue[0];

  if (!person) {
    return (
      <Screen inTabs scroll={false} desk="form">
        <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
          <T v="label" c={color.pink}>{t('discover.title')}</T>
          <T v="display">{t('discover.emptyTitle')}</T>
          <T c={color.textDim}>{busyWith.size > 0 ? t('discover.emptyBusy', { count: busyWith.size }) : t('discover.emptyNew', { city: me.city })}</T>
          {passedIds.length > 0 && <Button kind="ghost" icon="rotate-ccw" label={t('discover.lookAgain', { count: passedIds.length })} onPress={restore} />}
          {busyWith.size > 0 && <Button label={t('discover.seeAsks')} icon="send" onPress={() => router.push('/(tabs)/invites')} />}
          <Button kind={busyWith.size > 0 ? 'ghost' : 'primary'} label={t('discover.inviteFriend')} icon="user-plus" onPress={() => inviteFriend().catch(quiet('discover.invite'))} />
          {copied && <T v="caption" c={color.gold}>{t('discover.inviteCopied')}</T>}
          <Button kind="quiet" label={t('discover.moved')} icon="map-pin" onPress={() => router.push('/(tabs)/me')} />
        </View>
      </Screen>
    );
  }

  const shared = person.ideaIds.filter((id) => me.ideaIds.includes(id));

  return (
    <Screen inTabs>
      <View style={styles.head}>
        <T v="label" c={color.pink}>{t('discover.title')}</T>
        <T v="label" c={color.textMute}>{t('discover.nearby', { count: queue.length, city: me.city })}</T>
      </View>

      <Animated.View key={person.id} entering={FadeIn.duration(260)}>
        <Columns left={<>
        <Pressable accessibilityRole="button" accessibilityLabel={t('plan.openProfile', { name: person.name })} onPress={() => router.push(`/profile/${person.id}`)} style={[styles.card, desktop && { height: 560 }]}>
          <Portrait name={person.name} palette={person.palette} glyph={person.glyph} faceUrl={person.faceUrl} fill style={StyleSheet.absoluteFill} />
          <View style={styles.cardBody}>
            <TrustBadge person={person} />
            <T v="display" numberOfLines={1} adjustsFontSizeToFit>{t('profile.nameAge', { name: person.name, age: person.age })}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather name="map-pin" size={14} color={color.textDim} />
              <T v="caption" c={color.textDim}>{[person.area, cardKm(me, person) ? fmtDistance(cardKm(me, person)!, me.country) : '', person.pronouns].filter(Boolean).join('  /  ')}</T>
            </View>
            {person.hasDuo ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="users" size={14} color={color.textDim} />
                <T v="caption" c={color.textDim}>{t(duoId ? 'discover.duoAsk' : 'discover.duoOpen')}</T>
              </View>
            ) : null}
            {answersIn(person.answerMinutes) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Feather name="clock" size={14} color={color.textDim} />
                <T v="caption" c={color.textDim}>{answersIn(person.answerMinutes)}</T>
              </View>
            ) : null}
          </View>
        </Pressable>

        {person.tagline ? <T v="heading">{person.tagline}</T> : null}
        </>} right={<>
        <Spark me={me} person={person} />
        <Vouches person={person} />

        {person.vibes.length > 0 && (
          <View style={styles.vibes}>
            {person.vibes.map((v) => <Tag key={v} label={v} tone={me.vibes.includes(v) ? color.gold : color.textDim} />)}
          </View>
        )}

        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>{t('discover.upFor')}</T>
          {person.ideaIds.map((id, i) => {
            const idea = ideaOf(id);
            return (
              <Animated.View key={id} entering={FadeInDown.delay(i * 60).duration(320)}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('discover.askTo', { name: person.name, idea: idea.title, minutes: idea.minutes })}
                  onPress={() => router.push({ pathname: '/invite/new', params: { to: person.id, idea: id } })}
                  style={({ pressed }) => [styles.idea, pressed && { backgroundColor: color.surfaceHi, borderColor: color.pink }]}
                >
                  <T style={{ fontSize: 26, lineHeight: 34 }} maxFontSizeMultiplier={1}>{idea.emoji}</T>
                  <View style={{ flex: 1 }}>
                    <T v="bodyBold">{idea.title}</T>
                    <T v="caption" c={color.textDim}>{t('onboarding.ideaSub', { minutes: idea.minutes, blurb: idea.blurb })}</T>
                  </View>
                  {shared.includes(id) ? <Tag label={t('profile.youToo')} tone={color.gold} /> : <Feather name="arrow-up-right" size={18} color={color.textMute} />}
                </Pressable>
              </Animated.View>
            );
          })}
        </View>

        <View style={{ flexDirection: 'row', gap: space.md }}>
          <Button kind="ghost" icon="x" label={t('ask.pass')} onPress={() => pass(person.id)} style={{ flex: 1 }} />
          <Button icon="send" label={t('ask.title')} onPress={() => router.push({ pathname: '/invite/new', params: { to: person.id } })} style={{ flex: 2 }} />
        </View>
        </>} />
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
