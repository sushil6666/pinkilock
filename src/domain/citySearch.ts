/**
 * Finding a city among the ninety-odd open ones (D091): by its name, an old or other name people
 * still say ("Bangalore", "Gurgaon"), its state, or one of its areas ("Noida" is in Delhi NCR).
 * Also the "state, then city" list. App-side only: the server checks the city again in save_profile.
 */
import { AREAS, loose } from './areas';
import { openCities, type City } from './countries';

/** Other names for open cities, each pointing at the city's name in CITIES. tests/unit/cities.test.ts checks them. */
export const CITY_ALIASES: Record<string, string> = {
  Allahabad: 'Prayagraj', Aurangabad: 'Chhatrapati Sambhajinagar', Banaras: 'Varanasi', Bangalore: 'Bengaluru',
  Baroda: 'Vadodara', Belgaum: 'Belagavi', Benares: 'Varanasi', Bombay: 'Mumbai', Calcutta: 'Kolkata',
  Calicut: 'Kozhikode', Cannanore: 'Kannur', Cawnpore: 'Kanpur', Cochin: 'Kochi', Delhi: 'Delhi NCR',
  Durg: 'Bhilai', Ernakulam: 'Kochi', Gulbarga: 'Kalaburagi', Gurgaon: 'Delhi NCR', Hubli: 'Hubballi-Dharwad',
  Kashi: 'Varanasi', Madras: 'Chennai', Mangalore: 'Mangaluru', Mysore: 'Mysuru', 'New Delhi': 'Delhi NCR',
  Panaji: 'Goa', Panjim: 'Goa', Pondicherry: 'Puducherry', Pondy: 'Puducherry', Poona: 'Pune', Quilon: 'Kollam',
  Sambhajinagar: 'Chhatrapati Sambhajinagar', Tirupur: 'Tiruppur', Trichy: 'Tiruchirappalli',
  Trivandrum: 'Thiruvananthapuram', Vizag: 'Visakhapatnam',
};

/** A city that spans more than one state is listed under each. */
export const ALSO_IN: Record<string, string[]> = { 'Delhi NCR': ['Haryana', 'Uttar Pradesh'] };

/** Open states and union territories, A to Z, each with its open cities A to Z. */
export function citiesByState(): { state: string; cities: City[] }[] {
  const by = new Map<string, City[]>();
  for (const c of openCities()) for (const s of [c.state, ...(ALSO_IN[c.name] ?? [])]) by.set(s, [...(by.get(s) ?? []), c]);
  return [...by].sort(([a], [b]) => a.localeCompare(b)).map(([state, cities]) => ({ state, cities: cities.sort((a, b) => a.name.localeCompare(b.name)) }));
}

/** One search answer: the city, and when it was found by another name or an area, that name. */
export interface CityHit { city: string; via?: string; area?: string }

/**
 * Open cities for what was typed, best first: the name, then another name, then a spelling cousin,
 * then the state, then a city with an area of that name (which comes back too, so it can be picked).
 */
export function findCities(typed: string, n = 12): CityHit[] {
  const q = typed.trim().toLowerCase();
  if (!q) return [];
  const l = loose(q);
  const hits = new Map<string, CityHit & { rank: number }>();
  const add = (hit: CityHit, rank: number) => {
    const had = hits.get(hit.city);
    if (!had || rank < had.rank) hits.set(hit.city, { ...hit, rank });
  };
  const open = openCities();
  for (const c of open) {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) add({ city: c.name }, 0);
    else if (name.includes(q)) add({ city: c.name }, 1);
    else if (l.length >= 3 && loose(name).includes(l)) add({ city: c.name }, 3);
    if (q.length >= 3 && [c.state, ...(ALSO_IN[c.name] ?? [])].some((s) => s.toLowerCase().startsWith(q))) add({ city: c.name }, 4);
  }
  for (const [other, city] of Object.entries(CITY_ALIASES)) {
    if (!open.some((c) => c.name === city)) continue;
    if (other.toLowerCase().startsWith(q) || (l.length >= 3 && loose(other).startsWith(l))) add({ city, via: other }, 2);
  }
  if (q.length >= 3) {
    for (const c of open) {
      const area = (AREAS[c.name] ?? []).find((a) => a.toLowerCase().startsWith(q)) ?? (l.length >= 4 ? (AREAS[c.name] ?? []).find((a) => loose(a).startsWith(l)) : undefined);
      if (area) add({ city: c.name, via: area, area }, 5);
    }
  }
  return [...hits.values()].sort((a, b) => a.rank - b.rank || a.city.localeCompare(b.city)).slice(0, n).map(({ city, via, area }) => ({ city, ...(via ? { via } : {}), ...(area ? { area } : {}) }));
}
