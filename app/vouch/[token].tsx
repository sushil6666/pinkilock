/**
 * A friend vouches (market review). Opened from a link; no account set-up needed. Up to three
 * phrases from a fixed list: nothing typed, nothing about the friend shown to anyone.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { VOUCH_MAX_PICKS, VOUCH_PHRASES } from '@/domain/vouches';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { color, space } from '@/theme/tokens';
import { t } from '@/i18n';

export default function Vouch() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const [name, setName] = useState<string | null | undefined>(undefined);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    backend.vouchFor(String(token)).then(setName, (e) => { setName(null); setError(shown(e, '/vouch/[token]')); });
  }, [token]);

  const toggle = (p: string) => setPicked(picked.includes(p) ? picked.filter((x) => x !== p) : picked.length < VOUCH_MAX_PICKS ? [...picked, p] : picked);
  const send = async () => {
    setBusy(true);
    setError('');
    try {
      await backend.vouch(String(token), picked);
      setDone(true);
    } catch (e) {
      setError(shown(e, '/vouch/[token]'));
    }
    setBusy(false);
  };

  if (name === undefined) return <Screen back="close" scroll={false}><View /></Screen>;
  if (name === null) {
    return (
      <Screen back="close">
        <T v="display">{t('duo.expiredTitle')}</T>
        <ErrorText text={error || t('vouch.expiredBody')} tone={color.textDim} />
      </Screen>
    );
  }
  if (done) {
    return (
      <Screen back="close">
        <View style={{ gap: space.lg }}>
          <T v="display">{t('vouch.thanks')}</T>
          <T c={color.textDim}>{t('vouch.thanksBody', { name })}</T>
          <Button kind="ghost" label={t('vouch.what')} onPress={() => router.replace('/')} />
        </View>
      </Screen>
    );
  }
  return (
    <Screen back="close" footer={<><ErrorText text={error} /><Button label={t('vouch.button', { name })} onPress={send} disabled={!picked.length} busy={busy} /></>}>
      <View style={{ gap: space.xl }}>
        <T v="display">{t('vouch.title', { name })}</T>
        <T c={color.textDim}>{t('vouch.body', { max: VOUCH_MAX_PICKS })}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {VOUCH_PHRASES.map((p) => <Chip key={p} label={p} selected={picked.includes(p)} onPress={() => toggle(p)} />)}
        </View>
      </View>
    </Screen>
  );
}
