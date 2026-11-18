/**
 * Sign-in codes, by email or by text. `link` (from Me) adds an email address or a number to the
 * account on this phone: same id, same history, so a new phone can get back in. `sign_in` (from
 * onboarding) gets back into an account that already has one. No account is ever created here.
 * Email comes first because it costs nothing to send; a text costs money per code.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { inputStyle } from '@/components/ui/input';
import { Screen, goBack } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { maskEmail, normaliseEmail } from '@/domain/email';
import { CODE_LENGTH, maskPhone, normalisePhone } from '@/domain/phone';
import { COUNTRIES, DIAL_CODES } from '@/domain/countries';
import { countryName, t } from '@/i18n';
import { Chip } from '@/components/ui/Chip';
import type { CodeKind, CodeMode } from '@/domain/types';
import { haptic } from '@/lib/haptics';
import { useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';
import { quiet } from '@/lib/log';

export default function SignInCodeScreen() {
  const params = useLocalSearchParams<{ mode?: string; kind?: string }>();
  const mode: CodeMode = params.mode === 'sign_in' ? 'sign_in' : 'link';
  const [kind, setKind] = useState<CodeKind>(params.kind === 'phone' ? 'phone' : 'email');
  const sendCode = useStore((s) => s.sendCode);
  const verify = useStore((s) => s.verifyCode);
  const account = useStore((s) => s.account);
  const loadAccount = useStore((s) => s.loadAccount);
  useEffect(() => {
    loadAccount().catch(quiet('/account/sign-in'));
  }, [loadAccount]);
  const [raw, setRaw] = useState('');
  // Which country a number written the local way belongs to (WP9). Starts from my own country.
  const myCountry = useStore((s) => s.me?.country);
  const [dialFrom, setDialFrom] = useState(myCountry ?? COUNTRIES.find((c) => c.active)?.code ?? '');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isPhone = kind === 'phone';
  const typed = isPhone ? normalisePhone(raw, DIAL_CODES[dialFrom] ?? '') : normaliseEmail(raw);
  const off = account && !(isPhone ? account.phoneAvailable : account.emailAvailable);

  const switchKind = () => {
    setKind(isPhone ? 'email' : 'phone');
    setRaw('');
    setError('');
  };

  const send = async () => {
    if (!typed) return;
    setBusy(true);
    setError('');
    try {
      await sendCode(kind, typed, mode);
      setSentTo(typed);
      setCode('');
    } catch (e) {
      setError(shown(e, '/account/sign-in'));
    }
    setBusy(false);
  };

  const confirm = async () => {
    if (!sentTo) return;
    setBusy(true);
    setError('');
    try {
      await verify(kind, sentTo, code, mode);
      haptic.success();
      if (mode === 'sign_in') router.replace('/');
      else goBack();
    } catch (e) {
      haptic.warning();
      setError(shown(e, '/account/sign-in'));
      setBusy(false);
    }
  };

  const footer = sentTo
    ? <>
        {error ? <ErrorText text={error} /> : null}
        <Button label={t(mode === 'link' ? (isPhone ? 'signIn.addNumber' : 'signIn.addEmail') : 'signIn.verify')} icon="check" busy={busy} disabled={code.length !== CODE_LENGTH} onPress={confirm} />
        <Button kind="quiet" label={t(isPhone ? 'signIn.changeNumber' : 'signIn.changeEmail')} onPress={() => { setSentTo(null); setError(''); }} />
      </>
    : <>
        {error ? <ErrorText text={error} /> : null}
        <Button label={t('signIn.sendCode')} icon={isPhone ? 'message-square' : 'mail'} busy={busy} disabled={!typed} onPress={send} />
        <Button kind="quiet" label={t(isPhone ? 'signIn.useEmail' : 'signIn.usePhone')} onPress={switchKind} />
      </>;

  const title = t(mode === 'link' ? (isPhone ? 'signIn.yourNumber' : 'signIn.yourEmail') : 'landing.signIn');
  return (
    <Screen back="back" title={title} footer={footer}>
      <Animated.View key={sentTo ? 'code' : kind} entering={FadeInRight.duration(260)} style={{ gap: space.xl }}>
        {!sentTo ? (
          <>
            {off ? <T v="caption" c={color.flare}>{t(isPhone ? 'signIn.phoneOff' : 'signIn.emailOff')}</T> : null}
            <T v="display">{t(mode === 'link' ? 'signIn.keepTitle' : 'signIn.backTitle')}</T>
            <T c={color.textDim}>
              {t(mode === 'link' ? (isPhone ? 'signIn.linkPhone' : 'signIn.linkEmail') : (isPhone ? 'signIn.enterPhone' : 'signIn.enterEmail'))}
            </T>
            {isPhone ? (
              <View style={{ gap: space.sm }}>
                <T v="label" c={color.textDim}>{t('signIn.country')}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {COUNTRIES.filter((c) => c.active || c.code === dialFrom).map((c) => (
                    <Chip key={c.code} label={t('signIn.countryDial', { country: countryName(c.code, c.name), dial: DIAL_CODES[c.code] ?? '' })} selected={dialFrom === c.code} onPress={() => setDialFrom(c.code)} />
                  ))}
                </View>
                <T v="label" c={color.textDim} style={{ marginTop: space.md }}>{t('signIn.phone')}</T>
                <TextInput
                  value={raw}
                  onChangeText={setRaw}
                  placeholder={t('onboarding.phonePlaceholder', { dial: DIAL_CODES[dialFrom] ?? '' })}
                  placeholderTextColor={color.textMute}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  maxLength={20}
                  style={inputStyle}
                  accessibilityLabel={t('signIn.phone')}
                />
                <T v="caption" c={color.textMute}>{t('signIn.phoneHint')}</T>
              </View>
            ) : (
              <View style={{ gap: space.sm }}>
                <T v="label" c={color.textDim}>{t('signIn.email')}</T>
                <TextInput
                  value={raw}
                  onChangeText={setRaw}
                  placeholder={t('signIn.emailPlaceholder')}
                  placeholderTextColor={color.textMute}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={254}
                  style={inputStyle}
                  accessibilityLabel={t('signIn.email')}
                />
              </View>
            )}
          </>
        ) : (
          <>
            <T v="display">{t(isPhone ? 'signIn.checkTexts' : 'signIn.checkInbox')}</T>
            <T c={color.textDim}>{t(isPhone ? 'signIn.sentText' : 'signIn.sentEmail', { digits: CODE_LENGTH, to: isPhone ? maskPhone(sentTo) : maskEmail(sentTo) })}</T>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>{t('signIn.code')}</T>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ''))}
                placeholder={'0'.repeat(CODE_LENGTH)}
                placeholderTextColor={color.textMute}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete={isPhone ? 'sms-otp' : 'one-time-code'}
                maxLength={CODE_LENGTH}
                style={[inputStyle, { letterSpacing: 8 }]}
                accessibilityLabel={t('signIn.codeShort')}
                autoFocus
              />
              {account?.mockCode ? <T v="caption" c={color.textMute}>{t('signIn.mockCode', { code: account.mockCode })}</T> : null}
            </View>
            <Button kind="quiet" label={t('signIn.resend')} disabled={busy} onPress={send} />
          </>
        )}
      </Animated.View>
    </Screen>
  );
}
