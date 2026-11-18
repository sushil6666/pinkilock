/**
 * Where Pinkilock is open (docs/build-plan.md, WP8): an allow-list that grows one region at a
 * time, each after its checklist and a lawyer's sign-off. The same rows are the `countries` and
 * `cities` tables (supabase/migrations); tests/unit/countries.test.ts keeps the two in step.
 * Emergency numbers are for the safety page.
 */
export interface Country { code: string; name: string; active: boolean; emergency: string; womenHelpline: string | null }

/** International dialling codes, for phone sign-in and WhatsApp numbers (WP9). App-side only. */
export const DIAL_CODES: Record<string, string> = { IN: '91', GB: '44', US: '1', IE: '353', DE: '49', AU: '61', CA: '1', BR: '55' };

/** Open cities, with their country, for onboarding. */
export const openCities = (): City[] => CITIES.filter((c) => c.active && COUNTRIES.some((k) => k.code === c.country && k.active));
/** `zone` is the city's IANA time zone, the `time_zone` column. */
export interface City { name: string; country: string; active: boolean; zone: string }

export const COUNTRIES: Country[] = [
  { code: 'IN', name: 'India', active: true, emergency: '112', womenHelpline: '181' },
  { code: 'GB', name: 'United Kingdom', active: false, emergency: '999', womenHelpline: null },
  { code: 'US', name: 'United States', active: false, emergency: '911', womenHelpline: null },
  { code: 'IE', name: 'Ireland', active: false, emergency: '112', womenHelpline: null },
  { code: 'DE', name: 'Germany', active: false, emergency: '112', womenHelpline: null },
  { code: 'AU', name: 'Australia', active: false, emergency: '000', womenHelpline: null },
  { code: 'CA', name: 'Canada', active: false, emergency: '911', womenHelpline: null },
  { code: 'BR', name: 'Brazil', active: false, emergency: '190', womenHelpline: '180' },
];

export const CITIES: City[] = [
  { name: 'Mumbai', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Delhi NCR', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Bengaluru', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Hyderabad', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Chennai', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Kolkata', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Pune', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Ahmedabad', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Bhubaneswar', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Chandigarh', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Coimbatore', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Goa', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Indore', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Jaipur', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Kochi', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Lucknow', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Nagpur', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Surat', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Vadodara', country: 'IN', active: true, zone: 'Asia/Kolkata' },
  { name: 'Visakhapatnam', country: 'IN', active: true, zone: 'Asia/Kolkata' },
];

/** The time zone of a city, or undefined for one we do not know. */
export const zoneOfCity = (city: string | undefined): string | undefined => CITIES.find((c) => c.name === city)?.zone;

/** The eight metros (tier 1), first in the city picker; the rest follow A to Z (D080). */
export const METROS = ['Mumbai', 'Delhi NCR', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad'];

export const countryOf = (code: string | undefined): Country => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

/** The four things a person agrees to before their first profile (WP8). */
export type ConsentKind = 'adult' | 'terms' | 'privacy' | 'sensitive';
export const ALL_CONSENTS: ConsentKind[] = ['adult', 'terms', 'privacy', 'sensitive'];
