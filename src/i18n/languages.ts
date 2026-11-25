/**
 * The languages people can pick (D102): English and the 22 languages of the Eighth Schedule, each
 * in its own script, with the states and union territories where it is the main language. The
 * picker puts the phone's language and the languages of the person's state first.
 *
 * Every language other than English was drafted by machine and has not yet been read by a native
 * speaker: `reviewed` stays false until one signs it off (OPERATIONS.md, "Languages"). A language
 * may leave keys out; they show in English.
 *
 * Pure TypeScript: no React Native here.
 */

/** ISO 15924 script codes. Each non-Latin one has a Noto font on the web (src/theme/scriptFonts.web.ts). */
export type Script = 'Latn' | 'Deva' | 'Beng' | 'Gujr' | 'Guru' | 'Knda' | 'Mlym' | 'Orya' | 'Taml' | 'Telu' | 'Olck' | 'Mtei' | 'Arab';

export interface LanguageInfo {
  /** BCP 47 tag, as Intl knows it. */
  tag: string;
  /** The name in English, for the picker's second line and for search. */
  english: string;
  /** The name in the language itself. */
  native: string;
  script: Script;
  rtl: boolean;
  /** States and union territories where it is the main language, spelled as in src/domain/countries.ts. */
  states: string[];
  /** A native speaker has read every string (OPERATIONS.md). Machine drafts are false. */
  reviewed: boolean;
}

const HINDI_BELT = ['Uttar Pradesh', 'Bihar', 'Madhya Pradesh', 'Rajasthan', 'Chhattisgarh', 'Jharkhand', 'Uttarakhand', 'Haryana', 'Delhi', 'Himachal Pradesh', 'Chandigarh'];

export const LANGUAGES: LanguageInfo[] = [
  { tag: 'en', english: 'English', native: 'English', script: 'Latn', rtl: false, states: [], reviewed: true },
  { tag: 'hi', english: 'Hindi', native: 'हिन्दी', script: 'Deva', rtl: false, states: HINDI_BELT, reviewed: false },
  { tag: 'bn', english: 'Bengali', native: 'বাংলা', script: 'Beng', rtl: false, states: ['West Bengal', 'Tripura'], reviewed: false },
  { tag: 'mr', english: 'Marathi', native: 'मराठी', script: 'Deva', rtl: false, states: ['Maharashtra'], reviewed: false },
  { tag: 'te', english: 'Telugu', native: 'తెలుగు', script: 'Telu', rtl: false, states: ['Andhra Pradesh', 'Telangana'], reviewed: false },
  { tag: 'ta', english: 'Tamil', native: 'தமிழ்', script: 'Taml', rtl: false, states: ['Tamil Nadu', 'Puducherry'], reviewed: false },
  { tag: 'gu', english: 'Gujarati', native: 'ગુજરાતી', script: 'Gujr', rtl: false, states: ['Gujarat', 'Dadra and Nagar Haveli and Daman and Diu'], reviewed: false },
  { tag: 'kn', english: 'Kannada', native: 'ಕನ್ನಡ', script: 'Knda', rtl: false, states: ['Karnataka'], reviewed: false },
  { tag: 'ml', english: 'Malayalam', native: 'മലയാളം', script: 'Mlym', rtl: false, states: ['Kerala', 'Lakshadweep'], reviewed: false },
  { tag: 'or', english: 'Odia', native: 'ଓଡ଼ିଆ', script: 'Orya', rtl: false, states: ['Odisha'], reviewed: false },
  { tag: 'pa', english: 'Punjabi', native: 'ਪੰਜਾਬੀ', script: 'Guru', rtl: false, states: ['Punjab', 'Chandigarh'], reviewed: false },
  { tag: 'as', english: 'Assamese', native: 'অসমীয়া', script: 'Beng', rtl: false, states: ['Assam'], reviewed: false },
  { tag: 'ur', english: 'Urdu', native: 'اردو', script: 'Arab', rtl: true, states: ['Jammu and Kashmir', 'Telangana'], reviewed: false },
  { tag: 'mai', english: 'Maithili', native: 'मैथिली', script: 'Deva', rtl: false, states: ['Bihar'], reviewed: false },
  { tag: 'sat', english: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', script: 'Olck', rtl: false, states: ['Jharkhand'], reviewed: false },
  { tag: 'ks', english: 'Kashmiri', native: 'کٲشُر', script: 'Arab', rtl: true, states: ['Jammu and Kashmir'], reviewed: false },
  { tag: 'ne', english: 'Nepali', native: 'नेपाली', script: 'Deva', rtl: false, states: ['Sikkim'], reviewed: false },
  { tag: 'kok', english: 'Konkani', native: 'कोंकणी', script: 'Deva', rtl: false, states: ['Goa'], reviewed: false },
  { tag: 'sd', english: 'Sindhi', native: 'سنڌي', script: 'Arab', rtl: true, states: [], reviewed: false },
  { tag: 'doi', english: 'Dogri', native: 'डोगरी', script: 'Deva', rtl: false, states: ['Jammu and Kashmir'], reviewed: false },
  { tag: 'mni', english: 'Manipuri', native: 'ꯃꯩꯇꯩꯂꯣꯟ', script: 'Mtei', rtl: false, states: ['Manipur'], reviewed: false },
  { tag: 'brx', english: 'Bodo', native: 'बड़ो', script: 'Deva', rtl: false, states: ['Assam'], reviewed: false },
  { tag: 'sa', english: 'Sanskrit', native: 'संस्कृतम्', script: 'Deva', rtl: false, states: ['Uttarakhand', 'Himachal Pradesh'], reviewed: false },
];

export const languageInfo = (tag: string): LanguageInfo | undefined => {
  const base = tag.toLowerCase().split('-')[0];
  return LANGUAGES.find((l) => l.tag === base);
};

/**
 * The picker's order: the language in use, the phone's own, then the languages of the person's
 * state (main language first), then the rest in the order above.
 */
export function suggestedLanguages(current: string, device: string, state?: string): LanguageInfo[] {
  const picks = [languageInfo(current), languageInfo(device), ...LANGUAGES.filter((l) => !!state && l.states.includes(state))];
  const seen = new Set<string>();
  return picks.filter((l): l is LanguageInfo => !!l && !seen.has(l.tag) && !!seen.add(l.tag));
}
