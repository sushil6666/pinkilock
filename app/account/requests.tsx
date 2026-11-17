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

const KINDS: { id: PrivacyRequestKind; label: string }[] = [
  { id: 'score_review', label: 'My Trust Score looks wrong' },
  { id: 'data_question', label: 'A question about my data' },
  { id: 'correction', label: 'Something about me is wrong' },
  { id: 'appeal', label: 'Appeal a decision' },
  { id: 'other', label: 'Something else' },
];

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
      <Screen back="back" title="Ask us">
        <View style={{ gap: space.lg }}>
          <T v="display">Sent.</T>
          <T c={color.textDim}>A person reads every request and answers within 30 days.</T>
          <Button kind="ghost" label="Back to Me" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen back="back" title="Ask us">
      <View style={{ gap: space.xl }}>
        {decisions.length > 0 && (
          <View style={{ gap: space.sm }}>
            <T v="label" c={color.textDim}>Decisions about your account</T>
            {decisions.map((d) => (
              <Chip key={d.id} label={`${d.action.replace('_', ' ')} · ${new Date(d.at).toLocaleDateString()}`} sub={d.reason}
                selected={kind === 'appeal' && actionId === d.id} onPress={() => { setKind('appeal'); setActionId(d.id); }} />
            ))}
            <T v="caption" c={color.textDim}>Tap one to appeal it.</T>
          </View>
        )}
        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>What is it about?</T>
          {KINDS.map((k) => <Chip key={k.id} label={k.label} selected={kind === k.id} onPress={() => setKind(k.id)} />)}
        </View>
        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>{`Tell us more  ${detail.length}/500`}</T>
          <TextInput value={detail} onChangeText={setDetail} maxLength={500} multiline placeholder="What happened, and what you would like us to do."
            placeholderTextColor={color.textMute} style={[inputStyle, type.body, { minHeight: 120, paddingVertical: space.md, textAlignVertical: 'top' }]}
            accessibilityLabel="Tell us more" />
        </View>
        <ErrorText text={error} />
        <Button label="Send" onPress={send} disabled={!kind || !detail.trim() || (kind === 'appeal' && decisions.length > 0 && !actionId)} busy={busy} />
      </View>
    </Screen>
  );
}
