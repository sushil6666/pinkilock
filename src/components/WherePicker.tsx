/**
 * Where someone is: an open city, then an area. Used at sign-up and on Me, where a person can move
 * city (D083). "Use my location" comes first and fills in the nearest city and area (D087); anyone
 * who says no, or has no location on this device, picks by hand. A blocked location comes up as a
 * popup with "Try again" and "Pick by hand" (D090). An area that is not on the list can
 * be named. The position is used once, on this device, and never saved or sent. The server checks
 * the city and the area again in save_profile.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { inputStyle } from '@/components/ui/input';
import { T } from '@/components/ui/T';
import { areasIn, closeAreas, matchAreas } from '@/domain/areas';
import { METROS, openCities } from '@/domain/countries';
import { nearestAreas, nearestCity } from '@/domain/nearby';
import { AREA_MAX, customAreaOk, looksLikeContact } from '@/domain/profile';
import { locateOnce } from '@/lib/location';
import { t } from '@/i18n';
import { color, space } from '@/theme/tokens';

/** Whether the area is a good answer for the city: on its list, or a place name of their own. */
export const areaOk = (city: string, area: string): boolean =>
  areasIn(city).length > 0 ? areasIn(city).includes(area) || customAreaOk(area) : area.trim().length >= 2 && !looksLikeContact(area);

type Finding = { state: 'idle' | 'finding' | 'denied' | 'unavailable' | 'outside' } | { state: 'found'; city: string; near: string[] };

export function WherePicker({ city, area, onCity, onArea, cityNote, autoLocate = true }: {
  city: string;
  area: string;
  onCity: (city: string) => void;
  onArea: (area: string) => void;
  /** The line under the cities. */
  cityNote?: string;
  /** Ask for the location as soon as the picker shows (the default: location comes first). */
  autoLocate?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [finding, setFinding] = useState<Finding>({ state: 'idle' });
  // The blocked-location popup: opens when the answer is no, stays open while trying again.
  const [blocked, setBlocked] = useState(false);
  const listed = areasIn(city).length > 0;
  const typed = query.trim();
  const matches = matchAreas(city, query).slice(0, typed ? 12 : 8);
  const close = typed && matches.length === 0 ? closeAreas(city, typed) : [];
  const ownOk = !!typed && listed && !areasIn(city).includes(typed) && customAreaOk(typed);
  const own = area && listed && !areasIn(city).includes(area) ? area : '';
  // The picked area stays in view while searching.
  const chips = area && listed && !own && !matches.includes(area) ? [area, ...matches.slice(0, matches.length - 1)] : matches;
  const near = finding.state === 'found' && finding.city === city ? finding.near : [];
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

  const locate = async () => {
    setFinding({ state: 'finding' });
    const got = await locateOnce();
    setBlocked(!got.ok && got.why === 'denied');
    if (!got.ok) return setFinding({ state: got.why });
    const found = nearestCity(got.here);
    if (!found) return setFinding({ state: 'outside' });
    // Only the names are kept; the position goes out of scope here.
    const list = nearestAreas(found, got.here);
    setQuery('');
    onCity(found);
    onArea(list[0] ?? '');
    setFinding({ state: 'found', city: found, near: list });
  };

  useEffect(() => {
    if (autoLocate) void locate();
    // Once, when the picker opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const note = {
    idle: '', finding: t('where.finding'), denied: t('where.deniedShort'), unavailable: t('where.unavailable'), outside: t('where.outside'),
    found: finding.state === 'found' && finding.city === city ? t('where.found', { city: finding.city }) : '',
  }[finding.state];

  return (
    <>
      <View style={{ gap: space.sm }}>
        <Button kind="ghost" icon="crosshair" label={t(finding.state === 'denied' || finding.state === 'unavailable' ? 'where.retry' : 'where.useLocation')}
          onPress={locate} busy={finding.state === 'finding'} />
        {note && !blocked ? <T v="caption" c={finding.state === 'found' ? color.gold : finding.state === 'finding' || finding.state === 'denied' ? color.textDim : color.flare}>{note}</T> : null}
        <T v="caption" c={color.textMute}>{t('where.private')}</T>
      </View>
      <Sheet visible={blocked} onClose={() => setBlocked(false)} title={t('where.deniedTitle')} body={t('where.deniedBody')}>
        <Button icon="crosshair" label={t('common.tryAgain')} onPress={locate} busy={finding.state === 'finding'} />
        <Button kind="ghost" label={t('where.byHand')} onPress={() => setBlocked(false)} />
      </Sheet>
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
        {near.length > 0 && !typed && (
          <View style={{ gap: space.xs }}>
            <T v="caption" c={color.textMute}>{t('where.nearest')}</T>
            <View style={styles.wrap}>
              {near.map((a) => <Chip key={a} label={a} selected={area === a} onPress={() => onArea(a)} />)}
            </View>
          </View>
        )}
        {listed ? (
          <>
            <TextInput value={query} onChangeText={setQuery} placeholder={t('onboarding.areaSearch')} placeholderTextColor={color.textMute} maxLength={AREA_MAX} autoCapitalize="words" autoCorrect={false} style={inputStyle} accessibilityLabel={t('onboarding.area')} />
            {own ? (
              <View style={styles.wrap}><Chip label={own} sub={t('where.ownTag')} selected onPress={() => onArea('')} /></View>
            ) : null}
            {(typed || near.length === 0) && chips.length > 0 && (
              <View style={styles.wrap}>
                {chips.map((a) => <Chip key={a} label={a} selected={area === a} onPress={() => onArea(area === a ? '' : a)} />)}
              </View>
            )}
            {close.length > 0 && (
              <View style={{ gap: space.xs }}>
                <T v="caption" c={color.textDim}>{t('where.didYouMean')}</T>
                <View style={styles.wrap}>
                  {close.map((a) => <Chip key={a} label={a} selected={area === a} onPress={() => { onArea(a); setQuery(''); }} />)}
                </View>
              </View>
            )}
            {ownOk && area !== typed && (
              <View style={{ gap: space.xs, alignItems: 'flex-start' }}>
                <Tag label={t('where.addOwn', { area: typed })} tone={color.gold} onPress={() => { onArea(typed); setQuery(''); }} />
                <T v="caption" c={color.textMute}>{t('where.ownBody')}</T>
              </View>
            )}
            {typed && matches.length === 0 && !ownOk && <T v="caption" c={color.flare}>{looksLikeContact(typed) ? t('errors.PL065') : t('errors.PL106')}</T>}
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
