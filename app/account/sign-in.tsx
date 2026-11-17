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
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const isPhone = kind === 'phone';
  const typed = isPhone ? normalisePhone(raw) : normaliseEmail(raw);
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
        <Button label={mode === 'link' ? (isPhone ? 'Add this number' : 'Add this email') : 'Sign in'} icon="check" busy={busy} disabled={code.length !== CODE_LENGTH} onPress={confirm} />
        <Button kind="quiet" label={isPhone ? 'Use a different number' : 'Use a different email'} onPress={() => { setSentTo(null); setError(''); }} />
      </>
    : <>
        {error ? <ErrorText text={error} /> : null}
        <Button label={isPhone ? 'Text me a code' : 'Email me a code'} icon={isPhone ? 'message-square' : 'mail'} busy={busy} disabled={!typed} onPress={send} />
        <Button kind="quiet" label={isPhone ? 'Use email instead' : 'Use a phone number instead'} onPress={switchKind} />
      </>;

  const title = mode === 'link' ? (isPhone ? 'Your number' : 'Your email') : 'Sign in';
  return (
    <Screen back="back" title={title} footer={footer}>
      <Animated.View key={sentTo ? 'code' : kind} entering={FadeInRight.duration(260)} style={{ gap: space.xl }}>
        {!sentTo ? (
          <>
            {off ? <T v="caption" c={color.flare}>{isPhone ? 'Phone' : 'Email'} sign-in is not switched on for this server yet.</T> : null}
            <T v="display">{mode === 'link' ? 'Keep your\nrecord.' : 'Welcome\nback.'}</T>
            <T c={color.textDim}>
              {mode === 'link'
                ? `Add your ${isPhone ? 'number' : 'email'} and you can get back into this account on any phone, with your promises and your score. Nobody else ever sees it.`
                : `The ${isPhone ? 'number' : 'email'} you added to your Pinkilock account. We ${isPhone ? 'text' : 'email'} you a code.`}
            </T>
            {isPhone ? (
              <View style={{ gap: space.sm }}>
                <T v="label" c={color.textDim}>Phone number</T>
                <TextInput
                  value={raw}
                  onChangeText={setRaw}
                  placeholder="98765 43210"
                  placeholderTextColor={color.textMute}
                  keyboardType="phone-pad"
                  textContentType="telephoneNumber"
                  autoComplete="tel"
                  maxLength={20}
                  style={inputStyle}
                  accessibilityLabel="Phone number"
                />
                <T v="caption" c={color.textMute}>Ten digits are taken as an Indian number. Anywhere else: start with + and the country code.</T>
              </View>
            ) : (
              <View style={{ gap: space.sm }}>
                <T v="label" c={color.textDim}>Email</T>
                <TextInput
                  value={raw}
                  onChangeText={setRaw}
                  placeholder="you@example.com"
                  placeholderTextColor={color.textMute}
                  keyboardType="email-address"
                  textContentType="emailAddress"
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={254}
                  style={inputStyle}
                  accessibilityLabel="Email"
                />
              </View>
            )}
          </>
        ) : (
          <>
            <T v="display">Check{'\n'}your {isPhone ? 'texts' : 'inbox'}.</T>
            <T c={color.textDim}>We sent a {CODE_LENGTH}-digit code to {isPhone ? maskPhone(sentTo) : maskEmail(sentTo)}.{isPhone ? '' : ' It can take a minute, and it may land in spam.'}</T>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>Code</T>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
                placeholder={'0'.repeat(CODE_LENGTH)}
                placeholderTextColor={color.textMute}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete={isPhone ? 'sms-otp' : 'one-time-code'}
                maxLength={CODE_LENGTH}
                style={[inputStyle, { letterSpacing: 8 }]}
                accessibilityLabel="Code"
                autoFocus
              />
              {account?.mockCode ? <T v="caption" c={color.textMute}>Mock data: the code is always {account.mockCode}.</T> : null}
            </View>
            <Button kind="quiet" label="Send it again" disabled={busy} onPress={send} />
          </>
        )}
      </Animated.View>
    </Screen>
  );
}
