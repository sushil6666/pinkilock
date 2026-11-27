/**
 * Cosmic match (D129): the Moon-sign match of Indian tradition (36 gunas) and numerology, for fun
 * and tradition. Opt-in; my birth date and time stay private; a score shows only with someone I
 * matched with who turned it on too. Never in Discover's order or a Trust Score, never caste or
 * gotra, never a remedy for sale.
 */
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Portrait } from '@/components/Portrait';
import { Button } from '@/components/ui/Button';
import { Columns } from '@/components/ui/Columns';
import { ErrorText } from '@/components/ui/ErrorText';
import { inputStyle } from '@/components/ui/input';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { GUNA_MAX, KOOTAS, KOOTA_MAX, NAKSHATRAS, RASHIS, checkBirth, emptyCosmic, lifePath, nakshatraOf, rashiOf, scoreBand, type Cosmic, type CosmicPair } from '@/domain/cosmic';
import { haptic } from '@/lib/haptics';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

const ROUTE = '/cosmic';
const panel = { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md } as const;
const todayIST = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

export default function CosmicPage() {
  const me = useStore((s) => s.me);
  const profiles = useStore((s) => s.profiles);
  const [state, setState] = useState<Cosmic>(emptyCosmic);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      backend.cosmic().then((c) => { if (alive) { setState(c); setLoaded(true); } }, (e) => { if (alive) { setError(shown(e, ROUTE)); setLoaded(true); } });
      return () => {
        alive = false;
      };
    }, []),
  );

  const run = async (what: string, fn: () => Promise<Cosmic>) => {
    setBusy(what);
    setError('');
    try {
      setState(await fn());
      setEditing(false);
      haptic.success();
    } catch (e) {
      setError(shown(e, ROUTE));
    } finally {
      setBusy('');
    }
  };

  const ready = !!me && !checkBirth(date.trim(), time.trim() || null, me.age, todayIST());
  const save = () => ready && run('save', () => backend.cosmicSave(date.trim(), time.trim() || null));
  const edit = () => {
    setDate(state.me.birthDate ?? '');
    setTime(state.me.birthTime ?? '');
    setEditing(true);
  };
  const m = state.me;

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.moon}>{t('cosmic.eyebrow')}</T>
        <T v="display">{t('cosmic.title')}</T>
        <T c={color.textDim}>{t('cosmic.intro')}</T>
        <View style={styles.fun}>
          <Feather name="moon" size={14} color={color.moon} />
          <T v="label" c={color.moon}>{t('cosmic.fun')}</T>
        </View>
      </View>

      {!loaded ? null : m.on && m.moon !== null && !editing ? (
        <View style={[panel, styles.mine]}>
          <Line label={t('cosmic.yourStar')} value={t(`cosmic.stars.${NAKSHATRAS[nakshatraOf(m.moon)]}`)} />
          <Line label={t('cosmic.yourSign')} value={t(`cosmic.signs.${RASHIS[rashiOf(m.moon)]}`)} />
          {m.birthDate ? <Line label={t('cosmic.yourNumber')} value={t(`cosmic.numbers.n${lifePath(m.birthDate)}` as 'cosmic.numbers.n1')} /> : null}
          {!m.birthTime ? <T v="caption" c={color.textMute}>{t('cosmic.timeNote')}</T> : null}
          <View style={{ gap: space.sm }}>
            <Button kind="ghost" icon="edit-3" label={t('cosmic.change')} onPress={edit} />
            <Button kind="quiet" wrap icon="trash-2" label={t('cosmic.off')} busy={busy === 'off'} onPress={() => run('off', () => backend.cosmicOff())} />
          </View>
        </View>
      ) : (
        <View style={panel}>
          <T v="heading">{t('cosmic.formTitle')}</T>
          <View style={{ gap: space.xs }}>
            <T v="bodyBold">{t('cosmic.date')}</T>
            <TextInput value={date} onChangeText={setDate} placeholder={t('cosmic.dateHint')} placeholderTextColor={color.textMute} accessibilityLabel={t('cosmic.date')}
              maxLength={10} inputMode="numeric" autoComplete="birthdate-full" style={inputStyle} />
          </View>
          <View style={{ gap: space.xs }}>
            <T v="bodyBold">{t('cosmic.time')}</T>
            <TextInput value={time} onChangeText={setTime} placeholder={t('cosmic.timeHint')} placeholderTextColor={color.textMute} accessibilityLabel={t('cosmic.time')}
              maxLength={5} inputMode="numeric" style={inputStyle} />
            <T v="caption" c={color.textMute}>{t('cosmic.timeNote')}</T>
          </View>
          <Button icon="moon" label={t(m.on ? 'cosmic.save' : 'cosmic.turnOn')} busy={busy === 'save'} disabled={!ready} onPress={save} />
        </View>
      )}
      <ErrorText text={error} />
      <View style={styles.row}>
        <Feather name="lock" size={14} color={color.textDim} style={{ marginTop: 2 }} />
        <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('cosmic.private')}</T>
      </View>
      <View style={styles.row}>
        <Feather name="shield" size={14} color={color.textDim} style={{ marginTop: 2 }} />
        <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('cosmic.never')}</T>
      </View>
    </>
  );

  const right = (
    <View style={panel}>
      <T v="heading">{t('cosmic.matchesTitle')}</T>
      {state.pairs.length ? (
        state.pairs.map((p) => <PairCard key={p.profileId} pair={p} person={profiles.find((x) => x.id === p.profileId)} />)
      ) : (
        <T v="caption" c={color.textDim}>{t('cosmic.noMatches')}</T>
      )}
      <T v="caption" c={color.textMute}>{t('cosmic.note')}</T>
    </View>
  );

  return (
    <Screen back="back" title={t('cosmic.eyebrow')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <T v="label" c={color.textDim}>{label}</T>
      <T v="bodyBold">{value}</T>
    </View>
  );
}

