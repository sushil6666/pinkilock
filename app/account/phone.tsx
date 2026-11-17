/**
 * Phone sign-in. `link` (from Me) adds a number to the account on this phone: same id, same
 * history, so a new phone can get back in. `sign_in` (from onboarding) gets back into an account
 * that already has a number. No account is ever created here.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { inputStyle } from '@/components/ui/input';
import { Screen, goBack } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { CODE_LENGTH, maskPhone, normalisePhone } from '@/domain/phone';
import type { PhoneMode } from '@/domain/types';
import { haptic } from '@/lib/haptics';
import { useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';

export default function PhoneScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const mode: PhoneMode = params.mode === 'sign_in' ? 'sign_in' : 'link';
  const sendCode = useStore((s) => s.sendPhoneCode);
  const verify = useStore((s) => s.verifyPhoneCode);
  const account = useStore((s) => s.account);
  const loadAccount = useStore((s) => s.loadAccount);
  useEffect(() => {
    loadAccount().catch(() => {});
  }, [loadAccount]);
  const [raw, setRaw] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const typed = normalisePhone(raw);

  const send = async () => {
    if (!typed) return;
    setBusy(true);
    setError('');
    try {
      await sendCode(typed, mode);
      setPhone(typed);
      setCode('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a code.');
    }
    setBusy(false);
  };

  const confirm = async () => {
    if (!phone) return;
    setBusy(true);
    setError('');
    try {
      await verify(phone, code, mode);
      haptic.success();
      if (mode === 'sign_in') router.replace('/');
      else goBack();
    } catch (e) {
      haptic.warning();
      setError(e instanceof Error ? e.message : 'That code did not work.');
      setBusy(false);
    }
  };

  const footer = phone
    ? <>
        {error ? <T v="caption" c={color.flare}>{error}</T> : null}
        <Button label={mode === 'link' ? 'Add this number' : 'Sign in'} icon="check" busy={busy} disabled={code.length !== CODE_LENGTH} onPress={confirm} />
        <Button kind="quiet" label="Use a different number" onPress={() => { setPhone(null); setError(''); }} />
      </>
    : <>
        {error ? <T v="caption" c={color.flare}>{error}</T> : null}
        <Button label="Text me a code" icon="message-square" busy={busy} disabled={!typed} onPress={send} />
      </>;

  return (
    <Screen back="back" title={mode === 'link' ? 'Your number' : 'Sign in'} footer={footer}>
      <Animated.View key={phone ? 'code' : 'phone'} entering={FadeInRight.duration(260)} style={{ gap: space.xl }}>
        {!phone ? (
          <>
            {account && !account.phoneAvailable ? <T v="caption" c={color.flare}>Phone sign-in is not switched on for this server yet.</T> : null}
            <T v="display">{mode === 'link' ? 'Keep your\nrecord.' : 'Welcome\nback.'}</T>
            <T c={color.textDim}>
              {mode === 'link'
                ? 'Add your number and you can get back into this account on any phone, with your promises and your score. Nobody else ever sees it.'
                : 'The number you added to your Pinkilock account. We text you a code.'}
            </T>
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
          </>
        ) : (
          <>
            <T v="display">Check{'\n'}your texts.</T>
            <T c={color.textDim}>We sent a {CODE_LENGTH}-digit code to {maskPhone(phone)}.</T>
            <View style={{ gap: space.sm }}>
              <T v="label" c={color.textDim}>Code</T>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/[^0-9]/g, ''))}
                placeholder={'0'.repeat(CODE_LENGTH)}
                placeholderTextColor={color.textMute}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="sms-otp"
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
