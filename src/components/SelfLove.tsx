/**
 * The parts Self love and Bounce back share (D101): the state, loaded from the backend, and a box
 * to write a private note with the list of notes under it. Nothing here is logged: errors go
 * through `shown`, which carries the code and the route only, never the words.
 */
import { Feather } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Button } from './ui/Button';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';
import { inputStyle } from './ui/input';
import { SELF_NOTE_MAX, emptySelfLove, dayOf, type NoteKind, type SelfLove, type SelfNote } from '../domain/selfLove';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space, type } from '../theme/tokens';
import { fmtDayMonth, t } from '../i18n';

/** Midday on a `YYYY-MM-DD` day, to show it as a date. */
export const dayTime = (day: string) => Date.parse(`${day}T12:00:00`);

export function useSelfLove(route: string) {
  const [state, setState] = useState<SelfLove | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => {
    backend.selfLove().then(setState, (e) => setError(shown(e, route)));
  }, [route]);
  /** One change; answers true when it worked. */
  const run = useCallback(async (what: string, work: () => Promise<SelfLove>): Promise<boolean> => {
    setBusy(what);
    setError('');
    try {
      setState(await work());
      return true;
    } catch (e) {
      setError(shown(e, route));
      return false;
    } finally {
      setBusy('');
    }
  }, [route]);
  return { state: state ?? emptySelfLove(dayOf(Date.now())), loaded: !!state, error, busy, run };
}

export const panel = { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md } as const;

interface NotesProps {
  kind: NoteKind;
  notes: SelfNote[];
  placeholder: string;
  label: string;
  add: string;
  empty: string;
  busy: string;
  run: ReturnType<typeof useSelfLove>['run'];
  /** False when no more can go in today (the jar). */
  open?: boolean;
  /** How many to list; the rest stay in the jar (and in the data download). */
  show?: number;
}

export function SelfNotes({ kind, notes, placeholder, label, add, empty, busy, run, open = true, show = 20 }: NotesProps) {
  const [text, setText] = useState('');
  const mine = notes.filter((n) => n.kind === kind);
  const save = async () => {
    if (await run(`add_${kind}`, () => backend.addSelfNote(kind, text))) setText('');
  };
  return (
    <View style={{ gap: space.md }}>
      {open ? (
        <>
          <TextInput value={text} onChangeText={setText} maxLength={SELF_NOTE_MAX} multiline placeholder={placeholder} accessibilityLabel={label}
            placeholderTextColor={color.textMute} style={[inputStyle, type.body, { minHeight: 88, paddingVertical: space.md, textAlignVertical: 'top' }]} />
          <View style={styles.row}>
            <T v="caption" c={color.textMute} style={{ flex: 1 }}>{t('selfLove.count', { n: text.length, max: SELF_NOTE_MAX })}</T>
            <Button kind="ghost" icon="plus" label={add} onPress={save} disabled={!text.trim()} busy={busy === `add_${kind}`} />
          </View>
        </>
      ) : null}
      {mine.length === 0 ? <T v="caption" c={color.textMute}>{empty}</T> : null}
      {mine.slice(0, show).map((n) => (
        <View key={n.id} style={styles.note}>
          <View style={{ flex: 1, gap: 2 }}>
            <T>{n.body}</T>
            <T v="caption" c={color.textMute}>{fmtDayMonth(dayTime(n.day))}</T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={t('selfLove.removeLabel', { text: n.body.slice(0, 40) })} hitSlop={10}
            onPress={() => run(`remove_${n.id}`, () => backend.removeSelfNote(n.id))} style={styles.remove}>
            <Feather name="x" size={16} color={color.textMute} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export function SelfError({ text }: { text: string }) {
  return text ? <ErrorText text={text} /> : null;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md },
  remove: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
});
