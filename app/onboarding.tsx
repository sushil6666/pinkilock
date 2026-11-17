/**
 * Onboarding in five short steps. It asks for what a micro-date needs and nothing else: a name,
 * proof of being an adult, three things you are up for, a one-liner, and the handle that stays
 * locked until you both show. It ends on the promise, sworn with a hold.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { inputStyle } from '@/components/ui/input';
import { HoldButton } from '@/components/ui/HoldButton';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { IDEAS, VIBES } from '@/domain/ideas';
import type { ContactKind } from '@/domain/types';
import { haptic } from '@/lib/haptics';
import { useStore } from '@/state/store';
import { color, space, type } from '@/theme/tokens';

const PRONOUNS = ['she/her', 'he/him', 'they/them'];
const CONTACTS: ContactKind[] = ['Instagram', 'Snapchat', 'WhatsApp'];
const STEPS = 5;

export default function Onboarding() {
  const complete = useStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [area, setArea] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [ideaIds, setIdeaIds] = useState<string[]>([]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [tagline, setTagline] = useState('');
  const [contactKind, setContactKind] = useState<ContactKind>('Instagram');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const ageNum = Number(age);
  const under18 = age.length >= 2 && ageNum < 18;
  const canNext = [
    true,
    name.trim().length >= 2 && ageNum >= 18 && ageNum <= 99 && area.trim().length >= 2,
    ideaIds.length >= 3,
    handle.trim().length >= 2,
    true,
  ][step];

  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);

  const swear = async () => {
    setBusy(true);
    setError('');
    try {
      await complete({ name: name.trim(), age: ageNum, area: area.trim(), pronouns, tagline: tagline.trim(), vibes, ideaIds, contactKind, contactHandle: handle.trim() });
      haptic.success();
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not save. Try again.');
      setBusy(false);
    }
  };

  const footer = step === 4
    ? <>{error ? <T v="caption" c={color.flare}>{error}</T> : null}<HoldButton label="Hold to swear" onComplete={swear} busy={busy} /></>
    : <Button label={step === 0 ? 'Start' : 'Next'} icon="arrow-right" onPress={() => setStep(step + 1)} disabled={!canNext} />;

  return (
    <Screen back={step > 0 ? 'back' : false} onBack={() => setStep(step - 1)} title={step > 0 ? `${step} of ${STEPS - 1}` : undefined} footer={footer}>
      {step > 0 && (
        <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STEPS - 1, now: step }}>
          {Array.from({ length: STEPS - 1 }, (_, i) => <View key={i} style={[styles.bar, i < step && { backgroundColor: color.pink }]} />)}
        </View>
      )}

      <Animated.View key={step} entering={step === 0 ? FadeInDown.duration(500) : FadeInRight.duration(260)} style={{ gap: space.xl }}>
        {step === 0 && (
          <View style={{ gap: space.xl, paddingTop: space.x5 }}>
            <T v="label" c={color.pink}>Pinkilock</T>
            <T v="mega" style={{ fontSize: 46, lineHeight: 48 }}>No ghosting.{'\n'}No endless{'\n'}swiping.</T>
            <T v="heading" c={color.textDim}>One person. One tiny plan. One pinky promise that you both show up.</T>
            <View style={{ gap: space.md, marginTop: space.lg }}>
              {[['01', 'Send a vibe check: a real plan with a time on it.'], ['02', 'Lock pinkies. Now it is a promise.'], ['03', 'Show up. Unlock each other. Build your record.']].map(([n, line]) => (
                <View key={n} style={styles.rule}>
                  <T v="label" c={color.pink}>{n}</T>
                  <T style={{ flex: 1 }}>{line}</T>
                </View>
              ))}
            </View>
            <Button kind="quiet" icon="log-in" label="I already have an account" onPress={() => router.push({ pathname: '/account/sign-in', params: { mode: 'sign_in' } })} />
          </View>
        )}

        {step === 1 && (
          <>
            <T v="display">Who's{'\n'}showing up?</T>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>First name</T>
              <TextInput value={name} onChangeText={setName} placeholder="Riya" placeholderTextColor={color.textMute} maxLength={24} autoCapitalize="words" autoCorrect={false} style={inputStyle} accessibilityLabel="First name" returnKeyType="next" />
            </View>
            <View style={{ flexDirection: 'row', gap: space.md }}>
              <View style={{ gap: space.sm, width: 104 }}>
                <T v="label" c={color.textDim}>Age</T>
                <TextInput value={age} onChangeText={(t) => setAge(t.replace(/[^0-9]/g, ''))} placeholder="21" placeholderTextColor={color.textMute} keyboardType="number-pad" maxLength={2} style={inputStyle} accessibilityLabel="Age" />
              </View>
              <View style={{ gap: space.sm, flex: 1 }}>
                <T v="label" c={color.textDim}>Your area</T>
                <TextInput value={area} onChangeText={setArea} placeholder="Bandra West" placeholderTextColor={color.textMute} maxLength={28} autoCapitalize="words" style={inputStyle} accessibilityLabel="Your area" />
              </View>
            </View>
            {under18 && <T v="caption" c={color.flare}>Pinkilock is for adults only. You need to be 18 or older.</T>}
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>Pronouns (optional)</T>
              <View style={styles.wrap}>
                {PRONOUNS.map((p) => <Chip key={p} label={p} selected={pronouns === p} onPress={() => setPronouns(pronouns === p ? '' : p)} />)}
              </View>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <View style={{ gap: space.sm }}>
              <T v="display">What are{'\n'}you up for?</T>
              <T c={color.textDim}>Pick at least three. These replace the bio: people ask you out to one of them.</T>
            </View>
            <View style={{ gap: space.sm }}>
              {IDEAS.map((idea) => {
                const on = ideaIds.includes(idea.id);
                return (
                  <Chip key={idea.id} label={`${idea.emoji}  ${idea.title}`} sub={`${idea.minutes} min  /  ${idea.blurb}`} selected={on} onPress={() => toggle(ideaIds, setIdeaIds, idea.id, 6)} />
                );
              })}
            </View>
            <T v="caption" c={ideaIds.length >= 3 ? color.volt : color.textDim}>{ideaIds.length} picked{ideaIds.length < 3 ? `, ${3 - ideaIds.length} to go` : ''} (6 max)</T>
          </>
        )}

        {step === 3 && (
          <>
            <T v="display">Your vibe,{'\n'}briefly.</T>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>Up to three tags</T>
              <View style={styles.wrap}>
                {VIBES.map((v) => <Chip key={v} label={v} selected={vibes.includes(v)} onPress={() => toggle(vibes, setVibes, v, 3)} />)}
              </View>
            </View>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>One line about you (optional)</T>
              <TextInput value={tagline} onChangeText={setTagline} placeholder="Will judge your chai order." placeholderTextColor={color.textMute} maxLength={80} style={[inputStyle, type.body]} accessibilityLabel="One line about you" />
            </View>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.pink}>What unlocks when you both show</T>
              <View style={styles.wrap}>
                {CONTACTS.map((k) => <Chip key={k} label={k} selected={contactKind === k} onPress={() => setContactKind(k)} />)}
              </View>
              <TextInput value={handle} onChangeText={setHandle} placeholder={contactKind === 'WhatsApp' ? '+91 number' : '@yourhandle'} placeholderTextColor={color.textMute} maxLength={40} autoCapitalize="none" autoCorrect={false} keyboardType={contactKind === 'WhatsApp' ? 'phone-pad' : 'default'} style={inputStyle} accessibilityLabel={`${contactKind} handle`} />
              <T v="caption" c={color.textDim}>Nobody sees this until a promise with you is kept. Not before, not for a match, not for a lock.</T>
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <T v="label" c={color.pink}>The anti-ghosting promise</T>
            <T v="display">{name.trim() || 'You'},{'\n'}pinky{'\n'}swear.</T>
            <View style={{ gap: space.md }}>
              {[
                ['If I lock it, I show up.', 'On time, for the whole ten minutes or the whole boba.'],
                ['If I cannot, I say so early.', 'Bailing still counts as a flake. Vanishing counts for more.'],
                ['My record is public.', 'Kept and flaked promises show on my profile as my trust score.'],
              ].map(([head, sub]) => (
                <View key={head} style={styles.oath}>
                  <T v="heading">{head}</T>
                  <T c={color.textDim}>{sub}</T>
                </View>
              ))}
            </View>
          </>
        )}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flexDirection: 'row', gap: 6, marginBottom: space.xxl },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: color.line },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  rule: { flexDirection: 'row', gap: space.md, alignItems: 'baseline', borderTopWidth: 1, borderTopColor: color.line, paddingTop: space.md },
  oath: { borderLeftWidth: 3, borderLeftColor: color.pink, paddingLeft: space.lg, gap: 2 },
});
