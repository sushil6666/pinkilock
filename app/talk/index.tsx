/**
 * Talk to someone (D108): the way in. The AI companion (always labelled AI) and a real listener by
 * voice, side by side, with the free first call (D109) and how to open it: a friend who joins with
 * my link, or a finished profile. Never a rating. The help lines are always on the page. Nothing
 * here is shown to anyone else, and nothing links to Spicy mode.
 */
import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { HelpLines, panel, until, useTalk } from '@/components/Talk';
import { Button } from '@/components/ui/Button';
import { Columns } from '@/components/ui/Columns';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { AI_PASS, AI_PER_MINUTE, FREE_CALL_MINUTES, LISTENER_PER_MINUTE } from '@/domain/talk';
import { shareOrCopy } from '@/lib/shareOrCopy';
import { backend } from '@/services';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

const ROUTE = '/talk';

export default function TalkHub() {
  const { state, error, busy, run } = useTalk(ROUTE);
  const [copied, setCopied] = useState(false);
  const pass = state.passUntil && state.passUntil > Date.now() ? state.passUntil : null;
  const free = state.freeCall === 'ready';

  const share = async () => {
    if (!state.referralCode) return;
    const path = `/r/${state.referralCode}`;
    const link = Platform.OS === 'web' ? `${window.location.origin}${path}` : Linking.createURL(path);
    setCopied((await shareOrCopy(t('talk.shareText', { url: link }))) === 'copied');
  };

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.moon}>{t('talk.eyebrow')}</T>
        <T v="display">{t('talk.title')}</T>
        <T c={color.textDim}>{t('talk.intro')}</T>
      </View>

      <Animated.View entering={FadeInDown.duration(320)} style={[panel, styles.ai]}>
        <View style={styles.row}>
          <Feather name="cpu" size={20} color={color.moon} />
          <T v="heading" style={{ flex: 1 }}>{t('talk.aiTitle')}</T>
          <View style={styles.badge}><T v="label" c={color.moon}>{t('talk.aiLabel')}</T></View>
        </View>
        <T c={color.textDim}>{t('talk.aiBody')}</T>
        <T v="caption" c={color.textDim}>
          {pass ? t('talk.aiPassOn', { time: until(pass) }) : `${t('talk.aiPrice', { n: AI_PER_MINUTE })} ${t('talk.aiPassPrice', { n: AI_PASS })}`}
        </T>
        <View style={styles.row}>
          <Button icon="message-circle" label={t('talk.aiOpen')} onPress={() => router.push('/talk/ai')} />
          {!pass && state.open.ai ? (
            <Button kind="ghost" label={t('talk.aiPass', { n: AI_PASS })} busy={busy === 'pass'} disabled={state.balance < AI_PASS}
              onPress={() => run('pass', () => backend.talkAiPass())} />
          ) : null}
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(320).delay(60)} style={[panel, styles.person]}>
        <View style={styles.row}>
          <Feather name="phone" size={20} color={color.gold} />
          <T v="heading" style={{ flex: 1 }}>{t('talk.personTitle')}</T>
        </View>
        <T c={color.textDim}>{t('talk.personBody')}</T>
        <T v="caption" c={free ? color.pink : color.textDim}>
          {free ? t('talk.personFree', { n: FREE_CALL_MINUTES }) : t('talk.personPrice', { n: LISTENER_PER_MINUTE })}
        </T>
        <Button icon="phone" label={t('talk.personOpen')} onPress={() => router.push('/talk/listeners')} />
      </Animated.View>

      {error ? <ErrorText text={error} /> : null}
      <HelpLines />
    </>
  );

  const right = (
    <>
      <View style={panel}>
        <View style={styles.row}>
          <Feather name={state.freeCall === 'locked' ? 'gift' : 'check-circle'} size={20} color={state.freeCall === 'locked' ? color.pink : color.gold} />
          <T v="heading" style={{ flex: 1 }}>{t('talk.freeTitle')}</T>
        </View>
        {state.freeCall === 'ready' ? (
          <>
            <T c={color.gold}>{t('talk.freeReady', { n: FREE_CALL_MINUTES })}</T>
            {state.freeReason ? <T v="caption" c={color.textDim}>{t(`talk.freeBecause.${state.freeReason}`)}</T> : null}
          </>
        ) : state.freeCall === 'used' ? (
          <T c={color.textDim}>{t('talk.freeUsed')}</T>
        ) : (
          <>
            <T c={color.textDim}>{t('talk.freeHow')}</T>
            <T>{t('talk.freeReferral')}</T>
            {state.friendsJoined ? (
              <T v="caption" c={color.textDim}>
                {t('talk.friends', { count: state.friendsJoined })}{state.friendsVerified < state.friendsJoined ? ` ${t('talk.friendsWaiting')}` : ''}
              </T>
            ) : null}
            <Button kind="ghost" icon="share-2" label={t('talk.copyLink')} disabled={!state.referralCode} onPress={share} />
            {copied ? <T v="caption" c={color.gold}>{t('talk.linkCopied')}</T> : null}
            {backend.demoFriendJoins ? (
              <Button kind="ghost" icon="user-plus" label={t('talk.demoFriend')} busy={busy === 'demo'} onPress={() => run('demo', () => backend.demoFriendJoins!())} />
            ) : null}
            <View style={styles.rule} />
            <T>{t('talk.freeProfile')}</T>
            <Step done={state.profile.face} label={t('talk.freeFace')} onPress={() => router.push('/face')} />
            <Step done={state.profile.handle} label={t('talk.freeHandle')} onPress={() => router.push('/(tabs)/me')} />
            <Step done={state.profile.plans} label={t('talk.freePlans')} onPress={() => router.push('/(tabs)/me')} />
          </>
        )}
      </View>

      <View style={panel}>
        <View style={styles.row}>
          <Feather name="headphones" size={20} color={color.gold} />
          <T v="heading" style={{ flex: 1 }}>{t('talk.listenTitle')}</T>
        </View>
        <T c={color.textDim}>{t('talk.listenBody')}</T>
        <Button kind="ghost" label={t('talk.listenOpen')} onPress={() => router.push('/talk/listen')} />
      </View>

      <View style={styles.note}>
        <Feather name="lock" size={14} color={color.gold} style={{ marginTop: 2 }} />
        <T v="caption" c={color.textDim} style={{ flex: 1 }}>{`${t('talk.private')} ${t('talk.reviewNote')}`}</T>
      </View>
    </>
  );

  return (
    <Screen back="back" title={t('talk.title')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

function Step({ done, label, onPress }: { done: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={done} onPress={onPress} style={({ pressed }) => [styles.step, pressed && { opacity: 0.85 }]}>
      <Feather name={done ? 'check-circle' : 'circle'} size={18} color={done ? color.gold : color.textMute} />
      <T style={{ flex: 1 }} c={done ? color.textDim : color.text}>{label}</T>
      {done ? null : <Feather name="chevron-right" size={18} color={color.textDim} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  ai: { borderColor: color.line, backgroundColor: color.surface },
  person: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
  badge: { borderWidth: 1, borderColor: color.moon, borderRadius: radius.pill, paddingHorizontal: space.sm, paddingVertical: 2 },
  rule: { height: 1, backgroundColor: color.line, marginVertical: space.xs },
  step: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 36 },
  note: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
});
