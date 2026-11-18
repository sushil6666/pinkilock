/**
 * Where someone is: an open city, then an area from that city's list (typed only where a city has
 * no list yet). Used at sign-up and on Me, where a person can move city (D083). The server checks
 * the same things in save_profile.
 */
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Chip } from '@/components/ui/Chip';
import { inputStyle } from '@/components/ui/input';
import { T } from '@/components/ui/T';
import { areasIn, matchAreas } from '@/domain/areas';
import { METROS, openCities } from '@/domain/countries';
import { AREA_MAX, looksLikeContact } from '@/domain/profile';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

/** Whether the area is a good answer for the city: on its list, or typed where it has none. */
export const areaOk = (city: string, area: string): boolean =>
  areasIn(city).length > 0 ? areasIn(city).includes(area) : area.trim().length >= 2 && !looksLikeContact(area);

export function WherePicker({ city, area, onCity, onArea, cityNote }: {
  city: string;
  area: string;
  onCity: (city: string) => void;
  onArea: (area: string) => void;
  /** The line under the cities. */
  cityNote?: string;
}) {
  const [query, setQuery] = useState('');
  const listed = areasIn(city).length > 0;
  const matches = matchAreas(city, query).slice(0, query.trim() ? 12 : 8);
  // The picked area stays in view while searching.
  const chips = area && listed && !matches.includes(area) ? [area, ...matches.slice(0, matches.length - 1)] : matches;
  const cities = openCities();
  const groups = [
    { label: t('where.metros'), list: cities.filter((c) => METROS.includes(c.name)) },
    { label: t('where.more'), list: cities.filter((c) => !METROS.includes(c.name)) },
  ].filter((g) => g.list.length > 0);
  const pick = (name: string) => {
    setQuery('');
    onCity(name);
    if (name !== city) onArea('');
  };

  return (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.textDim}>{t('onboarding.city')}</T>
        {groups.map((g) => (
          <View key={g.label} style={{ gap: space.xs }}>
            {groups.length > 1 && <T v="caption" c={color.textMute}>{g.label}</T>}
            <View style={styles.wrap}>
              {g.list.map((c) => <Chip key={c.name} label={c.name} selected={city === c.name} onPress={() => pick(c.name)} />)}
            </View>
          </View>
        ))}
        {cityNote ? <T v="caption" c={color.textDim}>{cityNote}</T> : null}
      </View>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.textDim}>{t('where.areaIn', { city })}</T>
        {listed ? (
          <>
            <TextInput value={query} onChangeText={setQuery} placeholder={t('onboarding.areaSearch')} placeholderTextColor={color.textMute} maxLength={AREA_MAX} autoCapitalize="words" autoCorrect={false} style={inputStyle} accessibilityLabel={t('onboarding.area')} />
            <View style={styles.wrap}>
              {chips.map((a) => <Chip key={a} label={a} selected={area === a} onPress={() => onArea(area === a ? '' : a)} />)}
            </View>
            {matches.length === 0 && <T v="caption" c={color.textDim}>{t('onboarding.noArea')}</T>}
          </>
        ) : (
          <TextInput value={area} onChangeText={onArea} placeholder={t('onboarding.neighbourhood')} placeholderTextColor={color.textMute} maxLength={AREA_MAX} autoCapitalize="words" style={inputStyle} accessibilityLabel={t('onboarding.area')} />
        )}
        {!listed && looksLikeContact(area) && <T v="caption" c={color.flare}>{t('errors.PL065')}</T>}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
