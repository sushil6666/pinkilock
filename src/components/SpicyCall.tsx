/**
 * Spicy call times (D106), on an unlocked match: pick times and a minimum length, the call once it
 * is set, the in-app timer during it, the question afterwards when the timer could not tell, and
 * how it ended. The server decides every one of those (spicy_call and its siblings); this file shows
 * what it says, and checks in every BEAT_SECONDS while the app is open and in front during the call.
 *
 * Leaving is always allowed: "I felt unsafe or uncomfortable" is on screen for the whole call.
 *
 * D111: the call itself happens here, audio only (src/lib/voice.ts): Join asks the `voice` Edge
 * Function for a microphone-only room, and the server counts the minutes from who was connected.
 * The check-ins keep running underneath, for when nobody could reach the room.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { BEAT_MS, CALL_MINUTES, MAX_SLOTS, SLOT_DAYS, noCall, slotsOn, timerOpen, type CallAnswer, type CallMinutes, type SpicyCall } from '../domain/calls';
import { haptic } from '../lib/haptics';
import { cancelCallReminders, scheduleCallReminders } from '../lib/callReminder';
import { joinVoice, type VoiceCall, type VoiceState } from '../lib/voice';
import { quiet } from '../lib/log';
import { shown } from '../lib/report';
import { backend } from '../services';
import { useStore } from '../state/store';
import { color, radius, space } from '../theme/tokens';
import { fmtDay, fmtTime, fmtWeekday, t } from '../i18n';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

const DAY = 86_400_000;
const when = (at: number) => `${fmtDay(at)}, ${fmtTime(at)}`;

export function SpicyCallPanel({ otherId, name, route, onSettled }: { otherId: string; name: string; route: string; onSettled?: () => void }) {
  const [call, setCall] = useState<SpicyCall>(noCall);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [again, setAgain] = useState(false);
  const block = useStore((s) => s.block);
  // The voice call on this device (D111).
  const voiceRef = useRef<VoiceCall | null>(null);
  const [voice, setVoice] = useState<VoiceState | 'off'>('off');
  const [muted, setMuted] = useState(false);
  const [otherOn, setOtherOn] = useState(false);
  const leaveVoice = useCallback(async () => {
    const v = voiceRef.current;
    voiceRef.current = null;
    setVoice('off');
    setMuted(false);
    setOtherOn(false);
    if (v) await v.leave().catch(quiet('voice.leave'));
  }, []);
  useEffect(() => () => { leaveVoice(); }, [leaveVoice]);

  const load = useCallback(() => backend.spicyCall(otherId).then((c) => { setCall(c); setLoaded(true); }, quiet('calls.load')), [otherId]);
  useEffect(() => { load(); }, [load]);

  const open = call.status === 'set' && call.startsAt !== null && timerOpen(call.startsAt, now);
  const onCall = voice !== 'off' && voice !== 'ended';
  const running = open && (call.myStarted || onCall) && !call.myEnded;
  // The call is over (or I ended it, or it closed): leave the room.
  useEffect(() => {
    if ((!open || call.myEnded) && voiceRef.current) leaveVoice();
  }, [open, call.myEnded, leaveVoice]);

  // A clock for the countdown and the timer window; quicker while the call is near.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), open ? 5000 : 30_000);
    return () => clearInterval(id);
  }, [open]);
  // While the timer is open, refresh what the server says (is the other person here).
  useEffect(() => {
    if (!open) return;
    const id = setInterval(load, BEAT_MS);
    return () => clearInterval(id);
  }, [open, load]);
  // The hour ended: ask again, so the result shows.
  useEffect(() => {
    if (call.status === 'set' && call.startsAt !== null && now >= call.startsAt + 60 * 60_000) load();
  }, [call.status, call.startsAt, now, load]);
  // The check-ins: only while the app is in front, so the timer counts only time with it open.
  const beat = useRef<() => void>(() => undefined);
  beat.current = () => {
    if (AppState.currentState !== 'active') return;
    backend.spicyCallBeat(otherId).then(setCall, quiet('calls.beat'));
  };
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => beat.current(), BEAT_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && beat.current());
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [running]);
  // A call that ended may open the usernames choice: let the Spicy panel ask again.
  const lastOutcome = useRef(call.outcome);
  useEffect(() => {
    if (call.outcome !== lastOutcome.current) {
      lastOutcome.current = call.outcome;
      if (call.outcome) onSettled?.();
    }
  }, [call.outcome, onSettled]);
  // Reminders on this phone, once the call is set.
  useEffect(() => {
    if (!call.id) return;
    if (call.status === 'set' && call.startsAt) scheduleCallReminders(call.id, call.startsAt).catch(quiet('calls.remind'));
    else cancelCallReminders(call.id).catch(quiet('calls.remind'));
  }, [call.id, call.status, call.startsAt]);

  const run = (what: string, work: () => Promise<SpicyCall>) => async () => {
    setBusy(what);
    setError('');
    try {
      setCall(await work());
      setAgain(false);
      haptic.success();
    } catch (e) {
      haptic.warning();
      setError(shown(e, route));
    }
    setBusy('');
  };
  const join = async () => {
    setBusy('start');
    setError('');
    try {
      const room = await backend.spicyVoice(otherId);
      voiceRef.current = await joinVoice(room, {
        onState: (s) => { setVoice(s); if (s === 'ended') voiceRef.current = null; },
        onOther: setOtherOn,
      });
      haptic.success();
      // The check-ins as well, for when the room could not count (they never add to voice minutes).
      backend.spicyCallBeat(otherId).then(setCall, quiet('calls.beat'));
    } catch (e) {
      haptic.warning();
      await leaveVoice();
      setError(shown(e, route));
    }
    setBusy('');
  };
  const mute = async () => {
    const v = voiceRef.current;
    if (!v) return;
    try {
      await v.mute(!muted);
      setMuted(!muted);
    } catch (e) {
      setError(shown(e, route));
    }
  };
  const leave = (unsafe: boolean) => async () => {
    await leaveVoice();
    await run(unsafe ? 'unsafe' : 'end', () => backend.spicyCallEnd(otherId, unsafe))();
  };
  const theyOn = otherOn || call.theyOnCall || (!call.voice && call.theyHere);

  if (!loaded) return null;

  const unsafe = (
    <View style={styles.unsafe}>
      <Button kind="ghost" icon="shield" wrap label={t('calls.unsafe')} busy={busy === 'unsafe'} onPress={leave(true)} />
      <T v="caption" c={color.textDim}>{t('calls.unsafeNote')}</T>
    </View>
  );

  let body: ReactNode;
  if (call.status === 'none' || call.status === 'picking' || (call.status === 'done' && again)) {
    body = <Picker call={call} name={name} busy={busy === 'pick'} onSend={(slots, minutes) => run('pick', () => backend.spicyCallPick(otherId, slots, minutes))()} />;
  } else if (call.status === 'set') {
    body = (
      <>
        <T v="heading">{t('calls.setTitle')}</T>
        <View style={styles.when}>
          <Feather name="phone-call" size={18} color={color.gold} />
          <T v="bodyBold" style={{ flex: 1 }}>{t('calls.setWhen', { time: when(call.startsAt!), n: call.minutes! })}</T>
        </View>
        {call.myMinutes && call.theirMinutes ? <T v="caption" c={color.textDim}>{t('calls.setMinutes', { mine: call.myMinutes, theirs: call.theirMinutes, name, n: call.minutes! })}</T> : null}
        <T c={color.textDim}>{t('calls.timerHow')}</T>
        <T v="caption" c={color.gold}>{t('calls.consent')}</T>
        {open ? (
          <View style={styles.timer}>
            <T v="label" c={color.textDim}>{t('calls.timerTitle')}</T>
            <T v="title" c={color.gold}>{t('calls.together', { n: call.together, total: call.minutes! })}</T>
            <View style={styles.meter}>
              <View style={[styles.meterFill, { flex: Math.min(call.together, call.minutes!) }]} />
              <View style={{ flex: Math.max(call.minutes! - call.together, 0) }} />
            </View>
            <View style={styles.row}>
              <View style={[styles.dot, { backgroundColor: theyOn ? color.gold : color.line }]} />
              <T v="caption" c={color.textDim}>{t(theyOn ? 'calls.theyHere' : 'calls.theyAway', { name })}</T>
            </View>
            {voice === 'connecting' || voice === 'reconnecting' ? <T v="caption" c={color.gold}>{t(voice === 'connecting' ? 'calls.connecting' : 'calls.reconnecting')}</T> : null}
            {call.myEnded ? <T v="caption" c={color.textDim}>{t('calls.ended')}</T>
              : onCall ? (
                <>
                  <Button kind="ghost" icon={muted ? 'mic-off' : 'mic'} label={t(muted ? 'calls.unmute' : 'calls.mute')} onPress={mute} />
                  <Button kind="ghost" icon="phone-off" label={t('calls.end')} busy={busy === 'end'} onPress={leave(false)} />
                  {muted ? <T v="caption" c={color.pink}>{t('calls.muted', { name })}</T> : null}
                  {call.together < call.minutes! ? <T v="caption" c={color.textMute}>{t('calls.endEarlyNote', { n: call.minutes! })}</T> : null}
                </>
              ) : (
                <>
                  <Button icon="phone-call" label={t(call.myStarted ? 'calls.rejoin' : 'calls.start')} busy={busy === 'start'} onPress={join} />
                  {running ? <Button kind="quiet" icon="phone-off" label={t('calls.end')} busy={busy === 'end'} onPress={leave(false)} /> : null}
                </>
              )}
            <View style={styles.row}>
              <Feather name="mic" size={14} color={color.textMute} />
              <T v="caption" c={color.textMute} style={{ flex: 1 }}>{t('calls.voiceOnly')}</T>
            </View>
          </View>
        ) : (
          <>
            <T v="caption" c={color.textDim}>{t('calls.opensAt')}</T>
            {call.canMoveFree ? (
              <>
                <Button kind="quiet" icon="calendar" label={t('calls.move')} busy={busy === 'move'} onPress={run('move', () => backend.spicyCallMove(otherId, false))} />
                <T v="caption" c={color.textMute}>{t('calls.moveNote')}</T>
              </>
            ) : (
              <>
                <Button kind="quiet" wrap label={t('calls.cancelLate')} busy={busy === 'move'} onPress={run('move', () => backend.spicyCallMove(otherId, true))} />
                <T v="caption" c={color.textMute}>{t('calls.cancelLateNote')}</T>
              </>
            )}
          </>
        )}
        {unsafe}
      </>
    );
  } else if (call.status === 'asking') {
    const answer = (a: CallAnswer) => run(a, () => backend.spicyCallAnswer(otherId, a));
    body = (
      <>
        <T v="heading">{t('calls.askTitle')}</T>
        {call.myAnswer ? <T c={color.textDim}>{t('calls.answered', { name })}</T> : (
          <>
            <T c={color.textDim}>{t('calls.askBody', { time: call.answerUntil ? when(call.answerUntil) : '' })}</T>
            <Button kind="ghost" icon="check" wrap label={t('calls.answerTalked', { n: call.minutes ?? 10 })} busy={busy === 'talked'} onPress={answer('talked')} />
            <Button kind="ghost" icon="user-x" wrap label={t('calls.answerTheyMissed', { name })} busy={busy === 'they_missed'} onPress={answer('they_missed')} />
            <Button kind="quiet" wrap label={t('calls.answerIMissed')} busy={busy === 'i_missed'} onPress={answer('i_missed')} />
            <T v="caption" c={color.textMute}>{t('calls.askFair')}</T>
          </>
        )}
      </>
    );
  } else {
    body = (
      <>
        <T v="heading">{t(call.outcome === 'talked' ? 'calls.doneKept' : 'calls.doneTitle')}</T>
        <T c={color.textDim}>{outcomeText(call, name)}</T>
        {call.refunded ? <T c={color.gold}>{t('calls.refunded', { n: call.refunded })}</T> : null}
        {call.outcome === 'unsafe' && call.stoppedByMe ? (
          <View style={{ gap: space.sm }}>
            <Button kind="ghost" icon="flag" label={t('calls.report', { name })} onPress={() => router.push(`/report/${otherId}`)} />
            <Button kind="quiet" icon="slash" label={t('calls.block', { name })} busy={busy === 'block'} onPress={async () => {
              setBusy('block');
              try {
                await block(otherId);
                router.back();
              } catch (e) {
                setError(shown(e, route));
              }
              setBusy('');
            }} />
            <Button kind="quiet" icon="life-buoy" label={t('calls.safety')} onPress={() => router.push('/safety')} />
          </View>
        ) : null}
        {call.callsLeft > 0 && call.outcome !== 'unsafe' ? (
          <>
            <Button kind="ghost" icon="phone-call" label={t('calls.again')} onPress={() => setAgain(true)} />
            <T v="caption" c={color.textMute}>{t('calls.callsLeft', { n: call.callsLeft, name })}</T>
          </>
        ) : null}
      </>
    );
  }

  return (
    <View style={styles.panel}>
      <View style={styles.row}>
        <Feather name="phone" size={16} color={color.gold} />
        <T v="label" c={color.gold}>{t('calls.eyebrow')}</T>
      </View>
      {body}
      {error ? <ErrorText text={error} /> : null}
    </View>
  );
}

function outcomeText(c: SpicyCall, name: string): string {
  switch (c.outcome) {
    case 'talked': return t('calls.outcomeTalked', { n: c.minutes ?? 10 });
    case 'no_show':
    case 'dropped':
    case 'moved_late':
      if (c.fault === 'both') return t('calls.outcomeBoth');
      return c.fault === 'me' ? t(`calls.outcomeMe.${c.outcome}`) : t(`calls.outcomeThem.${c.outcome}`, { name });
    case 'both_missed': return t('calls.outcomeBoth');
    case 'unsafe': return t(c.stoppedByMe ? 'calls.outcomeUnsafeMe' : 'calls.outcomeUnsafeThem');
    case 'disputed': return t('calls.outcomeDisputed');
    case 'unsettled': return t('calls.outcomeUnsettled');
    default: return t('calls.outcomeStopped');
  }
}

/** Times that suit me and my minimum, in one go. Their times show once they picked. */
function Picker({ call, name, busy, onSend }: { call: SpicyCall; name: string; busy: boolean; onSend: (slots: number[], minutes: CallMinutes) => void }) {
  const fresh = call.status !== 'picking';
  const [minutes, setMinutes] = useState<CallMinutes>((!fresh && call.myMinutes) || 15);
  const [picked, setPicked] = useState<number[]>(fresh || call.noOverlap ? [] : call.mySlots);
  const now = Date.now();
  const days = Array.from({ length: SLOT_DAYS }, (_, i) => new Date(now + i * DAY)).filter((d) => slotsOn(d, now).length);
  const [day, setDay] = useState(0);
  const theirs = fresh ? [] : call.theirSlots.filter((s) => s > now + 3_600_000);
  const waiting = !fresh && call.mySlots.length > 0 && !call.noOverlap;
  const toggle = (s: number) => setPicked((p) => (p.includes(s) ? p.filter((x) => x !== s) : p.length >= MAX_SLOTS ? p : [...p, s].sort((a, b) => a - b)));

  if (waiting) {
    return (
      <>
        <T v="heading">{t('calls.pickTitle')}</T>
        <T c={color.textDim}>{t('calls.waiting', { name })}</T>
        <View style={styles.chips}>{call.mySlots.map((s) => <Chip key={s} label={when(s)} selected />)}</View>
        <T v="caption" c={color.textDim}>{t('calls.waitingMinutes', { n: call.myMinutes ?? 15 })}</T>
      </>
    );
  }
  return (
    <>
      <T v="heading">{t('calls.pickTitle')}</T>
      <T c={color.textDim}>{t('calls.intro')}</T>
      {call.noOverlap ? <T c={color.pink}>{t('calls.noOverlap', { name })}</T> : null}

      <T v="label" c={color.textDim}>{t('calls.lengthTitle')}</T>
      <View style={styles.chips}>
        {CALL_MINUTES.map((m) => <Chip key={m} label={t('calls.lengthMinutes', { n: m })} selected={minutes === m} onPress={() => setMinutes(m)} />)}
      </View>
      <T v="caption" c={color.textDim}>{t('calls.lengthNote')}</T>

      {theirs.length ? (
        <>
          <T v="label" c={color.textDim}>{t('calls.theirTimes', { name })}</T>
          <View style={styles.chips}>{theirs.map((s) => <Chip key={s} label={when(s)} selected={picked.includes(s)} onPress={() => toggle(s)} />)}</View>
        </>
      ) : null}

      <T v="label" c={color.textDim}>{t('calls.timesTitle')}</T>
      <View style={styles.chips}>
        {days.map((d, i) => <Chip key={i} label={i === 0 && d.getDate() === new Date(now).getDate() ? t('calls.today') : `${fmtWeekday(d.getTime())} ${d.getDate()}`} selected={day === i} onPress={() => setDay(i)} />)}
      </View>
      <View style={styles.chips}>
        {days[day] ? slotsOn(days[day], now).map((s) => <Chip key={s} label={fmtTime(s)} selected={picked.includes(s)} onPress={() => toggle(s)} />) : null}
      </View>
      <T v="caption" c={color.textDim}>{t('calls.timesNote', { n: MAX_SLOTS })}</T>
      {picked.length ? <T v="caption" c={color.gold}>{t('calls.picked', { n: picked.length, list: picked.map(when).join(' · ') })}</T> : null}
      <Button icon="send" label={t('calls.send')} busy={busy} disabled={!picked.length} onPress={() => onSend(picked, minutes)} />
      <T v="caption" c={color.textMute}>{t('calls.rules')}</T>
    </>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: color.goldDeep, borderRadius: radius.card, backgroundColor: color.goldWash, padding: space.lg, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  when: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  timer: { gap: space.sm, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, alignItems: 'stretch' },
  meter: { flexDirection: 'row', height: 8, borderRadius: radius.pill, backgroundColor: color.surfaceHi, overflow: 'hidden' },
  meterFill: { backgroundColor: color.gold },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  unsafe: { gap: 4, borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.md },
});
