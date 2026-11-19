/**
 * Where someone is: an open city, then an area. Used at sign-up and on Me, where a person can move
 * city (D083). "Use my location" comes first and fills in the nearest city and area (D087); anyone
 * who says no, or has no location on this device, picks by hand. A blocked location comes up as a
 * popup with "Try again" and "Pick by hand" (D090). By hand, the metros are one tap; every other
 * open city is found by a search (its name, an old name, its state or one of its areas) or by
 * picking the state, then the city (D091). An area that is not on the list can
 * be named. The position is used once, on this device, and never saved or sent. The server checks
 * the city and the area again in save_profile.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Chip';
import { Sheet } from '@/components/ui/Sheet';
import { inputStyle } from '@/components/ui/input';
import { T } from '@/components/ui/T';
import { areasIn, closeAreas, matchAreas } from '@/domain/areas';
import { citiesByState, findCities } from '@/domain/citySearch';
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
  const [cityQuery, setCityQuery] = useState('');
  // The state list: closed (null), the states (''), or one state's cities.
  const [inState, setInState] = useState<string | null>(null);
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
  const metros = cities.filter((c) => METROS.includes(c.name));
  const cityTyped = cityQuery.trim();
  const hits = findCities(cityTyped);
  const states = citiesByState();
  const stateOf = (name: string) => cities.find((c) => c.name === name)?.state ?? '';
  // A city picked from the search or the states stays in view next to the metros.
  const picked = city && !METROS.includes(city) && !hits.some((h) => h.city === city) ? city : '';

  /** Picks a city; an area found by the search comes with it. */
  const pick = (name: string, withArea?: string) => {
    setQuery('');
    setCityQuery('');
    setInState(null);
    onCity(name);
    if (withArea) onArea(withArea);
    else if (name !== city) onArea('');
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
      <Sheet visible={inState !== null} onClose={() => setInState(null)}
        title={inState ? t('where.stateCities', { state: inState }) : t('where.stateTitle')}>
        <ScrollView style={styles.list} contentContainerStyle={styles.wrap}>
          {inState
            ? (states.find((g) => g.state === inState)?.cities ?? []).map((c) => (
              <Chip key={c.name} label={c.name} selected={city === c.name} onPress={() => pick(c.name)} />
            ))
            : states.map((g) => (
              <Chip key={g.state} label={g.state} sub={t('where.cityCount', { count: g.cities.length })} selected={g.cities.some((c) => c.name === city)} onPress={() => setInState(g.state)} />
            ))}
        </ScrollView>
        {inState ? <Button kind="ghost" icon="arrow-left" label={t('where.allStates')} onPress={() => setInState('')} /> : null}
      </Sheet>
      <Sheet visible={blocked} onClose={() => setBlocked(false)} title={t('where.deniedTitle')} body={t('where.deniedBody')}>
        <Button icon="crosshair" label={t('common.tryAgain')} onPress={locate} busy={finding.state === 'finding'} />
        <Button kind="ghost" label={t('where.byHand')} onPress={() => setBlocked(false)} />
      </Sheet>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.textDim}>{t('onboarding.city')}</T>
        {metros.length > 0 && (
          <View style={{ gap: space.xs }}>
            <T v="caption" c={color.textMute}>{t('where.metros')}</T>
            <View style={styles.wrap}>
              {metros.map((c) => <Chip key={c.name} label={c.name} selected={city === c.name} onPress={() => pick(c.name)} />)}
            </View>
          </View>
        )}
        <TextInput value={cityQuery} onChangeText={setCityQuery} placeholder={t('where.search', { count: cities.length })} placeholderTextColor={color.textMute}
          maxLength={40} autoCapitalize="words" autoCorrect={false} style={inputStyle} accessibilityLabel={t('where.searchLabel')} />
        {picked ? (
          <View style={styles.wrap}><Chip label={picked} sub={stateOf(picked)} selected /></View>
        ) : null}
        {hits.length > 0 && (
          <View style={styles.wrap}>
            {hits.map((h) => <Chip key={h.city} label={h.city} sub={h.via ?? stateOf(h.city)} selected={city === h.city} onPress={() => pick(h.city, h.area)} />)}
          </View>
        )}
        {cityTyped && hits.length === 0 ? <T v="caption" c={color.flare}>{t('where.noCity')}</T> : null}
        <View style={{ alignItems: 'flex-start' }}>
          <Tag label={t('where.byState')} tone={color.gold} onPress={() => setInState('')} />
        </View>
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
  // The state list scrolls inside the sheet, so the sheet never runs off a short screen.
  list: { maxHeight: 420 },
});
