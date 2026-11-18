/**
 * Ask a person (WP8): about my data, my Trust Score, a correction, or an appeal against a decision
 * about my account. Every request is answered within 30 days. Decisions are listed with their reason.
 */
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { ErrorText } from '@/components/ui/ErrorText';
import { inputStyle } from '@/components/ui/input';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { shown } from '@/lib/report';
import { backend, type PrivacyRequestKind } from '@/services';
import { color, space, type } from '@/theme/tokens';
import { fmtDate, t, tMaybe } from '@/i18n';

const KINDS: PrivacyRequestKind[] = ['score_review', 'data_question', 'correction', 'appeal', 'other'];

export default function Requests() {
  const [kind, setKind] = useState<PrivacyRequestKind | null>(null);
  const [actionId, setActionId] = useState<number | undefined>();
  const [detail, setDetail] = useState('');
  const [decisions, setDecisions] = useState<{ id: number; action: string; reason: string; at: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    backend.myModeration().then(setDecisions, (e) => setError(shown(e, '/account/requests')));
  }, []);

  const send = async () => {
    if (!kind) return;
    setBusy(true);
    setError('');
    try {
      await backend.fileRequest(kind, detail.trim(), kind === 'appeal' ? actionId : undefined);
      setSent(true);
    } catch (e) {
      setError(shown(e, '/account/requests'));
    }
    setBusy(false);
  };

  if (sent) {
    return (
      <Screen desk="read" back="back" title={t('requests.title')}>
        <View style={{ gap: space.lg }}>
          <T v="display">{t('requests.sentTitle')}</T>
          <T c={color.textDim}>{t('requests.sentBody')}</T>
          <Button kind="ghost" label={t('requests.backToMe')} onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen desk="read" back="back" title={t('requests.title')}>
      <View style={{ gap: space.xl }}>
        {decisions.length > 0 && (
          <View style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>{t('requests.decisions')}</T>
            {decisions.map((d) => (
              <Chip key={d.id} label={t('requests.decision', { action: tMaybe(`requests.actions.${d.action}`) ?? d.action.replace('_', ' '), date: fmtDate(d.at) })} sub={d.reason}
                selected={kind === 'appeal' && actionId === d.id} onPress={() => { setKind('appeal'); setActionId(d.id); }} />
            ))}
            <T v="caption" c={color.textDim}>{t('requests.tapToAppeal')}</T>
          </View>
        )}
        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>{t('requests.about')}</T>
          {KINDS.map((k) => <Chip key={k} label={t(`requests.kinds.${k}`)} selected={kind === k} onPress={() => setKind(k)} />)}
        </View>
        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>{t('requests.more', { n: detail.length, max: 500 })}</T>
          <TextInput value={detail} onChangeText={setDetail} maxLength={500} multiline placeholder={t('requests.placeholder')}
            placeholderTextColor={color.textMute} style={[inputStyle, type.body, { minHeight: 120, paddingVertical: space.md, textAlignVertical: 'top' }]}
            accessibilityLabel={t('requests.moreLabel')} />
        </View>
        <ErrorText text={error} />
        <Button label={t('common.send')} onPress={send} disabled={!kind || !detail.trim() || (kind === 'appeal' && decisions.length > 0 && !actionId)} busy={busy} />
      </View>
    </Screen>
  );
}
