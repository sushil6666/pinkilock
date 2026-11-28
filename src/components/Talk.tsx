/**
 * Talk mode (D108): the parts its pages share. The state (from the backend, again while a call is
 * on), the help lines, the entry on Me, and the call panel both sides see. What can happen is
 * decided on the server (talk_state and its siblings); this file only shows what it says. Nothing
 * here links to Spicy mode, and nothing here is logged but codes and routes.
 */
import { Entry } from './ui/Entry';
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { GOOD_CALL_MINUTES, LISTENER_CODE, TALK_BEAT_SECONDS, TALK_REPORT_REASONS, emptyTalk, type Talk, type TalkReportReason } from '../domain/talk';
import { haptic } from '../lib/haptics';
import { quiet } from '../lib/log';
import { shown } from '../lib/report';
import { askForReview } from '../lib/review';
import { joinVoice, type VoiceCall } from '../lib/voice';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { fmtNumber, fmtTime, t } from '../i18n';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

export const panel = { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md } as const;

/** Talk mode's state, fresh when the page comes into view, and every few seconds while a call rings or runs. */
export function useTalk(route: string) {
  const [state, setState] = useState<Talk | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const load = useCallback(() => backend.talk().then(setState, (e) => setError(shown(e, route))), [route]);
  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));
  const run = useCallback(async (what: string, work: () => Promise<Talk>): Promise<boolean> => {
    setBusy(what);
    setError('');
    try {
      setState(await work());
      haptic.tick();
      return true;
    } catch (e) {
      haptic.warning();
      setError(shown(e, route));
      return false;
    } finally {
      setBusy('');
    }
  }, [route]);
  return { state: state ?? emptyTalk(), loaded: !!state, error, busy, run, setState, reload: load };
}

/** While a call rings or runs: check in every TALK_BEAT_SECONDS (live) or look again (ringing, or waiting for a caller). */
export function useCallTimer(talk: Talk, setState: (t: Talk) => void, watching: boolean) {
  const call = talk.call;
  const live = call?.status === 'live';
  const open = !!call && call.status !== 'done';
  const id = call?.id;
  useEffect(() => {
    if (!open && !watching) return;
    const every = live ? TALK_BEAT_SECONDS * 1000 : 3000;
    const tick = () => (live && id ? backend.talkBeat(id) : backend.talk()).then(setState, quiet('talk.tick'));
    if (live) void tick();
    const timer = setInterval(tick, every);
    return () => clearInterval(timer);
  }, [open, live, id, watching, setState]);
}

/** Tele-MANAS and 112, always within reach in Talk mode. */
export function HelpLines({ strong }: { strong?: boolean }) {
  const call = (n: string) => Linking.openURL(`tel:${n}`).catch(quiet('talk.call'));
  return (
    <View style={[styles.help, strong && styles.helpStrong]} accessibilityRole="summary">
      <View style={styles.row}>
        <Feather name="life-buoy" size={18} color={strong ? color.flare : color.gold} />
        <T v="bodyBold" style={{ flex: 1 }}>{strong ? t('talk.harmTitle') : t('talk.helpTitle')}</T>
      </View>
      <T v="caption" c={color.textDim}>{strong ? t('talk.harmBody') : t('talk.helpBody')}</T>
      <View style={styles.row}>
        <Button kind={strong ? 'primary' : 'ghost'} icon="phone" label={t('talk.helpCall')} onPress={() => call('14416')} />
        <Button kind="ghost" icon="phone" label={t('talk.helpEmergency')} onPress={() => call('112')} />
      </View>
    </View>
  );
}

/** On Me, next to Self love. */
export function TalkEntry() {
  return <Entry icon={<Feather name="message-circle" size={20} color={color.moon} />} title={t('talk.meTitle')} spoken={t('talk.meOpen')} onPress={() => router.push('/talk')} />;
}

