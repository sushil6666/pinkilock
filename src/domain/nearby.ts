/**
 * "Use my location" (D087): the nearest open city and its nearest areas, worked out on the phone
 * from AREA_CENTRES. The position is passed in, used here and dropped: nothing in this file stores
 * or sends it.
 */
import { AREA_CENTRES } from './areaCentres';
import { openCities } from './countries';

export interface Spot { lat: number; lng: number }

/** Distance in kilometres between two points on the Earth. */
export function km(a: Spot, b: Spot): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Further than this from every area of every open city, and Pinkilock is not open where you are. */
export const CITY_REACH_KM = 25;

const areasOf = (city: string) => Object.entries(AREA_CENTRES[city] ?? {}).map(([name, [lat, lng]]) => ({ name, lat, lng }));

/** The open city nearest to here, or null when none is within reach. */
export function nearestCity(here: Spot): string | null {
  let best: { city: string; d: number } | null = null;
  for (const c of openCities()) {
    for (const a of areasOf(c.name)) {
      const d = km(here, a);
      if (!best || d < best.d) best = { city: c.name, d };
    }
  }
  return best && best.d <= CITY_REACH_KM ? best.city : null;
}

/** A city's areas nearest to here, closest first. */
export function nearestAreas(city: string, here: Spot, n = 4): string[] {
  return areasOf(city).map((a) => ({ name: a.name, d: km(here, a) })).sort((x, y) => x.d - y.d).slice(0, n).map((x) => x.name);
}

/**
 * How far apart two people's areas are, in whole kilometres, for a card ("Distance in live mode").
 * From the areas' rough centres, so it is never finer than a kilometre and never says where anyone
 * actually is. Null when the two are in different cities, in the same area, or either named an
 * area of their own that has no centre: then a card shows no distance at all rather than a guess.
 */
export function areaKm(a: { city?: string | null; area: string }, b: { city?: string | null; area: string }): number | null {
  if (!a.city || a.city !== b.city || a.area === b.area) return null;
  const from = AREA_CENTRES[a.city]?.[a.area];
  const to = AREA_CENTRES[b.city]?.[b.area];
  if (!from || !to) return null;
  return Math.max(1, Math.round(km({ lat: from[0], lng: from[1] }, { lat: to[0], lng: to[1] })));
}

/** The distance a card shows: from the areas when both are known, else what the backend gave (the mock's made-up people). */
export function cardKm(me: { city?: string | null; area: string }, person: { city?: string | null; area: string; distanceKm: number }): number | null {
  return areaKm(me, person) ?? (person.distanceKm > 0 ? person.distanceKm : null);
}
