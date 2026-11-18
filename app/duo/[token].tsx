/**
 * Join a friend's duo (docs/build-plan.md F3). Opened from the link they shared; it needs a
 * profile, so a friend who has none goes through onboarding first and comes back here. A duo is
 * how two friends ask two others out on a double: each person is in one duo at a time.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { usePerson, useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';
import { t } from '@/i18n';

export default function JoinDuo() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const duo = usePerson(useStore((s) => s.duoId) ?? undefined);
  const joinDuo = useStore((s) => s.joinDuo);
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
  return (
    <Screen desk="form" back="close" footer={<><ErrorText text={error} /><Button icon="users" label={t('duo.join', { name })} onPress={join} disabled={!!duo} busy={busy} /></>}>
      <View style={{ gap: space.xl }}>
        <T v="display">{t('duo.wantsTitle', { name })}</T>
        <T c={color.textDim}>
          {duo ? t('duo.already', { name: duo.name }) : t('duo.pitch', { name })}
        </T>
        <T v="caption" c={color.textDim}>{t('duo.private')}</T>
      </View>
    </Screen>
  );
}
