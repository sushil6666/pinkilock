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
