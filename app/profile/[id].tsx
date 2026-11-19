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
import { Columns } from '@/components/ui/Columns';
import { useDesktop } from '@/lib/desktop';
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
import { answersIn } from '@/domain/answers';
import { Vouches } from '@/components/Vouches';
import { fmtDistance, t } from '@/i18n';
import { cardKm } from '@/domain/nearby';

export default function ProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useStore((s) => s.me);
  const desktop = useDesktop();
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
          <T v="display">{t('ask.goneTitle')}</T>
          <T c={color.textDim}>{t('profile.goneBody')}</T>
        </View>
      </Screen>
    );
  }

  const shared = person.ideaIds.filter((x) => me.ideaIds.includes(x));
  const footer = live
    ? <Button icon={live.status === 'locked' ? 'lock' : 'send'} label={t(live.status === 'locked' ? 'profile.openPlan' : 'profile.openAsk')} onPress={() => router.push(live.status === 'locked' ? `/plan/${live.id}` : `/invite/${live.id}`)} />
    : <Button icon="send" label={t('profile.send', { name: person.name })} onPress={() => router.push({ pathname: '/invite/new', params: { to: person.id } })} />;

  return (
    <Screen back="back" title={person.area} footer={footer}>
      <Columns gap={space.xl} left={
      <View style={[styles.hero, desktop && { height: 560 }]}>
        <Portrait name={person.name} palette={person.palette} glyph={person.glyph} faceUrl={person.faceUrl} fill style={StyleSheet.absoluteFill} />
        <View style={{ padding: space.lg, gap: 4 }}>
          <T v="display" numberOfLines={1} adjustsFontSizeToFit>{t('profile.nameAge', { name: person.name, age: person.age })}</T>
          <T v="caption" c={color.textDim}>{[t('profile.areaCity', { area: person.area, city: person.city }), cardKm(me, person) ? fmtDistance(cardKm(me, person)!, me.country) : '', person.pronouns].filter(Boolean).join('  /  ')}</T>
        </View>
      </View>
      } right={
      <View style={{ gap: space.xl }}>
        <TrustBadge person={person} size="lg" />
        {answersIn(person.answerMinutes) ? <T v="caption" c={color.textDim}>{answersIn(person.answerMinutes)}</T> : null}

        {person.tagline ? <T v="heading">{person.tagline}</T> : null}
        {me && me.id !== person.id ? <Spark me={me} person={person} /> : null}
        <Vouches person={person} />
        {person.vibes.length > 0 && <View style={styles.wrap}>{person.vibes.map((v) => <Chip key={v} label={v} />)}</View>}

        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>{t('profile.upFor')}</T>
          {person.ideaIds.map((ideaId) => {
            const idea = ideaOf(ideaId);
            return (
              <Pressable
                key={ideaId}
                disabled={!!live}
                accessibilityRole="button"
                accessibilityLabel={t('profile.askTo', { name: person.name, idea: idea.title })}
                onPress={() => router.push({ pathname: '/invite/new', params: { to: person.id, idea: ideaId } })}
                style={({ pressed }) => [styles.idea, pressed && { borderColor: color.pink }]}
              >
                <T style={{ fontSize: 26, lineHeight: 34 }} maxFontSizeMultiplier={1}>{idea.emoji}</T>
                <View style={{ flex: 1 }}>
                  <T v="bodyBold">{idea.title}</T>
                  <T v="caption" c={color.textDim}>{t('onboarding.ideaSub', { minutes: idea.minutes, blurb: idea.blurb })}</T>
                </View>
                {shared.includes(ideaId) ? <Tag label={t('profile.youToo')} tone={color.gold} /> : !live ? <Feather name="arrow-up-right" size={18} color={color.textMute} /> : null}
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>{t('profile.contactPhotos')}</T>
          <LockedReveal
            person={person}
            reveal={reveal}
            hint={t(live && !isOpen(live) ? 'profile.opensAtPlan' : 'profile.staysLocked', { name: person.name })}
          />
        </View>

        <Button kind="quiet" icon="shield" label={t('profile.blockOrReport')} onPress={() => setSafety(true)} />
      </View>
      } />

      <Sheet
        visible={safety}
        onClose={() => setSafety(false)}
        eyebrow={t('profile.safety')}
        title={t('profile.blockTitle', { name: person.name })}
        body={t('profile.blockBody', { name: person.name })}
      >
        {error ? <ErrorText text={error} /> : null}
        <HoldButton tone="flare" label={t('profile.holdBlock', { name: person.name })} busy={busy} onComplete={doBlock} />
        <Button kind="ghost" icon="flag" label={t('profile.reportInstead')} onPress={() => {
          setSafety(false);
          router.push({ pathname: '/report/[id]', params: { id: person.id, invite: (live ?? between[0])?.id ?? '' } });
        }} />
        <Button kind="quiet" label={t('profile.neverMind')} onPress={() => setSafety(false)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 300, borderRadius: radius.card, overflow: 'hidden', borderWidth: 1, borderColor: color.line, justifyContent: 'flex-end' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  idea: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md, minHeight: 64 },
});
