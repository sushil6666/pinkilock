/**
 * A real listener (D108). Who I am and whom I would like to talk to (opposite, same, anyone), the
 * listeners free now who would take a call from me (talk_match, both sides' choices), the length,
 * and the call itself. Calls are voice only, first names only, never recorded. Bought credits
 * for the length are held and only the minutes we talk are charged; the free first call (D109)
 * holds nothing. Report and block are on the call and after it.
 */
import { Fold } from '@/components/ui/Fold';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CallPanel, HelpLines, panel, useCallTimer, useTalk } from '@/components/Talk';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Columns } from '@/components/ui/Columns';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import {
  CALL_LENGTHS, FREE_CALL_MINUTES, SEXES, TOPICS, WANTS, callHold, sortListeners, type CallLength, type ListenerCard, type Sex, type Topic, type Want,
} from '@/domain/talk';
import { quiet } from '@/lib/log';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { color, space } from '@/theme/tokens';
import { fmtNumber, t } from '@/i18n';

const ROUTE = '/talk/listeners';

export default function TalkListeners() {
  const { state, loaded, error, busy, run, setState } = useTalk(ROUTE);
  const [sex, setSex] = useState<Sex | null>(null);
  const [want, setWant] = useState<Want>('anyone');
  const [list, setList] = useState<ListenerCard[] | null>(null);
  const [listError, setListError] = useState('');
  const [length, setLength] = useState<CallLength>(10);
  const [useFree, setUseFree] = useState(true);
  const [topics, setTopics] = useState<Topic[]>([]);
  useCallTimer(state, setState, false);

  useEffect(() => {
    if (!loaded) return;
    setSex(state.sex);
    setWant(state.want);
  }, [loaded, state.sex, state.want]);

  const callOpen = !!state.call && state.call.status !== 'done';
  useEffect(() => {
    if (!loaded || !state.sex || callOpen) return;
    setListError('');
    backend.talkListeners().then(setList, (e) => {
      setList([]);
      setListError(shown(e, ROUTE));
    });
  }, [loaded, state.sex, state.want, callOpen]);

  // D117: while payments are paused, only the free first call can be made.
  const paused = !!state.paused;
  const free = state.freeCall === 'ready' && (useFree || paused);
  const hold = free ? 0 : callHold(length, false);
  const short = !free && state.paid < hold;
  const changed = sex !== state.sex || want !== state.want;
  const wantNeedsSex = sex === 'unsaid' && want !== 'anyone';
  const sorted = list ? sortListeners(list, topics) : null;
  const toggle = (x: Topic) => setTopics(topics.includes(x) ? topics.filter((y) => y !== x) : [...topics, x]);

  const about = (
    <Fold icon="user" title={t('talk.aboutTitle')} open={!state.sex}>
      <T v="caption" c={color.textDim}>{t('talk.aboutBody')}</T>
      <T v="label" c={color.textDim}>{t('talk.iAm')}</T>
      <View style={styles.chips}>
        {SEXES.map((x) => <Chip key={x} label={t(`talk.sex.${x}`)} selected={sex === x} onPress={() => setSex(x)} />)}
      </View>
      <T v="label" c={color.textDim}>{t('talk.iWant')}</T>
      <View style={styles.chips}>
        {WANTS.map((x) => <Chip key={x} label={t(`talk.want.${x}`)} selected={want === x} onPress={() => setWant(x)} />)}
      </View>
      {wantNeedsSex ? <T v="caption" c={color.textMute}>{t('talk.wantUnsaid')}</T> : null}
      {changed || !state.sex ? (
        <Button label={t('talk.save')} busy={busy === 'settings'} disabled={!sex || wantNeedsSex}
          onPress={() => sex && run('settings', () => backend.talkSettings(sex, want))} />
      ) : null}
    </Fold>
  );

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.gold}>{t('talk.personTitle')}</T>
        <T v="display">{t('talk.personOpen')}</T>
      </View>
      {state.call ? <CallPanel talk={state} busy={busy} error={callOpen ? error : ''} run={run} route={ROUTE} /> : null}
      {callOpen ? null : about}
      {!callOpen && error ? <ErrorText text={error} /> : null}
      {callOpen ? null : <HelpLines />}
    </>
  );

  // On a call, the panel on the left carries the code; the help lines move here.
  const right = callOpen ? <HelpLines /> : (
    <>
      <Fold icon="clock" title={t('talk.lengthTitle')} value={t('talk.lengthMinutes', { n: free ? FREE_CALL_MINUTES : length })} open={short && !paused}>
        {state.freeCall === 'ready' ? (
          <Chip label={t('talk.useFree')} sub={t('talk.lengthMinutes', { n: FREE_CALL_MINUTES })} selected={free} onPress={() => setUseFree(!useFree)} />
        ) : null}
        {paused ? <T v="caption" c={color.textDim}>{t(state.freeCall === 'ready' ? 'paused.listeners' : 'paused.listenersLocked')}</T> : null}
        {free || paused ? null : (
          <>
            <View style={styles.chips}>
              {CALL_LENGTHS.map((n) => <Chip key={n} label={t('talk.lengthMinutes', { n })} selected={length === n} onPress={() => setLength(n)} />)}
            </View>
            <T v="caption" c={color.textDim}>{t('talk.lengthHold', { n: fmtNumber(hold) })}</T>
            {short ? (
              <View style={styles.row}>
                <T v="caption" c={color.flare} style={{ flex: 1 }}>{t('talk.needBought', { n: fmtNumber(state.paid) })}</T>
                <Button kind="ghost" icon="plus" label={t('talk.topUp')} onPress={() => router.push('/wallet')} />
              </View>
            ) : null}
          </>
        )}
        <T v="label" c={color.textDim}>{t('talk.topicsTitle')}</T>
        <View style={styles.chips}>
          {TOPICS.map((x) => <Chip key={x} label={t(`talk.topics.${x}`)} selected={topics.includes(x)} onPress={() => toggle(x)} />)}
        </View>
      </Fold>

      <View style={panel}>
        <T v="heading">{t('talk.listenersTitle')}</T>
        {!state.open.voice ? <T v="caption" c={color.textDim}>{t('talk.voiceOff')}</T> : null}
        {listError ? <ErrorText text={listError} /> : null}
        {!state.sex ? null : sorted && !sorted.length ? (
          <>
            <T c={color.textDim}>{t('talk.listenersNone')}</T>
            <Button kind="ghost" icon="cpu" label={t('talk.aiOpen')} onPress={() => router.push('/talk/ai')} />
          </>
        ) : (sorted ?? []).map((l) => (
          <View key={l.id} style={styles.listener}>
            <View style={styles.row}>
              <Feather name="user" size={18} color={color.gold} />
              <T v="bodyBold" style={{ flex: 1 }}>{l.firstName}</T>
              <T v="caption" c={color.textMute}>{t('talk.listenerCalls', { count: l.calls })}</T>
            </View>
            <T v="caption" c={color.textDim}>{l.topics.map((x) => t(`talk.topics.${x}`)).join(' · ')}</T>
            <Button kind={free ? 'primary' : 'ghost'} icon="phone" label={free ? t('talk.callFree', { name: l.firstName }) : t('talk.call', { name: l.firstName })}
              busy={busy === `call:${l.id}`} disabled={!state.open.voice || short || (paused && !free) || !!busy}
              onPress={() => run(`call:${l.id}`, () => backend.talkCall(l.id, length, free)).then((ok) => { if (!ok) backend.talkListeners().then(setList, quiet('talk.list')); })} />
          </View>
        ))}
      </View>
    </>
  );

  return (
    <Screen back="back" title={t('talk.personTitle')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  listener: { gap: space.sm, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: color.line },
});
