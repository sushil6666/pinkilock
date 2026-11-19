/**
 * The vibe check composer. There is no message box: an ask is an idea, a time, a place and one
 * line. Sending takes a hold, because an ask you did not mean wastes two people's time.
 */
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Portrait } from '@/components/Portrait';
import { TrustBadge } from '@/components/TrustBadge';
import { Chip, Tag } from '@/components/ui/Chip';
import { IdeaChip } from '@/components/IdeaChip';
import { HoldButton } from '@/components/ui/HoldButton';
import { inputStyle } from '@/components/ui/input';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { NOTE_TONES, ideaOf, noteStarters, type NoteTone } from '@/domain/ideas';
import { MAX_OPEN_ASKS, isOpen } from '@/domain/invites';
import { dayOptions, slotOptions, timeLabel } from '@/domain/time';
import { haptic } from '@/lib/haptics';
import { usePerson, useStore } from '@/state/store';
import { color, space, type } from '@/theme/tokens';
import { shown } from '@/lib/report';
import { ErrorText } from '@/components/ui/ErrorText';
import { PLACE_MAX, looksLikeContact } from '@/domain/profile';
import { venueOf, venuePlace, venuesFor } from '@/domain/venues';
import { suits, windowsLabel } from '@/domain/freeWindows';
import { t } from '@/i18n';

// The place stored on a remote ask; the other person reads it as written. i18n: data
const REMOTE_PLACE = { video: 'Pinkilock video room', game: 'Voice chat in the app' } as const; // i18n: data