/** The listener code, as both sides see it. */
export function ListenerCode() {
  return (
    <View style={{ gap: space.sm }}>
      <T v="label" c={color.textDim}>{t('talk.codeTitle')}</T>
      {LISTENER_CODE.map((k) => (
        <View key={k} style={styles.row}>
          <Feather name="check" size={14} color={color.gold} />
          <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t(`talk.code.${k}`)}</T>
        </View>
      ))}
    </View>
  );
}

/**
 * A call, from either side: ringing, live (the timer, hang up, report, block), or just ended (what
 * was charged). A good call that ended normally may show the store's review prompt (D110).
 */
export function CallPanel({ talk, busy, error, run, route }: {
  talk: Talk; busy: string; error: string; route: string; run: (what: string, work: () => Promise<Talk>) => Promise<boolean>;
}) {
  const call = talk.call;
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState<TalkReportReason | null>(null);
  const [voice, setVoice] = useState<'off' | 'on' | null>(null);
  const [muted, setMuted] = useState(false);
  const room = useRef<VoiceCall | null>(null);
  const asked = useRef<string | null>(null);
  const id = call?.id;
  const live = call?.status === 'live';
  // The sound (D111's src/lib/voice.ts): joined while the call is live, left when it is not.
  useEffect(() => {
    if (!live || !id) return;
    let gone = false;
    backend.talkVoice(id).then(async (v) => {
      if (!v || gone) return setVoice(v ? null : 'off');
      const joined = await joinVoice(v, { onState: (s) => s === 'ended' && setVoice(null) });
      if (gone) return joined.leave();
      room.current = joined;
      setVoice('on');
    }).catch((e) => {
      quiet('talk.voice')(e);
      setVoice('off');
    });
    return () => {
      gone = true;
      const r = room.current;
      room.current = null;
      setMuted(false);
      if (r) r.leave().catch(quiet('talk.voice.leave'));
    };
  }, [live, id]);
  const mute = () => {
    const r = room.current;
    if (!r) return;
    r.mute(!muted).then(() => setMuted(!muted), quiet('talk.voice.mute'));
  };
  useEffect(() => {
    if (call?.status === 'done' && call.end === 'talked' && !call.listening && call.together >= GOOD_CALL_MINUTES && asked.current !== call.id) {
      asked.current = call.id;
      void askForReview('good_call');
    }
  }, [call]);
  if (!call) return null;
  const name = call.name;

  if (call.status === 'done') {
    return (
      <View style={[panel, styles.callDone]}>
        <T v="heading">{t(`talk.done.${call.end ?? 'talked'}`)}</T>
        {call.together > 0 ? <T c={color.textDim}>{t('talk.minutes', { count: call.together })}</T> : null}
        {!call.listening ? (
          <T v="caption" c={color.textDim}>
            {call.free ? t('talk.doneFree') : call.charged ? t('talk.doneCharged', { n: fmtNumber(call.charged), back: fmtNumber(call.refunded) }) : t('talk.doneNothing')}
          </T>
        ) : null}
        {call.end !== 'reported' && call.end !== 'blocked' ? (
          <View style={styles.row}>
            <Chip label={t('talk.report')} onPress={() => setReporting(true)} />
            <Chip label={t('talk.block')} onPress={() => run('block', () => backend.talkBlock(call.id))} />
          </View>
        ) : null}
        {reporting ? <ReportBox name={name} reason={reason} setReason={setReason} busy={busy === 'report'} onCancel={() => setReporting(false)}
          onSend={() => reason && run('report', () => backend.talkReport(call.id, reason)).then((ok) => ok && setReporting(false))} /> : null}
        {error ? <ErrorText text={error} /> : null}
      </View>
    );
  }

  if (call.status === 'ringing') {
    return (
      <View style={[panel, styles.callLive]}>
        <Feather name="phone-call" size={26} color={color.gold} />
        <T v="title">{call.listening ? t('talk.incoming', { name }) : t('talk.ringing', { name })}</T>
        <T c={color.textDim}>{call.listening ? t('talk.incomingBody', { n: call.length }) : t('talk.ringingBody')}</T>
        {call.listening ? (
          <View style={styles.row}>
            <Button icon="phone" label={t('talk.pickUp')} busy={busy === 'answer'} onPress={() => run('answer', () => backend.talkAnswer(call.id, true))} />
            <Button kind="ghost" label={t('talk.notNow')} busy={busy === 'decline'} onPress={() => run('decline', () => backend.talkAnswer(call.id, false))} />
          </View>
        ) : (
          <Button kind="ghost" label={t('talk.cancel')} busy={busy === 'end'} onPress={() => run('end', () => backend.talkEnd(call.id))} />
        )}
        {error ? <ErrorText text={error} /> : null}
      </View>
    );
  }

  return (
    <View style={[panel, styles.callLive]}>
      <View style={styles.row}>
        <View style={[styles.dot, call.theyHere && styles.dotOn]} />
        <T v="label" c={call.theyHere ? color.gold : color.textDim}>{call.theyHere ? t('talk.theyHere', { name }) : t('talk.theyAway', { name })}</T>
        {call.free ? <T v="label" c={color.pink}>{t('talk.liveFree')}</T> : null}
      </View>
      <T v="title">{t('talk.live', { name })}</T>
      <T v="display" c={color.gold}>{t('talk.minutes', { count: call.together })}</T>
      <T v="caption" c={color.textDim}>{t('talk.ofLength', { n: call.length })}</T>
      <T v="caption" c={color.textDim}>{t('talk.liveBody')}</T>
      {voice === 'off' ? <T v="caption" c={color.textMute}>{t('talk.voiceStub')}</T> : null}
      {voice === 'on' ? <Chip label={t(muted ? 'calls.unmute' : 'calls.mute')} selected={muted} onPress={mute} /> : null}
      <Button kind="danger" icon="phone-off" label={t('talk.hangUp')} busy={busy === 'end'} onPress={() => run('end', () => backend.talkEnd(call.id))} />
      <View style={styles.row}>
        <Chip label={t('talk.report')} onPress={() => setReporting(true)} />
        <Chip label={t('talk.block')} onPress={() => run('block', () => backend.talkBlock(call.id))} />
      </View>
      {reporting ? <ReportBox name={name} reason={reason} setReason={setReason} busy={busy === 'report'} onCancel={() => setReporting(false)}
        onSend={() => reason && run('report', () => backend.talkReport(call.id, reason)).then((ok) => ok && setReporting(false))} /> : null}
      {error ? <ErrorText text={error} /> : null}
      <ListenerCode />
    </View>
  );
}

