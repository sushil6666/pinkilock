/**
 * Suggested places to meet: well-known, public, busy spots, so that an in-person ask can pick a
 * place instead of typing one. Picking is safer (the server writes the place, so nothing can be
 * smuggled into it) and easier (nobody has to think of somewhere).
 *
 * The same rows live in the `venues` table (supabase/migrations): add a venue in both places, in
 * a new migration. tests/unit/venues.test.ts fails if the two lists differ.
 *
 * These are landmarks, promenades, parks, markets and malls, not endorsements of any business.
 * The list is a starting point for one city and should be reviewed by someone who lives there.
 */
export type VenueKind = 'promenade' | 'park' | 'mall' | 'market' | 'landmark';

export interface Venue {
  id: string;
  city: string;
  area: string;
  name: string;
  kind: VenueKind;
}

export const VENUES: Venue[] = [
  { id: 'mum_carter_road', city: 'Mumbai', area: 'Bandra West', name: 'Carter Road Promenade', kind: 'promenade' },
  { id: 'mum_bandstand', city: 'Mumbai', area: 'Bandra West', name: 'Bandstand Promenade', kind: 'promenade' },
  { id: 'mum_linking_road', city: 'Mumbai', area: 'Bandra West', name: 'Linking Road', kind: 'market' },
  { id: 'mum_hill_road', city: 'Mumbai', area: 'Bandra West', name: 'Hill Road', kind: 'market' },
  { id: 'mum_jio_world_drive', city: 'Mumbai', area: 'Bandra East', name: 'Jio World Drive', kind: 'mall' },
  { id: 'mum_juhu_beach', city: 'Mumbai', area: 'Juhu', name: 'Juhu Beach', kind: 'promenade' },
  { id: 'mum_prithvi', city: 'Mumbai', area: 'Juhu', name: 'Prithvi Theatre', kind: 'landmark' },
  { id: 'mum_versova_beach', city: 'Mumbai', area: 'Andheri West', name: 'Versova Beach', kind: 'promenade' },
  { id: 'mum_lokhandwala', city: 'Mumbai', area: 'Andheri West', name: 'Lokhandwala Market', kind: 'market' },
  { id: 'mum_infiniti_andheri', city: 'Mumbai', area: 'Andheri West', name: 'Infiniti Mall', kind: 'mall' },
  { id: 'mum_palladium', city: 'Mumbai', area: 'Lower Parel', name: 'Phoenix Palladium', kind: 'mall' },
  { id: 'mum_worli_sea_face', city: 'Mumbai', area: 'Worli', name: 'Worli Sea Face', kind: 'promenade' },
  { id: 'mum_shivaji_park', city: 'Mumbai', area: 'Dadar', name: 'Shivaji Park', kind: 'park' },
  { id: 'mum_five_gardens', city: 'Mumbai', area: 'Matunga', name: 'Five Gardens', kind: 'park' },
  { id: 'mum_marine_drive', city: 'Mumbai', area: 'Marine Lines', name: 'Marine Drive Promenade', kind: 'promenade' },
  { id: 'mum_kala_ghoda', city: 'Mumbai', area: 'Fort', name: 'Kala Ghoda', kind: 'landmark' },
  { id: 'mum_gateway', city: 'Mumbai', area: 'Colaba', name: 'Gateway of India', kind: 'landmark' },
  { id: 'mum_colaba_causeway', city: 'Mumbai', area: 'Colaba', name: 'Colaba Causeway', kind: 'market' },
  { id: 'mum_powai_lake', city: 'Mumbai', area: 'Powai', name: 'Powai Lake Promenade', kind: 'promenade' },
  { id: 'mum_r_city', city: 'Mumbai', area: 'Ghatkopar', name: 'R City Mall', kind: 'mall' },
  { id: 'mum_diamond_garden', city: 'Mumbai', area: 'Chembur', name: 'Diamond Garden', kind: 'park' },
  { id: 'mum_inorbit_malad', city: 'Mumbai', area: 'Malad', name: 'Inorbit Mall', kind: 'mall' },
  { id: 'mum_oberoi_mall', city: 'Mumbai', area: 'Goregaon', name: 'Oberoi Mall', kind: 'mall' },
  { id: 'mum_national_park', city: 'Mumbai', area: 'Borivali', name: 'Sanjay Gandhi National Park, main gate', kind: 'park' },
];

const byId = new Map(VENUES.map((v) => [v.id, v]));

export function venueOf(id: string | null | undefined): Venue | undefined {
  return id ? byId.get(id) : undefined;
}

/** What goes on the invite as the place: the same string the server builds. */
export const venuePlace = (v: Venue): string => `${v.name}, ${v.area}`;

/** A neighbourhood without its compass point: "Bandra West" and "Bandra East" are both Bandra. */
const locality = (area: string): string => area.trim().toLowerCase().replace(/\s+(east|west|north|south)$/, '');

/**
 * Venues to offer for an ask, nearest first: the other person's area (they are the one being
 * asked, so it should be easy for them), then mine, then the rest of the city.
 */
export function venuesFor(city: string, theirArea: string, myArea: string): Venue[] {
  const rank = (v: Venue) =>
    v.area === theirArea ? 0 : locality(v.area) === locality(theirArea) ? 1 : v.area === myArea ? 2 : locality(v.area) === locality(myArea) ? 3 : 4;
  return VENUES.filter((v) => v.city === city).map((v, i) => ({ v, i, r: rank(v) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.v);
}
