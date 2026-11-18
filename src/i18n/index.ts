/**
 * Every word the app shows, by language (docs/build-plan.md, WP9). Screens call `t('area.key')`;
 * the English is `src/i18n/en.ts` and is also the shape every other language follows. A language
 * may leave keys out: they show in English until a translator fills them.
 *
 * Two pseudo-languages exist for testing, never offered to people: `en-XA` (accented and about a
 * third longer, to find hard-coded text and labels that will not fit) and `ar-XB` (right to left).
 * Open the web build with `?lang=en-XA` to see one.
 *
 * Dates, times and numbers follow the phone's own locale through `Intl`, whatever the language.
 * Pure TypeScript: no React Native here, so unit tests load it in plain Node.
 */
import { en } from './en';
import { pseudo } from './pseudo';

export type Strings = typeof en;
/** A string with a form per plural category; `other` is always there. */
export interface Plural {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}
type Leaf = string | Plural;
type PluralKey = keyof Plural;
/** A group is a plural only when every key in it is a plural category: `{ one, other }`. */
type IsLeaf<V> = V extends string ? true : keyof V extends PluralKey ? true : false;
type Keys<T, P extends string = ''> = {
  [K in keyof T & string]: IsLeaf<T[K]> extends true ? `${P}${K}` : Keys<T[K], `${P}${K}.`>;
}[keyof T & string];
export type Key = Keys<Strings>;
type DeepPartial<T> = { [K in keyof T]?: IsLeaf<T[K]> extends true ? Leaf : DeepPartial<T[K]> };
export type Translation = DeepPartial<Strings>;
export type Vars = Record<string, string | number>;

interface Lang {
  tag: string;
  rtl: boolean;
  strings: Translation;
}

/** Languages people can get. A new one is a file here, reviewed by a native speaker (WP9). */
const LANGS: Lang[] = [{ tag: 'en', rtl: false, strings: en }];
/** Only when asked for by name. */
const PSEUDO: Lang[] = [
  { tag: 'en-XA', rtl: false, strings: pseudo(en, 'long') },
  { tag: 'ar-XB', rtl: true, strings: pseudo(en, 'rtl') },
];
const RTL_LANGS = ['ar', 'fa', 'he', 'ur', 'ps', 'yi', 'dv', 'ckb'];

/** The best language we have for a BCP 47 tag: exact, then the language alone, then English. */
export function pickLang(tag: string): Lang {
  const all = [...PSEUDO, ...LANGS];
  const lower = tag.toLowerCase();
  return all.find((l) => l.tag.toLowerCase() === lower)
    ?? LANGS.find((l) => l.tag === lower.split('-')[0])
    ?? LANGS[0];
}

export const isRtlTag = (tag: string) => RTL_LANGS.includes(tag.toLowerCase().split('-')[0]) || tag === 'ar-XB';

function deviceLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  } catch {
    // No Intl at all: English, the language every key has.
    return 'en';
  }
}

/** `?lang=en-XA` in a browser, or EXPO_PUBLIC_LANG, wins over the phone's own language. */
function asked(): string | null {
  const loc = (globalThis as { location?: { search?: string } }).location;
  const fromUrl = loc?.search ? new URLSearchParams(loc.search).get('lang') : null;
  return fromUrl || process.env.EXPO_PUBLIC_LANG || null;
}

let lang: Lang = LANGS[0];
let formats = 'en';

/**
 * Sets the language, and the locale for dates and numbers (by default the same tag; English for
 * a pseudo-language). For tests and the language picker to come; screens read it at render.
 */
export function setLocale(tag: string, formatTag?: string) {
  lang = pickLang(tag);
  formats = formatTag ?? (lang.tag.includes('-X') ? 'en' : tag);
}

setLocale(asked() ?? deviceLocale());

export const language = () => lang.tag;
export const isRtl = () => lang.rtl;
/** The locale dates, times and numbers are written in. */
export const formatLocale = () => formats;

function lookup(strings: Translation, key: string): Leaf | undefined {
  let at: unknown = strings;
  for (const part of key.split('.')) {
    if (at == null || typeof at !== 'object') return undefined;
    at = (at as Record<string, unknown>)[part];
  }
  return typeof at === 'string' || isPlural(at) ? (at as Leaf) : undefined;
}

const CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'];
const isPlural = (v: unknown): v is Plural =>
  !!v && typeof v === 'object' && 'other' in v && Object.keys(v).every((k) => CATEGORIES.includes(k));

const fill = (s: string, vars?: Vars) =>
  vars ? s.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole)) : s;

let plurals: { tag: string; rules: Intl.PluralRules } | null = null;
function category(n: number): Intl.LDMLPluralRule {
  const tag = lang.tag.includes('-X') ? 'en' : lang.tag;
  if (plurals?.tag !== tag) plurals = { tag, rules: new Intl.PluralRules(tag) };
  return plurals.rules.select(n);
}

/**
 * The words for `key` in the current language, with `{name}` filled from `vars`. A plural key picks
 * its form from `vars.count`. A key this language lacks shows in English.
 */
export function t(key: Key, vars?: Vars): string {
  const found = lookup(lang.strings, key) ?? lookup(en, key);
  if (found === undefined) return key;
  if (typeof found === 'string') return fill(found, vars);
  const n = Number(vars?.count ?? 0);
  const form = (n === 0 && found.zero) || found[category(n)] || found.other;
  return fill(form, vars);
}

/** The same lookup for a key built at run time (an error code, an id). Null when nobody has it. */
export function tMaybe(key: string, vars?: Vars): string | null {
  const found = lookup(lang.strings, key) ?? lookup(en, key);
  return found === undefined ? null : t(key as Key, vars);
}

// ── Dates, times and numbers: the phone's locale, the viewer's time zone. ───────────────────────

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const k = formats + JSON.stringify(opts);
  let f = cache.get(k);
  if (!f) {
    f = new Intl.DateTimeFormat(formats, opts);
    cache.set(k, f);
  }
  return f;
}

/** "7:30 PM", "19:30". */
export const fmtTime = (t: number, timeZone?: string) => dtf({ hour: 'numeric', minute: '2-digit', timeZone }).format(t);
/** "Sat 21 Nov", "Sat, Nov 21". */
export const fmtDay = (t: number, timeZone?: string) => dtf({ weekday: 'short', day: 'numeric', month: 'short', timeZone }).format(t);
/** "Sat". */
export const fmtWeekday = (t: number) => dtf({ weekday: 'short' }).format(t);
/** "21 Nov". */
export const fmtDayMonth = (t: number) => dtf({ day: 'numeric', month: 'short' }).format(t);
/** "21 Nov 2026". */
export const fmtDate = (t: number) => dtf({ day: 'numeric', month: 'short', year: 'numeric' }).format(t);
export const fmtNumber = (n: number) => new Intl.NumberFormat(formats).format(n);
/** The short name of a time zone at that moment: "IST", "GMT+1". */
export function zoneName(timeZone: string, at: number): string {
  const part = dtf({ timeZone, timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName');
  return part?.value ?? timeZone;
}

/** A country's name in the phone's language where Intl knows it, else the catalogue's English. */
export function countryName(code: string, fallback: string): string {
  try {
    const names = (Intl as unknown as { DisplayNames?: new (l: string[], o: { type: 'region' }) => { of(c: string): string | undefined } }).DisplayNames;
    return (names && new names([formats], { type: 'region' }).of(code)) || fallback;
  } catch {
    // Older engines (Hermes before 0.74) have no DisplayNames: the English name will do.
    return fallback;
  }
}

/** Places that give road distances in miles. Everyone else gets kilometres. */
const MILES = ['US', 'GB', 'LR', 'MM'];
/** The region of the format locale, "US" from "en-US"; empty when the locale names none. */
export function region(): string {
  try {
    const r = (new Intl.Locale(formats) as { maximize?: () => { region?: string }; region?: string });
    return (r.region ?? r.maximize?.().region ?? '').toUpperCase();
  } catch {
    // No Intl.Locale: read it off the tag.
    return (formats.split('-').find((p, i) => i > 0 && /^[A-Za-z]{2}$/.test(p)) ?? '').toUpperCase();
  }
}
/** "3 km" or "2 mi", rounded the way a person would say it. */
export function fmtDistance(km: number): string {
  const miles = MILES.includes(region());
  const n = miles ? km * 0.621371 : km;
  const shown = n < 10 ? Math.round(n * 10) / 10 : Math.round(n);
  return t(miles ? 'common.miles' : 'common.km', { n: fmtNumber(shown) });
}
