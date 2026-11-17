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
import { HoldButton } from '@/components/ui/HoldButton';
import { inputStyle } from '@/components/ui/input';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { NOTE_TONES, ideaOf, noteStarters, type NoteTone } from '@/domain/ideas';
import { MAX_OPEN_ASKS, NOTE_MAX, isOpen } from '@/domain/invites';
import { dayOptions, slotOptions, timeLabel } from '@/domain/time';
import { haptic } from '@/lib/haptics';
import { usePerson, useStore } from '@/state/store';
import { color, space, type } from '@/theme/tokens';
import { shown } from '@/lib/report';
import { ErrorText } from '@/components/ui/ErrorText';
import { PLACE_MAX, looksLikeContact } from '@/domain/profile';

const REMOTE_PLACE = { video: 'Pinkilock video room', game: 'Voice chat in the app' } as const;

export default function NewInvite() {
  const params = useLocalSearchParams<{ to: string; idea?: string }>();
  const me = useStore((s) => s.me);
  const person = usePerson(params.to);
  const openAsks = useStore((s) => s.invites.filter((i) => i.fromId === s.me?.id && isOpen(i)).length);
  const send = useStore((s) => s.sendInvite);

  const now = useMemo(() => Date.now(), []);
  const days = useMemo(() => dayOptions(now).filter((option) => slotOptions(option.start, now).length > 0), [now]);
  const [ideaId, setIdeaId] = useState(params.idea ?? person?.ideaIds[0] ?? '');
  const [dayId, setDayId] = useState(days[0]?.id ?? '');
  const [startsAt, setStartsAt] = useState<number | null>(null);
  const [place, setPlace] = useState('');
  const [note, setNote] = useState('');
  const [tone, setTone] = useState<NoteTone>('chill');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!person || !me) {
    return (
      <Screen back="close" scroll={false}>
        <View style={{ flex: 1, justifyContent: 'center' }}><T v="display">Nobody{'\n'}to ask.</T></View>
      </Screen>
    );
  }

  const idea = ideaOf(ideaId);
  const remotePlace = idea.kind === 'irl' ? null : REMOTE_PLACE[idea.kind];
  const day = days.find((option) => option.id === dayId);
  const slots = day ? slotOptions(day.start, now) : [];
  const full = openAsks >= MAX_OPEN_ASKS;
  const leaks = looksLikeContact(note) || (!remotePlace && looksLikeContact(place));
  const missing = !startsAt ? 'Pick a time.' : !remotePlace && place.trim().length < 3 ? 'Say where: somewhere public.'
    : leaks ? 'Contacts unlock after a kept promise. Take that out.' : '';

  const submit = async () => {
    if (!startsAt) return;
    setBusy(true);
    setError('');
    try {
      const invite = await send({ toId: person.id, ideaId, startsAt, place: remotePlace ?? place, note });
      haptic.success();
      router.replace(`/invite/${invite.id}`);
    } catch (e) {
      haptic.warning();
      setError(shown(e, '/invite/new'));
      setBusy(false);
    }
  };

  const hint = error || full
    ? <ErrorText text={error || `You have ${MAX_OPEN_ASKS} asks open. Wait for an answer or take one back.`} />
    : <T v="caption" c={color.textDim}>{missing || `${person.name} gets 24 hours to answer. Ask ${openAsks + 1} of ${MAX_OPEN_ASKS}.`}</T>;

  return (
    <Screen
      back="close"
      title="Vibe check"
      footer={<>{hint}<HoldButton label={`Hold to ask ${person.name}`} onComplete={submit} disabled={!!missing || full} busy={busy} /></>}
    >
      <View style={styles.to}>
        <Portrait name={person.name} palette={person.palette} glyph={person.glyph} size={52} />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="title" numberOfLines={1}>Ask {person.name}</T>
          <TrustBadge person={person} />
        </View>
      </View>

      <Section n="01" label="To what">
        <View style={{ gap: space.sm }}>
          {person.ideaIds.map((id) => {
            const option = ideaOf(id);
            return <Chip key={id} label={`${option.emoji}  ${option.title}`} sub={`${option.minutes} min  /  ${option.blurb}`} selected={id === ideaId} onPress={() => setIdeaId(id)} />;
          })}
        </View>
      </Section>

      <Section n="02" label="When">
        <View style={styles.wrap}>
          {days.map((option) => (
            <Chip key={option.id} label={option.label} sub={option.sub} selected={option.id === dayId} onPress={() => { setDayId(option.id); setStartsAt(null); }} />
          ))}
        </View>
        <View style={styles.wrap}>
          {slots.map((t) => <Chip key={t} label={timeLabel(t)} selected={t === startsAt} onPress={() => setStartsAt(t)} />)}
        </View>
      </Section>

      <Section n="03" label="Where">
        {remotePlace ? (
          <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
            <Feather name="smartphone" size={16} color={color.textDim} />
            <T c={color.textDim} style={{ flex: 1 }}>{remotePlace}. No numbers swapped.</T>
          </View>
        ) : (
          <>
            <TextInput value={place} onChangeText={setPlace} placeholder="Boba counter, Linking Road" placeholderTextColor={color.textMute} maxLength={PLACE_MAX} style={[inputStyle, type.body]} accessibilityLabel="Where to meet" />
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Feather name="shield" size={14} color={color.textDim} style={{ marginTop: 2 }} />
              <T v="caption" c={color.textDim} style={{ flex: 1 }}>Somewhere public and busy. Tell a friend where you will be.</T>
            </View>
          </>
        )}
      </Section>

      <Section n="04" label={`One line (optional)  ${note.length}/${NOTE_MAX}`}>
        <View style={styles.wrap}>
          {NOTE_TONES.map((t) => <Tag key={t.id} label={t.label} tone={tone === t.id ? color.volt : color.textDim} selected={tone === t.id} onPress={() => setTone(t.id)} />)}
        </View>
        <View style={styles.wrap}>
          {noteStarters(idea.kind, tone).map((line) => (
            <Chip key={line} label={line} selected={note === line} onPress={() => setNote(note === line ? '' : line)} />
          ))}
        </View>
        <TextInput value={note} onChangeText={setNote} placeholder="Brown sugar or taro. Choose wisely." placeholderTextColor={color.textMute} maxLength={NOTE_MAX} multiline style={[inputStyle, type.body, { paddingVertical: space.md, minHeight: 72, textAlignVertical: 'top' }]} accessibilityLabel="One line to go with the ask" />
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
