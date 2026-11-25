/**
 * Spicy mode (D103): off unless the person turns it on. The page says how it works, shows every
 * safety rule, takes the 18+ yes, the rules yes, a Discord username (first choice) or a Telegram
 * username, and boundaries from a list. On, it can be edited, and one tap turns it off and wipes
 * it. The server checks all of it again (save_spicy); this page never decides who sees what.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafetyRules, useMySpicy } from '@/components/Spicy';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Columns } from '@/components/ui/Columns';
import { ErrorText } from '@/components/ui/ErrorText';
import { inputStyle } from '@/components/ui/input';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { BOUNDARIES, type Boundary } from '@/domain/spicy';
import { haptic } from '@/lib/haptics';
import { shown } from '@/lib/report';
import { aria } from '@/lib/web';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

const ROUTE = '/spicy';

export default function SpicyPage() {
  const me = useStore((s) => s.me);
  const [state, setState, loaded] = useMySpicy();
  const [linked, setLinked] = useState(true);
  const [discord, setDiscord] = useState('');
  const [telegram, setTelegram] = useState('');
  const [signal, setSignal] = useState('');
  const [bounds, setBounds] = useState<Boundary[]>([]);
  const [adult, setAdult] = useState(false);
  const [rules, setRules] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    backend.account().then((a) => setLinked(!!(a.phone || a.email)), () => setLinked(true));
  }, []);
  // The form starts from what is saved, each time it loads.
  useEffect(() => {
    if (!loaded) return;
    setDiscord(state.discord ?? '');
    setTelegram(state.telegram ? `@${state.telegram}` : '');
    setSignal(state.signal ?? '');
    setBounds(state.boundaries);
    setAdult(state.on);
    setRules(state.on);
  }, [loaded, state]);
  if (!me) return null;

  const run = async (what: string, work: () => Promise<void>) => {
    setBusy(what);
    setError('');
    setNote('');
    try {
      await work();
    } catch (e) {
      haptic.warning();
      setError(shown(e, ROUTE));
    }
    setBusy('');
  };
  const save = () => run('save', async () => {
    setState(await backend.saveSpicy({ adult, rules, discord, telegram, signal, boundaries: bounds }));
    haptic.success();
  });
  const off = () => run('off', async () => {
    setState(await backend.spicyOff());
    setAdult(false);
    setRules(false);
    setNote(t('spicy.offDone'));
    haptic.tick();
  });
  const toggle = (b: Boundary) => setBounds((list) => (list.includes(b) ? list.filter((x) => x !== b) : [...list, b]));

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.pink}>{t('spicy.eyebrow')}</T>
        <T v="display">{t('spicy.title')}</T>
        <T c={color.textDim}>{t('spicy.intro')}</T>
      </View>

      {state.on ? (
        <Animated.View entering={FadeInDown.duration(300)} style={[styles.panel, styles.on]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <Feather name="zap" size={20} color={color.pink} />
            <T v="heading" style={{ flex: 1 }}>{t('spicy.onTitle')}</T>
          </View>
          <T c={color.textDim}>{t('spicy.onBody')}</T>
          <Button kind="danger" icon="power" label={t('spicy.turnOff')} busy={busy === 'off'} onPress={off} />
        </Animated.View>
      ) : null}

      <View style={styles.panel}>
        <T v="heading">{t('spicy.howTitle')}</T>
        {(['how1', 'how2', 'how3', 'how4'] as const).map((k, i) => (
          <View key={k} style={styles.step}>
            <View style={styles.num}><T v="bodyBold" c={color.onPink} center>{i + 1}</T></View>
            <T style={{ flex: 1 }}>{t(`spicy.${k}`)}</T>
          </View>
        ))}
      </View>

      <View style={[styles.panel, styles.rules]}>
        <T v="heading">{t('spicy.rulesTitle')}</T>
        <T v="caption" c={color.textDim}>{t('spicy.rulesBody')}</T>
        <SafetyRules />
      </View>
    </>
  );

  const right = (
    <>
      <View style={styles.panel}>
        <T v="heading">{t('spicy.whereTitle')}</T>
        <T v="label" c={color.textDim}>{t('spicy.discordLabel')}</T>
        <TextInput value={discord} onChangeText={setDiscord} autoCapitalize="none" autoCorrect={false} maxLength={40} placeholder={t('spicy.discordPlaceholder')}
          accessibilityLabel={t('spicy.discordLabel')} placeholderTextColor={color.textMute} style={inputStyle} />
        <T v="label" c={color.textDim}>{t('spicy.telegramLabel')}</T>
        <TextInput value={telegram} onChangeText={setTelegram} autoCapitalize="none" autoCorrect={false} maxLength={60} placeholder={t('spicy.telegramPlaceholder')}
          accessibilityLabel={t('spicy.telegramLabel')} placeholderTextColor={color.textMute} style={inputStyle} />
        <T v="label" c={color.textDim}>{t('spicy.signalLabel')}</T>
        <TextInput value={signal} onChangeText={setSignal} autoCapitalize="none" autoCorrect={false} maxLength={45} placeholder={t('spicy.signalPlaceholder')}
          accessibilityLabel={t('spicy.signalLabel')} placeholderTextColor={color.textMute} style={inputStyle} />
        <View style={styles.step}>
          <Feather name="lock" size={16} color={color.gold} style={{ marginTop: 2 }} />
          <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('spicy.signalTip')}</T>
        </View>
        <View style={styles.step}>
          <Feather name="phone-off" size={16} color={color.flare} style={{ marginTop: 2 }} />
          <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('spicy.noPhone')}</T>
        </View>
      </View>

      <View style={styles.panel}>
        <T v="heading">{t('spicy.boundTitle')}</T>
        <T v="caption" c={color.textDim}>{t('spicy.boundBody')}</T>
        <View style={styles.chips}>
          {BOUNDARIES.map((b) => <Chip key={b} label={t(`spicy.boundaries.${b}`)} selected={bounds.includes(b)} onPress={() => toggle(b)} />)}
        </View>
      </View>

      <View style={styles.panel}>
        <Tick on={adult} label={t('spicy.adult')} onPress={() => setAdult((v) => !v)} />
        <Tick on={rules} label={t('spicy.agree')} onPress={() => setRules((v) => !v)} />
        {!linked ? (
          <>
            <T v="caption" c={color.flare}>{t('spicy.needsAccount')}</T>
            <Button kind="ghost" icon="mail" label={t('spicy.addAccount')} onPress={() => router.push('/account/sign-in')} />
          </>
        ) : null}
        {error ? <ErrorText text={error} /> : null}
        {note ? <T v="caption" c={color.gold}>{note}</T> : null}
        <Button icon="zap" label={t(state.on ? 'spicy.save' : 'spicy.turnOn')} busy={busy === 'save'} disabled={!adult || !rules || !(discord.trim() || telegram.trim() || signal.trim())} onPress={save} />
      </View>
    </>
  );

  return (
    <Screen back="back" title={t('spicy.title')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

function Tick({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} {...aria({ checked: on })} accessibilityLabel={label} onPress={() => { haptic.tick(); onPress(); }} style={styles.tick}>
      <View style={[styles.box, on && styles.boxOn]}>{on ? <Feather name="check" size={16} color={color.onGold} /> : null}</View>
      <T style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md },
  on: { borderColor: color.pinkDeep, backgroundColor: color.pinkWash },
  rules: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
  step: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  num: { width: 26, height: 26, borderRadius: radius.pill, backgroundColor: color.pink, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tick: { flexDirection: 'row', gap: space.md, alignItems: 'center', minHeight: 44 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: color.textMute, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.gold, borderColor: color.gold },
});
