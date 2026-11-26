/**
 * The AI companion (D108). Always called AI: in the title, on every reply, and in a line that
 * never scrolls away. "Talk to a real person" is one tap from anywhere on the page. A mention of
 * self-harm (on the server, the same list as src/domain/talk.ts) brings up the help lines and
 * makes the rest of this chat free. The chat lives only in this page's memory: leaving it, it goes.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { HelpLines, panel, until, useTalk } from '@/components/Talk';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { inputStyle } from '@/components/ui/input';
import { AI_MESSAGES_PER_DAY, AI_MESSAGE_MAX, AI_PER_MINUTE, aiHistory, checkAiMessage, type AiTurn } from '@/domain/talk';
import { haptic } from '@/lib/haptics';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

const ROUTE = '/talk/ai';

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
  const pass = state.passUntil && state.passUntil > Date.now() ? state.passUntil : null;
  const free = state.freeCall === 'ready';

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
    const before = turns;
    setTurns([...before, { role: 'me', text: body }]);
    setText('');
    setSending(true);
    try {
      // The opening hello is the page's, not the model's: only what was really said goes with the message.
      const r = await backend.talkAi(chat, aiHistory(before.slice(1)), body);
      setChat(r.chat);
      setTurns((now) => [...now, { role: 'ai', text: r.reply }]);
      if (r.harm) {
        setHarm(true);
        haptic.warning();
      }
      setToday((n) => (n ?? state.aiToday) + 1);
      if (r.charged) void reload();
    } catch (e) {
      setTurns(before);
      setText(body);
      setError(shown(e, ROUTE));
      void reload();
    } finally {
      setSending(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  const cost = harm ? t('talk.aiFree') : pass ? `${t('talk.aiPassActive')} ${t('talk.aiPassOn', { time: until(pass) })}` : t('talk.aiCost', { n: AI_PER_MINUTE });

  const footer = (
    <View style={{ gap: space.sm }}>
      <View style={styles.label}>
        <Feather name="cpu" size={14} color={color.moon} />
        <T v="caption" c={color.moon} style={{ flex: 1 }}>{t('talk.aiNotPerson')}</T>
      </View>
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
  compose: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm },
  input: { flex: 1, minHeight: 56, maxHeight: 140, paddingVertical: space.md },
});
