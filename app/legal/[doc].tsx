/** The terms or the privacy policy (drafts until a lawyer has reviewed them). */
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { LEGAL_VERSION, PRIVACY, TERMS } from '@/legal/drafts';
import { color, space } from '@/theme/tokens';
import { t } from '@/i18n';

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const privacy = doc === 'privacy';
  return (
    <Screen back="back" title={t(privacy ? 'landing.privacy' : 'landing.terms')}>
      <T v="caption" c={color.textMute} style={{ marginBottom: space.lg }}>{t('legal.version', { version: LEGAL_VERSION })}</T>
      {(privacy ? PRIVACY : TERMS).split('\n\n').map((para, i) => (
        <T key={i} c={i === 0 ? color.flare : color.text} style={{ marginBottom: space.md }}>{para}</T>
      ))}
    </Screen>
  );
}
