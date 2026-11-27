/**
 * Couple mode's shared parts (D120): its state, loaded from the backend and read again every few
 * seconds while a screen shows it (the other person's hearts and ticks arrive that way), and the
 * card on Plans that leads into it. Errors go through `shown`: the code and the route, never content.
 */
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { CHALLENGE_EMOJI, daysTogether, emptyCouple, isoDay, thisWeek, type Couple } from '../domain/couple';
import { shown } from '../lib/report';
import { quiet } from '../lib/log';
import { backend } from '../services';
import { useStore } from '../state/store';
import { color, radius, space } from '../theme/tokens';
import { Portrait } from './Portrait';
import { T } from './ui/T';
import { t } from '../i18n';

const REFRESH_MS = 15_000;

export function useCouple(route: string) {
  const [state, setState] = useState<Couple | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const busyRef = useRef('');
  busyRef.current = busy;

  const load = useCallback(() => {
    backend.couple().then((c) => { if (!busyRef.current) setState(c); }, (e) => setError(shown(e, route)));
  }, [route]);
  useFocusEffect(load);
  useEffect(() => {
    const id = setInterval(() => { if (!busyRef.current) backend.couple().then(setState, quiet('couple.refresh')); }, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  /** One change; answers true when it worked. */
  const run = useCallback(async (what: string, work: () => Promise<Couple>): Promise<boolean> => {
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
  return { state: state ?? emptyCouple(isoDay(Date.now())), loaded: !!state, error, busy, run };
}

/** The card at the top of Plans: our couple, their ask, or a match to start one with. Nothing otherwise. */
export function CoupleEntry() {
  const { state, loaded } = useCouple('/(tabs)/plans');
  const profiles = useStore((s) => s.profiles);
  if (!loaded) return null;
  const id = state.partnerId ?? (state.status === 'none' ? state.matches[0] : undefined);
  const person = profiles.find((p) => p.id === id);
  if (!person || state.status === 'asked_by_me') return null;

  const week = thisWeek(state);
  const [title, body] =
    state.status === 'on' ? [t('couple.entryOn', { name: person.name, count: daysTogether(state) }), week ? t('couple.entryOnBody', { challenge: t(`couple.challenges.${week.challenge}`) }) : t('couple.weekBody')]
    : state.status === 'asked_me' ? [t('couple.entryAsked', { name: person.name }), t('couple.askedMeBody')]
    : [t('couple.entryMatch', { name: person.name }), t('couple.entryMatchBody')];

  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${body}`} onPress={() => router.push('/couple')}
      style={({ pressed }) => [styles.entry, pressed && { backgroundColor: color.surfaceHi }]}>
      <Portrait {...person} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" c={color.pink}>{t('couple.eyebrow')}</T>
        <T v="bodyBold" numberOfLines={2}>{title}</T>
        <T v="caption" c={color.textDim} numberOfLines={2}>{state.status === 'on' && week ? `${CHALLENGE_EMOJI[week.challenge]}  ${body}` : body}</T>
      </View>
      <Feather name="arrow-right" size={20} color={color.pink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.pinkDeep, backgroundColor: color.pinkWash, borderRadius: radius.card, padding: space.lg, marginBottom: space.lg },
});