export default function NewInvite() {
  const params = useLocalSearchParams<{ to: string; idea?: string; double?: string }>();
  const me = useStore((s) => s.me);
  const person = usePerson(params.to);
  const friend = usePerson(useStore((s) => s.duoId) ?? undefined);
  const openAsks = useStore((s) => s.invites.filter((i) => i.fromId === s.me?.id && isOpen(i)).length);
  const send = useStore((s) => s.sendInvite);

  const now = useMemo(() => Date.now(), []);
  const days = useMemo(() => dayOptions(now).filter((option) => slotOptions(option.start, now).length > 0), [now]);
  const [ideaId, setIdeaId] = useState(params.idea ?? person?.ideaIds[0] ?? '');
  const [dayId, setDayId] = useState(days[0]?.id ?? '');
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [place, setPlace] = useState('');
  // A picked venue, or 'other' once the person chooses to type a place of their own.
  const [venueId, setVenueId] = useState<string | 'other' | null>(null);
  const [showAllVenues, setShowAllVenues] = useState(false);
  const [note, setNote] = useState('');
  const [tone, setTone] = useState<NoteTone>('chill');
  // A double (docs/build-plan.md F3): my duo comes, and so does theirs.
  const [double, setDouble] = useState(params.double === '1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!person || !me) {
    return (
      <Screen desk="form" back="close" scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center' }}><T v="display">{t('compose.nobody')}</T></View>
      </Screen>
    );
  }

  const idea = ideaOf(ideaId);
  const remotePlace = idea.kind === 'irl' ? null : REMOTE_PLACE[idea.kind];
  const day = days.find((option) => option.id === dayId);
  const slots = day ? slotOptions(day.start, now) : [];
  const full = openAsks >= MAX_OPEN_ASKS;
  const asDouble = double && !!friend && !!person.hasDuo;
  
  const venues = remotePlace ? [] : venuesFor(me.city, person.area, me.area);
  // With no list for this city yet, the place is typed, as before.
  const typing = !remotePlace && (venueId === 'other' || venues.length === 0);
  const venue = !remotePlace && !typing ? venueOf(venueId) : undefined;
  const leaks = looksLikeContact(note) || (typing && looksLikeContact(place));
  const missing = !startsAt ? t('compose.pickTime') : !remotePlace && !venue && !typing ? t('compose.pickWhere')
    : typing && place.trim().length < 3 ? t('compose.addPlace')
    : leaks ? t('errors.PL065') : '';

  const submit = async () => {
    if (!startsAt) return;
    setBusy(true);
    setError('');
    try {
      const invite = await send({ toId: person.id, ideaId, startsAt, place: remotePlace ?? (venue ? venuePlace(venue) : place), note, venueId: venue?.id, double: asDouble });
      haptic.success();
      router.replace(`/invite/${invite.id}`);
    } catch (e) {
      haptic.warning();
      setError(shown(e, '/invite/new'));
      setBusy(false);
    }
  };

  const hint = error || full
    ? <ErrorText text={error || t('compose.full', { max: MAX_OPEN_ASKS })} />
    : <T v="caption" c={color.textDim}>{missing || t(asDouble ? 'compose.hoursDouble' : 'compose.hours', { name: person.name, n: openAsks + 1, max: MAX_OPEN_ASKS })}</T>;

  return (
    <Screen
      desk="form"
      back="close"
      title={t('ask.title')}
      footer={<>{hint}<HoldButton label={t(asDouble ? 'compose.holdDouble' : 'compose.hold', { name: person.name })} onComplete={submit} disabled={!!missing || full} busy={busy} /></>}
    >
      <View style={styles.to}>
        <Portrait name={person.name} palette={person.palette} glyph={person.glyph} faceUrl={person.faceUrl} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="title" numberOfLines={1}>{t('compose.askName', { name: person.name })}</T>
          <TrustBadge person={person} />
        </View>
      </View>

      {person.hasDuo ? (
        <Section n="00" label={t('compose.whoComes')}>
          {friend ? (
            <View style={styles.wrap}>
              <Chip label={t('compose.justUs')} selected={!asDouble} onPress={() => setDouble(false)} />
              <Chip label={t('compose.doubleWith', { name: friend.name })} sub={t('compose.theirDuoToo', { name: person.name })} selected={asDouble} onPress={() => setDouble(true)} />
            </View>
          ) : (
            <T v="caption" c={color.textDim}>{t('compose.hasDuo', { name: person.name })}</T>
          )}
        </Section>
      ) : null}

      <Section n="01" label={t('compose.toWhat')}>
        <View style={{ gap: space.sm }}>
          {person.ideaIds.map((id) => {
            const option = ideaOf(id);
            return <IdeaChip key={id} idea={option} selected={id === ideaId} onPress={() => setIdeaId(id)} />;
          })}
        </View>
      </Section>

      <Section n="02" label={t('compose.when')}>
        <View style={styles.wrap}>
          {days.map((option) => (
            <Chip key={option.id} label={option.label} sub={option.sub} selected={option.id === dayId} onPress={() => { setDayId(option.id); setStartsAt(null); }} />
          ))}
        </View>
        {person.freeWindows?.length ? <T v="caption" c={color.textDim}>{t('compose.usuallyFreeAt', { name: person.name, when: windowsLabel(person.freeWindows) })}</T> : null}
        <View style={styles.wrap}>
          {slots.map((at) => (
            <Chip key={at} label={timeLabel(at)} sub={person.freeWindows?.length && suits(at, person.freeWindows) ? t('compose.usuallyFree', { name: person.name }) : undefined}
              selected={at === startsAt} onPress={() => setStartsAt(at)} />
          ))}
        </View>
      </Section>

      <Section n="03" label={t('compose.where')}>
        {remotePlace ? (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Feather name="smartphone" size={16} color={color.textDim} />
            <T c={color.textDim} style={{ flex: 1 }}>{t(idea.kind === 'game' ? 'compose.remoteGame' : 'compose.remoteVideo')}</T>
          </View>
        ) : (
          <>
            {venues.length > 0 && (
              <View style={styles.wrap}>
                {(showAllVenues ? venues : venues.slice(0, 6)).map((v) => (
                  <Chip key={v.id} label={v.name} sub={v.area} selected={venueId === v.id} onPress={() => setVenueId(venueId === v.id ? null : v.id)} />
                ))}
              </View>
            )}
            {venues.length > 0 && (
              <View style={styles.wrap}>
                {!showAllVenues && venues.length > 6 && <Tag label={t('compose.morePlaces', { count: venues.length - 6 })} onPress={() => setShowAllVenues(true)} />}
                <Tag label={t('compose.elsewhere')} tone={venueId === 'other' ? color.gold : color.textDim} selected={venueId === 'other'} onPress={() => setVenueId(venueId === 'other' ? null : 'other')} />
              </View>
            )}
            {typing && <TextInput value={place} onChangeText={setPlace} placeholder={t('compose.placePlaceholder')} placeholderTextColor={color.textMute} maxLength={PLACE_MAX} style={[inputStyle, type.body]} accessibilityLabel={t('compose.whereLabel')} />}
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Feather name="shield" size={14} color={color.textDim} style={{ marginTop: 2 }} />
              <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('compose.publicBusy')}</T>
            </View>
          </>
        )}
      </Section>

      <Section n="04" label={t('compose.line')}>
        <View style={styles.wrap}>
          {NOTE_TONES.map((nt) => <Tag key={nt.id} label={nt.label} tone={tone === nt.id ? color.gold : color.textDim} selected={tone === nt.id} onPress={() => setTone(nt.id)} />)}
        </View>
        <View style={styles.wrap}>
          {noteStarters(idea.kind, tone).map((line) => (
            <Chip key={line} label={line} selected={note === line} onPress={() => setNote(note === line ? '' : line)} />
          ))}
        </View>
        <T v="caption" c={color.textDim}>{t('compose.lineBody')}</T>
      </Section>
    </Screen>
  );
}

function Section({ n, label, children }: { n: string; label: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: space.xxl, gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <T v="label" c={color.pink}>{n}</T>
        <T v="label" c={color.textDim}>{label}</T>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  to: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