type Person = ReturnType<typeof useStore.getState>['profiles'][number];

function PairCard({ pair, person }: { pair: CosmicPair; person: Person | undefined }) {
  const [open, setOpen] = useState(false);
  const name = person?.name ?? '';
  return (
    <View style={styles.pair}>
      <View style={styles.pairHead}>
        {person ? <Portrait {...person} size={44} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyBold">{name}</T>
          {pair.score === null ? <T v="caption" c={color.textDim}>{t('cosmic.waiting', { name })}</T> : <T v="caption" c={color.moon}>{t(`cosmic.bands.${scoreBand(pair.score)}`)}</T>}
        </View>
        {pair.score !== null ? <T v="title" c={color.moon}>{t('cosmic.score', { score: pair.score })}</T> : null}
      </View>
      {pair.score !== null && pair.kootas ? (
        <>
          <View style={styles.bar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <View style={[styles.fill, { width: `${(pair.score / GUNA_MAX) * 100}%` }]} />
          </View>
          {pair.myNumber && pair.theirNumber ? <T v="caption" c={color.textDim}>{t('cosmic.numbersLine', { mine: pair.myNumber, theirs: pair.theirNumber })}</T> : null}
          <Button kind="quiet" icon={open ? 'chevron-up' : 'chevron-down'} label={t('cosmic.kootasTitle')} onPress={() => setOpen(!open)} />
          {open
            ? KOOTAS.map((k) => (
                <View key={k} style={styles.koota}>
                  <T v="caption" style={{ flex: 1 }}>{t(`cosmic.kootas.${k}`)}</T>
                  <T v="caption" c={color.textDim}>{`${pair.kootas![k]} / ${KOOTA_MAX[k]}`}</T>
                </View>
              ))
            : null}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  fun: { flexDirection: 'row', gap: space.xs, alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderColor: color.moon, borderRadius: radius.pill, paddingHorizontal: space.md, paddingVertical: space.xs },
  mine: { borderColor: color.moon },
  pair: { borderRadius: radius.card, backgroundColor: color.surfaceHi, padding: space.md, gap: space.sm },
  pairHead: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  bar: { height: 8, borderRadius: radius.pill, backgroundColor: color.line, overflow: 'hidden' },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: color.moon },
  koota: { flexDirection: 'row', gap: space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.xs },
});
