/**
 * Join a friend's duo (docs/build-plan.md F3). Opened from the link they shared; it needs a
 * profile, so a friend who has none goes through onboarding first and comes back here (the link
 * waits on this phone, src/lib/referral.ts). A duo is how two friends ask two others out on a
 * double: each person is in one duo at a time. A new friend who joins this way has joined with my
 * link (D118), so Bring a friend's rewards follow.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { keepDuo } from '@/lib/referral';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { usePerson, useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';
import { REFERRAL_GOLD_DAYS } from '@/domain/referrals';
import { t } from '@/i18n';

export default function JoinDuo() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const duo = usePerson(useStore((s) => s.duoId) ?? undefined);
  const joinDuo = useStore((s) => s.joinDuo);
  const me = useStore((s) => s.me);
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    backend.duoLinkName(String(token)).then(setName, (e) => { setName(null); setError(shown(e, '/duo/[token]')); });
  }, [token]);

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      await joinDuo(String(token));
      setDone(true);
    } catch (e) {
      setError(shown(e, '/duo/[token]'));
    }
    setBusy(false);
  };

  if (name === undefined) return <Screen desk="form" back="close" scroll={false}><View /></Screen>;
  if (done) {
    return (
      <Screen desk="form" back="close">
        <View style={{ gap: space.lg }}>
          <T v="display">{t('duo.joinedTitle', { name: name ?? '' })}</T>
          <T c={color.textDim}>{t('duo.joinedBody')}</T>
          <Button icon="compass" label={t('duo.find')} onPress={() => router.replace('/(tabs)')} />
        </View>
      </Screen>
    );
  }
  if (name === null) {
    return (
      <Screen desk="form" back="close">
        <View style={{ gap: space.lg }}>
          <T v="display">{t('duo.expiredTitle')}</T>
          <ErrorText text={error || t('duo.expiredBody')} tone={color.textDim} />
          <Button kind="ghost" label={t('ask.backToDiscover')} onPress={() => router.replace('/(tabs)')} />
        </View>
      </Screen>
    );
  }
  // No profile yet: keep the link, set up, and come back here to join.
  const setUp = async () => {
    await keepDuo(String(token));
    router.replace('/onboarding');
  };
  const footer = me
    ? <><ErrorText text={error} /><Button icon="users" label={t('duo.join', { name })} onPress={join} disabled={!!duo} busy={busy} /></>
    : <Button icon="user-plus" label={t('duo.setUpFirst')} onPress={setUp} />;
  return (
    <Screen desk="form" back="close" footer={footer}>
      <View style={{ gap: space.xl }}>
        <T v="display">{t('duo.wantsTitle', { name })}</T>
        <T c={color.textDim}>
          {duo ? t('duo.already', { name: duo.name }) : t('duo.pitch', { name })}
        </T>
        {me ? null : <T c={color.gold}>{t('duo.newHere', { days: REFERRAL_GOLD_DAYS })}</T>}
        <T v="caption" c={color.textDim}>{t('duo.private')}</T>
      </View>
    </Screen>
  );
}