function ReportBox({ name, reason, setReason, busy, onSend, onCancel }: {
  name: string; reason: TalkReportReason | null; setReason: (r: TalkReportReason) => void; busy: boolean; onSend: () => void; onCancel: () => void;
}) {
  return (
    <View style={styles.report}>
      <T v="bodyBold">{t('talk.reportTitle')}</T>
      <T v="caption" c={color.textDim}>{t('talk.reportBody', { name })}</T>
      <View style={styles.chips}>
        {TALK_REPORT_REASONS.map((r) => <Chip key={r} label={t(`talk.reasons.${r}`)} selected={reason === r} onPress={() => setReason(r)} />)}
      </View>
      <View style={styles.row}>
        <Button kind="danger" label={t('talk.sendReport')} disabled={!reason} busy={busy} onPress={onSend} />
        <Button kind="ghost" label={t('talk.cancel')} onPress={onCancel} />
      </View>
    </View>
  );
}

/** "Until 9:40 pm". */
export const until = (at: number) => fmtTime(at);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  help: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.sm },
  helpStrong: { borderColor: color.flare, backgroundColor: color.surfaceHi },
  entry: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, marginTop: space.md },
  callLive: { borderColor: color.goldDeep, backgroundColor: color.goldWash, alignItems: 'flex-start' },
  callDone: { alignItems: 'flex-start' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.textMute },
  dotOn: { backgroundColor: color.gold },
  report: { gap: space.sm, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: color.line, alignSelf: 'stretch' },
});
