/**
 * The AI companion (D108). Always called AI: in the title, on every reply, and in a line that
 * never scrolls away. "Talk to a real person" is one tap from anywhere on the page. A mention of
 * self-harm (on the server, the same list as src/domain/talk.ts) brings up the help lines and
 * makes the rest of this chat free and warm. The chat lives only in this page's memory: leaving it,
 * it goes. The tone (D113, warm or flirty) is this phone's choice, kept between visits.
 *
 * Sessions (D114): 60 credits for up to 15 minutes, paid before the first message. In the last
 * 2 minutes, or once the time is up, continue for another 15 from the wallet, or add credits and
 * continue; the chat stays on this page while that happens. Never asked of a chat that has
 * mentioned self-harm, or while a day pass bought earlier still runs.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { HelpLines, panel, until, useTalk } from '@/components/Talk';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { inputStyle } from '@/components/ui/input';
import { AppError } from '@/domain/errors';
import {
  AI_MESSAGES_PER_DAY, AI_MESSAGE_MAX, AI_SESSION_CREDITS, AI_SESSION_MINUTES, AI_TONES, aiHistory, aiMayContinue, aiMayTalk, aiMinutesLeft, aiToneFor, checkAiMessage, mentionsHarm,
  packToContinue, type AiTone, type AiTurn,
} from '@/domain/talk';
import type { TopUpStatus } from '@/domain/wallet';
import { haptic } from '@/lib/haptics';
import { quiet } from '@/lib/log';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

const ROUTE = '/talk/ai';
const TONE_KEY = 'pinkilock.talk.tone';
const PRICE = { n: AI_SESSION_CREDITS, m: AI_SESSION_MINUTES };

export default function TalkAi() {
  const { state, reload } = useTalk(ROUTE);
  const [turns, setTurns] = useState<AiTurn[]>(() => [{ role: 'ai', text: t('talk.aiHello') }]);
  const [chat, setChat] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [harm, setHarm] = useState(false);
  const [today, setToday] = useState<number | null>(null);
  const [error, setError] = useState('');
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [picked, setPicked] = useState<AiTone>('warm');
  useEffect(() => {
    AsyncStorage.getItem(TONE_KEY).then((v) => setPicked(aiToneFor(v, false)), quiet('talk.tone'));
  }, []);
  const pickTone = (x: AiTone) => {
    setPicked(x);
    AsyncStorage.setItem(TONE_KEY, x).catch(quiet('talk.tone'));
  };
  const tone = aiToneFor(picked, harm);
  const [paidUntil, setPaidUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [buying, setBuying] = useState('');
  const [topUps, setTopUps] = useState<TopUpStatus>({ open: false, test: false });
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    backend.topUpStatus().then(setTopUps, quiet('talk.topups'));
    return () => clearInterval(id);
  }, []);
  const pass = state.passUntil && state.passUntil > now ? state.passUntil : null;
  const free = state.freeCall === 'ready';
  const unpaid = !harm && !pass;
  const mayTalk = aiMayTalk({ passUntil: pass, harm, paidUntil }, now);
  const mayContinue = unpaid && aiMayContinue(paidUntil, now);
  const left = aiMinutesLeft(paidUntil, now);
  // A Pink Gold member's free session this month (D116) needs no credits.
  const goldFree = !!useStore((s) => s.wallet?.saathiFree);
  const pack = goldFree ? undefined : packToContinue(state.balance);

  // Start, or continue, a session. The chat (and everything said in it) stays as it is.
  const session = async (topUp?: string) => {
    if (buying) return;
    setBuying(topUp ?? 'session');
    setError('');
    try {
      if (topUp) await backend.topUp(topUp);
      const r = await backend.talkAiSession(chat);
      setChat(r.chat);
      setPaidUntil(r.paidUntil);
      setNow(Date.now());
      haptic.success();
    } catch (e) {
      haptic.warning();
      setError(shown(e, ROUTE));
    } finally {
      setBuying('');
      void reload();
      useStore.getState().loadWallet().catch(quiet('talk.wallet'));
    }
  };

  const send = async () => {
    if (sending) return;
    setError('');
    let body: string;
    try {
      body = checkAiMessage(text);
    } catch (e) {
      setError(shown(e, ROUTE));
      return;
    }
    // No time paid: say so here. A message about self-harm still goes, and makes the chat free.
    if (!mayTalk && !mentionsHarm(body)) {
      setError(t(paidUntil === null ? 'talk.sessionFirst' : 'talk.sessionOver', PRICE));
      return;
    }
    const before = turns;
    setTurns([...before, { role: 'me', text: body }]);
    setText('');
    setSending(true);
    try {
      // The opening hello is the page's, not the model's: only what was really said goes with the message.
      const r = await backend.talkAi(chat, aiHistory(before.slice(1)), body, tone);
      setChat(r.chat);
      setPaidUntil(r.paidUntil);
      setTurns((was) => [...was, { role: 'ai', text: r.reply }]);
      if (r.harm) {
        setHarm(true);
        haptic.warning();
      }
      setToday((n) => (n ?? state.aiToday) + 1);
      if (r.charged) void reload();
    } catch (e) {
      setTurns(before);
      setText(body);
      // The time ran out while writing: show the way to continue, keep what was written.
      if (e instanceof AppError && e.code === 'PL181') setPaidUntil((p) => Math.min(p ?? 0, Date.now()));
      setError(shown(e, ROUTE));
      void reload();
    } finally {
      setSending(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const cost = harm ? t('talk.aiFree') : pass ? `${t('talk.aiPassActive')} ${t('talk.aiPassOn', { time: until(pass) })}`
    : paidUntil && left > 0 ? t('talk.sessionLeft', { count: left }) : t('talk.aiCost', PRICE);

  // Before the first session, near the end of one, or after it: pay from the wallet, or add credits and go on.
  const pay = mayContinue && state.open.ai ? (
    <View style={[panel, styles.pay]}>
      {goldFree ? <T v="caption" c={color.pink}>{t('gold.saathiFree', { m: AI_SESSION_MINUTES })}</T> : (
        <T v="caption" c={paidUntil === null ? color.textDim : color.gold}>
          {paidUntil === null ? t('talk.sessionFirst', PRICE) : left > 0 ? t('talk.sessionEnding', PRICE) : t('talk.sessionOver', PRICE)}
        </T>
      )}
      {pack ? (
        <>
          <T v="caption" c={color.flare}>{t('talk.sessionShort', { n: state.balance })}</T>
          {topUps.open ? (
            <>
              <Button icon="plus" label={t('talk.sessionRecharge', { rupees: pack.rupees })} busy={buying === pack.id} disabled={!!buying}
                onPress={() => session(pack.id)} />
              <T v="caption" c={color.textMute}>{t('talk.sessionPack', { credits: pack.credits, n: AI_SESSION_CREDITS })}</T>
            </>
          ) : <Button kind="ghost" icon="credit-card" label={t('talk.sessionWallet')} onPress={() => router.push('/wallet')} />}
          {paidUntil !== null ? <T v="caption" c={color.textMute}>{t('talk.sessionKept')}</T> : null}
        </>
      ) : (
        <Button icon={paidUntil === null ? 'message-circle' : 'clock'} busy={buying === 'session'} disabled={!!buying}
          label={goldFree ? t('gold.saathiStart') : paidUntil === null ? t('talk.sessionStart', PRICE) : t('talk.sessionContinue', { n: AI_SESSION_CREDITS })} onPress={() => session()} />
      )}
    </View>
  ) : null;

  const footer = (
    <View style={{ gap: space.sm }}>
      <View style={styles.label}>
        <Feather name="cpu" size={14} color={color.moon} />
        <T v="caption" c={color.moon} style={{ flex: 1 }}>{t('talk.aiNotPerson')}</T>
      </View>
      {pay}
      {state.open.ai ? (
        <View style={styles.compose}>
          <TextInput value={text} onChangeText={setText} placeholder={t('talk.aiPlaceholder')} placeholderTextColor={color.textMute} maxLength={AI_MESSAGE_MAX}
            multiline style={[inputStyle, styles.input]} accessibilityLabel={t('talk.aiPlaceholder')} onSubmitEditing={send} blurOnSubmit={false} />
          <Button icon="send" label={t('talk.aiSend')} busy={sending} disabled={!text.trim()} onPress={send} />
        </View>
      ) : <T v="caption" c={color.textDim}>{t('talk.aiOff')}</T>}
      {error ? <ErrorText text={error} /> : null}
      <Button kind="ghost" icon="phone" label={free ? t('talk.toPersonFree') : t('talk.toPerson')} onPress={() => router.push('/talk/listeners')} />
    </View>
  );

  return (
    <Screen back="back" title={t('talk.aiTitle')} footer={footer} desk="read" scroll={false}>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={styles.list} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
        <View style={[panel, styles.head]}>
          <View style={styles.label}>
            <Feather name="cpu" size={18} color={color.moon} />
            <T v="heading" style={{ flex: 1 }}>{t('talk.aiTitle')}</T>
            <View style={styles.badge}><T v="label" c={color.moon}>{t('talk.aiLabel')}</T></View>
          </View>
          <T v="caption" c={color.textDim}>{`${cost} ${t('talk.aiWords')}`}</T>
          <View style={styles.label}>
            <T v="label" c={color.textDim}>{t('talk.toneTitle')}</T>
            {AI_TONES.map((x) => <Chip key={x} label={t(`talk.tones.${x}`)} selected={tone === x} disabled={harm} onPress={() => pickTone(x)} />)}
          </View>
          <T v="caption" c={color.textDim}>{harm ? t('talk.toneHarm') : tone === 'flirty' ? t('talk.toneFlirty') : t('talk.toneWarm')}</T>
          <T v="caption" c={color.textMute}>{t('talk.aiToday', { n: today ?? state.aiToday, max: AI_MESSAGES_PER_DAY })}</T>
        </View>
        {turns.map((x, i) => (
          <View key={i} style={[styles.bubble, x.role === 'me' ? styles.me : styles.them]}>
            <T v="label" c={x.role === 'me' ? color.gold : color.moon}>{x.role === 'me' ? t('talk.aiYou') : t('talk.aiThem')}</T>
            <T>{x.text}</T>
          </View>
        ))}
        {sending ? <T v="caption" c={color.textMute} style={{ alignSelf: 'flex-start' }}>{t('talk.aiThinking')}</T> : null}
        {harm ? <HelpLines strong /> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md, paddingVertical: space.md },
  head: { gap: space.sm },
  label: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  badge: { borderWidth: 1, borderColor: color.moon, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  bubble: { maxWidth: '86%', borderRadius: radius.card, padding: space.md, gap: 2, borderWidth: 1 },
  me: { alignSelf: 'flex-end', backgroundColor: color.goldWash, borderColor: color.goldDeep },
  them: { alignSelf: 'flex-start', backgroundColor: color.surface, borderColor: color.line },
  pay: { gap: space.sm, paddingVertical: space.md },
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: { flex: 1, minHeight: 56, maxHeight: 140, paddingVertical: space.md },
});
