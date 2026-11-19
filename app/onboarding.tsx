/**
 * Onboarding in five short steps. It asks for what a micro-date needs and nothing else: a name,
 * proof of being an adult, three things you are up for, a one-liner, and the handle that stays
 * locked until you both show. It ends on the promise, sworn with a hold.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Landing } from '@/components/Landing';
import { Welcome } from '@/components/Welcome';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Chip';
import { IdeaChip } from '@/components/IdeaChip';
import { HandlePreview } from '@/components/ContactCheck';
import { inputStyle } from '@/components/ui/input';
import { HoldButton } from '@/components/ui/HoldButton';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { KIND_LABEL, KIND_ORDER, TAGLINE_PROMPTS, VIBE_GROUPS, ideasFor } from '@/domain/ideas';
import type { ContactKind } from '@/domain/types';
import { haptic } from '@/lib/haptics';
import { useStore } from '@/state/store';
import { color, space, type } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';
import { NAME_MAX, PRONOUN_OPTIONS, handleOk, looksLikeContact, nameOk } from '@/domain/profile';
import { ALL_CONSENTS, DIAL_CODES, openCities } from '@/domain/countries';
import { WherePicker, areaOk } from '@/components/WherePicker';
import { contactKindOf, contactKindsFor } from '@/domain/contacts';
import { t } from '@/i18n';

const STEPS = 5;

export default function Onboarding() {
  const complete = useStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  // Where: an open city, then an area picked from its list (typed only where a city has no list yet).
  const [city, setCity] = useState(openCities()[0]?.name ?? '');
  const [area, setArea] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [ideaIds, setIdeaIds] = useState<string[]>([]);
  const [vibes, setVibes] = useState<string[]>([]);
  const [tagline, setTagline] = useState('');
  const [contactKind, setContactKind] = useState<ContactKind>('Instagram');
  const [handle, setHandle] = useState('');
  const [busy, setBusy] = useState(false);
  // The last step's agreements (WP8). The dating-preferences one is separate, as the law asks.
  const [agreed, setAgreed] = useState<Record<'adult' | 'legal' | 'sensitive', boolean>>({ adult: false, legal: false, sensitive: false });
  const [error, setError] = useState('');
  // In a wide browser window the first step is the website's front page; every other step stays a column.
  const { width } = useWindowDimensions();
  const wide = step === 0 && width >= 960;

  const country = openCities().find((c) => c.name === city)?.country ?? '';
  const contactKinds = contactKindsFor(country);
  const phoneKind = !!contactKindOf(contactKind)?.phone;
  const ageNum = Number(age);
  const under18 = age.length >= 2 && ageNum < 18;
  const canNext = [
    true,
    nameOk(name) && ageNum >= 18 && ageNum <= 99 && areaOk(city, area),
    ideaIds.length >= 3,
    handleOk(contactKind, handle, country) && !looksLikeContact(tagline),
    true,
  ][step];

  const toggle = (list: string[], set: (v: string[]) => void, id: string, max: number) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list);

  const swear = async () => {
    setBusy(true);
    setError('');
    try {
      await complete({ name: name.trim(), age: ageNum, area: area.trim(), pronouns, tagline: tagline.trim(), vibes, ideaIds, contactKind, contactHandle: handle.trim(), consents: [...ALL_CONSENTS], city });
      haptic.success();
      router.replace('/(tabs)');
    } catch (e) {
      setError(shown(e, '/onboarding'));
      setBusy(false);
    }
  };

  const footer = step === 4
    ? <>{error ? <ErrorText text={error} /> : null}<HoldButton label={t('onboarding.holdToSwear')} onComplete={swear} busy={busy} disabled={!(agreed.adult && agreed.legal && agreed.sensitive)} /></>
    : <Button label={t(step === 0 ? 'landing.start' : 'common.next')} icon="arrow-right" onPress={() => setStep(step + 1)} disabled={!canNext} />;

  return (
    <Screen desk="form" wide={wide} logo={!wide} back={step > 0 ? 'back' : false} onBack={() => setStep(step - 1)} title={step > 0 ? t('onboarding.stepOf', { step, total: STEPS - 1 }) : undefined} footer={wide ? undefined : footer}>
      {step > 0 && (
        <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: STEPS - 1, now: step }}>
          {Array.from({ length: STEPS - 1 }, (_, i) => <View key={i} style={[styles.bar, i < step && { backgroundColor: color.pink }]} />)}
        </View>
      )}

      <Animated.View key={step} entering={step === 0 ? FadeInDown.duration(500) : FadeInRight.duration(260)} style={{ gap: space.xl }}>
        {step === 0 && (wide ? <Landing onStart={() => setStep(1)} /> : <Welcome />)}

        {step === 1 && (
          <>
            <T v="display">{t('onboarding.whoTitle')}</T>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>{t('onboarding.firstName')}</T>
              <TextInput value={name} onChangeText={setName} placeholder={t('onboarding.namePlaceholder')} placeholderTextColor={color.textMute} maxLength={NAME_MAX} autoCapitalize="words" autoCorrect={false} style={inputStyle} accessibilityLabel={t('onboarding.firstName')} returnKeyType="next" />
              {name.trim().length >= 2 && !nameOk(name) && <T v="caption" c={color.flare}>{t('onboarding.nameRule')}</T>}
            </View>
            <View style={{ gap: space.sm, width: 104 }}>
              <T v="label" c={color.textDim}>{t('onboarding.age')}</T>
              <TextInput value={age} onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ''))} placeholder="21" placeholderTextColor={color.textMute} keyboardType="number-pad" maxLength={2} style={inputStyle} accessibilityLabel={t('onboarding.age')} />
            </View>
            {under18 && <T v="caption" c={color.flare}>{t('onboarding.adultsOnly')}</T>}
            <WherePicker city={city} area={area} cityNote={t('onboarding.oneCity', { count: openCities().length })} onArea={setArea} onCity={(name) => {
              // Ideas are offered by country (WP9): keep only the picks the new city's country has.
              const to = openCities().find((c) => c.name === name)?.country ?? '';
              setCity(name);
              setIdeaIds(ideaIds.filter((id) => ideasFor(to).some((i) => i.id === id)));
            }} />
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>{t('onboarding.pronouns')}</T>
              <View style={styles.wrap}>
                {PRONOUN_OPTIONS.map((p) => <Chip key={p} label={p} selected={pronouns === p} onPress={() => setPronouns(pronouns === p ? '' : p)} />)}
              </View>
            </View>
          </>
        )}

        {step === 2 && (
          <>
            <View style={{ gap: space.sm }}>
              <T v="display">{t('onboarding.upForTitle')}</T>
              <T c={color.textDim}>{t('onboarding.upForBody')}</T>
            </View>
            {KIND_ORDER.map((kind) => (
              <View key={kind} style={{ gap: space.sm }}>
                <T v="label" c={color.textDim}>{KIND_LABEL[kind]}</T>
                {ideasFor(country).filter((idea) => idea.kind === kind).map((idea) => (
                  <IdeaChip key={idea.id} idea={idea} selected={ideaIds.includes(idea.id)} onPress={() => toggle(ideaIds, setIdeaIds, idea.id, 6)} />
                ))}
              </View>
            ))}
            <T v="caption" c={ideaIds.length >= 3 ? color.gold : color.textDim}>{ideaIds.length < 3 ? t('onboarding.pickedToGo', { count: ideaIds.length, left: 3 - ideaIds.length }) : t('onboarding.picked', { count: ideaIds.length })}</T>
          </>
        )}

        {step === 3 && (
          <>
            <T v="display">{t('onboarding.vibeTitle')}</T>
            <T v="caption" c={vibes.length > 0 ? color.gold : color.textDim}>{t('onboarding.tagsPicked', { count: vibes.length })}</T>
            {VIBE_GROUPS.map((group) => (
              <View key={group.label} style={{ gap: space.sm }}>
                <T v="label" c={color.textDim}>{group.label}</T>
                <View style={styles.wrap}>
                  {group.vibes.map((v) => <Chip key={v} label={v} selected={vibes.includes(v)} onPress={() => toggle(vibes, setVibes, v, 3)} />)}
                </View>
              </View>
            ))}
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>{t('onboarding.line')}</T>
              <View style={styles.wrap}>
                {TAGLINE_PROMPTS.map((p) => <Tag key={p} label={p.trim()} tone={tagline.startsWith(p) ? color.gold : color.textDim} selected={tagline.startsWith(p)} onPress={() => setTagline(p)} />)}
              </View>
              <TextInput value={tagline} onChangeText={setTagline} placeholder={t('onboarding.linePlaceholder')} placeholderTextColor={color.textMute} maxLength={80} style={[inputStyle, type.body]} accessibilityLabel={t('onboarding.lineLabel')} />
              {looksLikeContact(tagline) && <T v="caption" c={color.flare}>{t('errors.PL065')}</T>}
            </View>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.pink}>{t('onboarding.unlocks')}</T>
              <View style={styles.wrap}>
                {contactKinds.map((k) => <Chip key={k.kind} label={k.kind} selected={contactKind === k.kind} onPress={() => setContactKind(k.kind as ContactKind)} />)}
              </View>
              <TextInput value={handle} onChangeText={setHandle} placeholder={phoneKind ? t('onboarding.phonePlaceholder', { dial: DIAL_CODES[country] ?? '' }) : t('onboarding.handlePlaceholder')} placeholderTextColor={color.textMute} maxLength={40} autoCapitalize="none" autoCorrect={false} keyboardType={phoneKind ? 'phone-pad' : 'default'} style={inputStyle} accessibilityLabel={t('onboarding.handleLabel', { kind: contactKind })} />
              <HandlePreview kind={contactKind} handle={handle} country={country} />
              <T v="caption" c={color.textDim}>{t('onboarding.handleHidden')}</T>
            </View>
          </>
        )}

        {step === 4 && (
          <>
            <T v="label" c={color.pink}>{t('onboarding.promise')}</T>
            <T v="display">{t('onboarding.swearTitle', { name: name.trim() || t('common.you') })}</T>
            <View style={{ gap: space.md }}>
              {([
                ['onboarding.oath1', 'onboarding.oath1Body'],
                ['onboarding.oath2', 'onboarding.oath2Body'],
                ['onboarding.oath3', 'onboarding.oath3Body'],
              ] as const).map(([head, sub]) => (
                <View key={head} style={styles.oath}>
                  <T v="heading">{t(head)}</T>
                  <T c={color.textDim}>{t(sub)}</T>
                </View>
              ))}
            </View>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>{t('onboarding.beforeSwear')}</T>
              <Chip label={t('onboarding.agreeAdult')} selected={agreed.adult} onPress={() => setAgreed({ ...agreed, adult: !agreed.adult })} />
              <Chip label={t('onboarding.agreeLegal')} selected={agreed.legal} onPress={() => setAgreed({ ...agreed, legal: !agreed.legal })} />
              <Chip label={t('onboarding.agreeSensitive')} sub={t('onboarding.agreeSensitiveBody')}
                selected={agreed.sensitive} onPress={() => setAgreed({ ...agreed, sensitive: !agreed.sensitive })} />
              <View style={styles.wrap}>
                <Tag label={t('onboarding.readTerms')} onPress={() => router.push('/legal/terms')} />
                <Tag label={t('onboarding.readPrivacy')} onPress={() => router.push('/legal/privacy')} />
              </View>
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
  oath: { borderLeftWidth: 3, borderLeftColor: color.pink, paddingLeft: space.lg, gap: 2 },
});
