/** The terms or the privacy policy (drafts until a lawyer has reviewed them). */
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { LEGAL_VERSION, PRIVACY, TERMS } from '@/legal/drafts';
import { color, space } from '@/theme/tokens';

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const privacy = doc === 'privacy';
  return (
    <Screen desk="read" back="back" title={privacy ? 'Privacy' : 'Terms'}>
      <T v="caption" c={color.textMute} style={{ marginBottom: space.lg }}>Version {LEGAL_VERSION}</T>
      {(privacy ? PRIVACY : TERMS).split('\n\n').map((para, i) => (
        <T key={i} c={i === 0 ? color.flare : color.text} style={{ marginBottom: space.md }}>{para}</T>
      ))}
    </Screen>
  );
}
