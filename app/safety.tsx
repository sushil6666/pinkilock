/** Safety: how to meet well, how to report, and the emergency numbers for my country (WP8). */
import { Feather } from '@expo/vector-icons';
import { Linking, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { countryOf } from '@/domain/countries';
import { quiet } from '@/lib/log';
import { useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';
import { countryName, t } from '@/i18n';

const TIPS = [
  ['safety.tip1', 'safety.tip1Body'],
  ['safety.tip2', 'safety.tip2Body'],
  ['safety.tip3', 'safety.tip3Body'],
  ['safety.tip4', 'safety.tip4Body'],
  ['safety.tip5', 'safety.tip5Body'],
] as const;

export default function Safety() {
  const country = countryOf(useStore((s) => s.me?.country));
  const call = (n: string) => Linking.openURL(`tel:${n}`).catch(quiet('safety.call'));
  return (
    <Screen back="back" title={t('profile.safety')}>
      <View style={{ gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <T v="label" c={color.flare}>{t('safety.danger')}</T>
          <Button kind="danger" icon="phone" label={t('safety.call', { number: country.emergency, country: countryName(country.code, country.name) })} onPress={() => call(country.emergency)} />
          {country.womenHelpline ? <Button kind="ghost" icon="phone" label={t('safety.womenHelpline', { number: country.womenHelpline })} onPress={() => call(country.womenHelpline!)} /> : null}
        </View>
        {TIPS.map(([head, sub]) => (
          <View key={head} style={{ flexDirection: 'row', gap: space.md }}>
            <Feather name="shield" size={18} color={color.gold} style={{ marginTop: 3 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyBold">{t(head)}</T>
              <T c={color.textDim}>{t(sub)}</T>
            </View>
          </View>
        ))}
        <T c={color.textDim}>{t('safety.howToReport')}</T>
      </View>
    </Screen>
  );
}
