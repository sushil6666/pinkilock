/**
 * A friend's invite link (D109). Opened before a profile exists, the code waits on this phone and
 * is used once onboarding is done (src/lib/referral.ts). Opened with a profile, it is used now. The
 * friend's free call opens only when I verify my phone or email; nothing about the friend is shown.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { keepReferral } from '@/lib/referral';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';
import { t } from '@/i18n';

const ROUTE = '/r/[code]';

export default function Referral() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const me = useStore((s) => s.me);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const raw = String(code ?? '');
    if (me) backend.claimReferral(raw).then(() => setDone(true), (e) => setError(shown(e, ROUTE)));
    else void keepReferral(raw);
  }, [code, me]);

  return (
    <Screen desk="form" back="close">
      <View style={{ gap: space.lg }}>
        <T v="display">{t('invite.title')}</T>
        <T c={color.textDim}>{done ? t('invite.joined') : t('invite.body')}</T>
        {error ? <ErrorText text={error} /> : null}
        {me ? <Button label={t('invite.home')} onPress={() => router.replace('/')} />
          : <Button label={t('invite.start')} onPress={() => router.replace('/onboarding')} />}
      </View>
    </Screen>
  );
}
