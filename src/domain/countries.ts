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
/** Early access (D116): cities about to open, which Pink Gold members can move to first. Same `early` column in SQL. */
export const earlyCities = (): City[] => CITIES.filter((c) => !c.active && c.early && COUNTRIES.some((k) => k.code === c.country && k.active));
/** Where I may move: open cities, and for a member the early ones too. */
export const movableCities = (gold: boolean): City[] => (gold ? [...openCities(), ...earlyCities()] : openCities());
/**
 * `zone` is the city's IANA time zone, the `time_zone` column. `state` is the state or union
 * territory, for the "state, then city" picker (D092); it is app-side only, since the server never
 * needs it.
 */
export interface City { name: string; country: string; active: boolean; zone: string; state: string; early?: boolean }

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
  { name: 'Mumbai', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Delhi NCR', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Delhi' },
  { name: 'Bengaluru', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Karnataka' },
  { name: 'Hyderabad', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Telangana' },
  { name: 'Chennai', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Tamil Nadu' },
  { name: 'Kolkata', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'West Bengal' },
  { name: 'Pune', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Ahmedabad', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Gujarat' },
  { name: 'Bhubaneswar', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Odisha' },
  { name: 'Chandigarh', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Chandigarh' },
  { name: 'Coimbatore', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Tamil Nadu' },
  { name: 'Goa', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Goa' },
  { name: 'Indore', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Madhya Pradesh' },
  { name: 'Jaipur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Rajasthan' },
  { name: 'Kochi', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Kerala' },
  { name: 'Lucknow', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Nagpur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Surat', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Gujarat' },
  { name: 'Vadodara', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Gujarat' },
  { name: 'Visakhapatnam', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Andhra Pradesh' },
  // Every other tier-2 (Y class) city (D092). Lists written without a local check: see the migration.
  { name: 'Vijayawada', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Andhra Pradesh' },
  { name: 'Guntur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Andhra Pradesh' },
  { name: 'Nellore', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Andhra Pradesh' },
  { name: 'Guwahati', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Assam' },
  { name: 'Patna', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Bihar' },
  { name: 'Raipur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Chhattisgarh' },
  { name: 'Bhilai', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Chhattisgarh' },
  { name: 'Rajkot', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Gujarat' },
  { name: 'Jamnagar', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Gujarat' },
  { name: 'Bhavnagar', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Gujarat' },
  { name: 'Ranchi', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Jharkhand' },
  { name: 'Jamshedpur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Jharkhand' },
  { name: 'Dhanbad', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Jharkhand' },
  { name: 'Bokaro', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Jharkhand' },
  { name: 'Srinagar', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Jammu and Kashmir' },
  { name: 'Jammu', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Jammu and Kashmir' },
  { name: 'Mysuru', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Karnataka' },
  { name: 'Mangaluru', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Karnataka' },
  { name: 'Hubballi-Dharwad', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Karnataka' },
  { name: 'Belagavi', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Karnataka' },
  { name: 'Kalaburagi', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Karnataka' },
  { name: 'Thiruvananthapuram', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Kerala' },
  { name: 'Kozhikode', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Kerala' },
  { name: 'Thrissur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Kerala' },
  { name: 'Kollam', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Kerala' },
  { name: 'Kannur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Kerala' },
  { name: 'Malappuram', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Kerala' },
  { name: 'Bhopal', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Madhya Pradesh' },
  { name: 'Gwalior', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Madhya Pradesh' },
  { name: 'Jabalpur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Madhya Pradesh' },
  { name: 'Ujjain', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Madhya Pradesh' },
  { name: 'Nashik', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Chhatrapati Sambhajinagar', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Solapur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Kolhapur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Amravati', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Nanded', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Sangli', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Malegaon', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Maharashtra' },
  { name: 'Cuttack', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Odisha' },
  { name: 'Rourkela', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Odisha' },
  { name: 'Puducherry', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Puducherry' },
  { name: 'Ludhiana', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Punjab' },
  { name: 'Amritsar', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Punjab' },
  { name: 'Jalandhar', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Punjab' },
  { name: 'Jodhpur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Rajasthan' },
  { name: 'Kota', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Rajasthan' },
  { name: 'Bikaner', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Rajasthan' },
  { name: 'Ajmer', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Rajasthan' },
  { name: 'Madurai', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Tamil Nadu' },
  { name: 'Tiruchirappalli', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Tamil Nadu' },
  { name: 'Salem', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Tamil Nadu' },
  { name: 'Tiruppur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Tamil Nadu' },
  { name: 'Erode', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Tamil Nadu' },
  { name: 'Warangal', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Telangana' },
  { name: 'Dehradun', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttarakhand' },
  { name: 'Siliguri', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'West Bengal' },
  { name: 'Asansol', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'West Bengal' },
  { name: 'Durgapur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'West Bengal' },
  { name: 'Kanpur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Agra', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Varanasi', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Prayagraj', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Meerut', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Bareilly', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Aligarh', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Moradabad', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Gorakhpur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Saharanpur', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Jhansi', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
  { name: 'Firozabad', country: 'IN', active: true, zone: 'Asia/Kolkata', state: 'Uttar Pradesh' },
];

/** The time zone of a city, or undefined for one we do not know. */
export const zoneOfCity = (city: string | undefined): string | undefined => CITIES.find((c) => c.name === city)?.zone;

/** The eight metros (tier 1), first in the city picker; the rest follow A to Z (D083). */
export const METROS = ['Mumbai', 'Delhi NCR', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad'];

export const countryOf = (code: string | undefined): Country => COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];

/** The four things a person agrees to before their first profile (WP8). */
export type ConsentKind = 'adult' | 'terms' | 'privacy' | 'sensitive';
export const ALL_CONSENTS: ConsentKind[] = ['adult', 'terms', 'privacy', 'sensitive'];
