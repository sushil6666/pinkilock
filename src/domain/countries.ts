/**
 * Where Pinkilock is open (docs/build-plan.md, WP8): an allow-list that grows one region at a
 * time, each after its checklist and a lawyer's sign-off. The same rows are the `countries` and
 * `cities` tables (supabase/migrations); tests/unit/countries.test.ts keeps the two in step.
 * Emergency numbers are for the safety page.
 */
export interface Country { code: string; name: string; active: boolean; emergency: string; womenHelpline: string | null }
export interface City { name: string; country: string; active: boolean }

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
  { name: 'Mumbai', country: 'IN', active: true },
  { name: 'Pune', country: 'IN', active: false },
  { name: 'Bengaluru', country: 'IN', active: false },
  { name: 'Delhi', country: 'IN', active: false },
  { name: 'Hyderabad', country: 'IN', active: false },
];

export const countryOf = (code: string | undefined): Country => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

/** The four things a person agrees to before their first profile (WP8). */
export type ConsentKind = 'adult' | 'terms' | 'privacy' | 'sensitive';
export const ALL_CONSENTS: ConsentKind[] = ['adult', 'terms', 'privacy', 'sensitive'];
