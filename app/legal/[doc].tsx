/**
 * The terms or the privacy policy (drafts until a lawyer has reviewed them). Where the terms point
 * to the safety page, a button takes you straight there, with the numbers on it, signed in or not.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { Fragment } from 'react';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { countryOf } from '@/domain/countries';
import { LEGAL_VERSION, PRIVACY, TERMS } from '@/legal/drafts';
import { useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';
import { t } from '@/i18n';

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const country = countryOf(useStore((s) => s.me?.country));
  const privacy = doc === 'privacy';
  const numbers = country.womenHelpline ? t('legal.or', { a: country.emergency, b: country.womenHelpline }) : country.emergency;
  return (
    <Screen desk="read" back="back" title={t(privacy ? 'landing.privacy' : 'landing.terms')}>
      <T v="caption" c={color.textMute} style={{ marginBottom: space.lg }}>{t('legal.version', { version: LEGAL_VERSION })}</T>
      {(privacy ? PRIVACY : TERMS).split('\n\n').map((para, i) => (
        <Fragment key={i}>
          <T c={i === 0 ? color.flare : color.text} style={{ marginBottom: space.md }}>{para}</T>
          {para.includes('safety page') && (
            <Button kind="danger" icon="phone" label={t('legal.safetyCall', { numbers })} onPress={() => router.push('/safety')} style={{ marginBottom: space.lg }} />
          )}
        </Fragment>
      ))}
    </Screen>
  );
}
