/**
 * Cosmic match (D129): the Indian tradition of matching by the Moon at birth (Ashtakoota, the 36
 * gunas), and a numerology number, for fun and tradition. Opt-in on both sides, shown only between
 * two people who matched (a kept plan, both want round two), never in Discover's order or a Trust
 * Score, never asking for or showing caste or gotra, never selling remedies.
 *
 * The phone works out my Moon's sidereal longitude from my birth date (and time, if I give one;
 * noon India time if not) and sends that with the date; the server keeps it private and answers
 * only the score between two people (`private.guna` in supabase/migrations/20261127000027_cosmic.sql,
 * the same tables as here: `GUNA_CASES` in tests keeps the two equal). Birth place is not asked:
 * in India it changes nothing here. Pure TypeScript: no React Native.
 */

export const GUNA_MAX = 36;
export const KOOTAS = ['varna', 'vashya', 'tara', 'yoni', 'maitri', 'gana', 'bhakoot', 'nadi'] as const;
export type Koota = (typeof KOOTAS)[number];
export const KOOTA_MAX: Record<Koota, number> = { varna: 1, vashya: 2, tara: 3, yoni: 4, maitri: 5, gana: 6, bhakoot: 7, nadi: 8 };

/** The 27 nakshatras, Ashwini first; names in `cosmic.stars`. */
export const NAKSHATRAS = ['ashwini', 'bharani', 'krittika', 'rohini', 'mrigashira', 'ardra', 'punarvasu', 'pushya', 'ashlesha', 'magha',
  'purva_phalguni', 'uttara_phalguni', 'hasta', 'chitra', 'swati', 'vishakha', 'anuradha', 'jyeshtha', 'mula', 'purva_ashadha',
  'uttara_ashadha', 'shravana', 'dhanishta', 'shatabhisha', 'purva_bhadrapada', 'uttara_bhadrapada', 'revati'] as const;
/** The 12 moon signs (rashis), Mesha (Aries) first; names in `cosmic.signs`. */
export const RASHIS = ['mesha', 'vrishabha', 'mithuna', 'karka', 'simha', 'kanya', 'tula', 'vrischika', 'dhanu', 'makara', 'kumbha', 'meena'] as const;

// ---------- The Moon ----------

const rad = Math.PI / 180;
const norm = (x: number) => ((x % 360) + 360) % 360;

/** [D, M, M', F, coefficient in millionths of a degree] (Meeus, Astronomical Algorithms, ch. 47, the larger terms). */
const TERMS: [number, number, number, number, number][] = [
  [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314], [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116],
  [0, 0, 0, 2, -114332], [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322], [2, -1, 0, 0, 45758],
  [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720], [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034], [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888],
  [2, 1, 0, 0, -6766], [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036], [2, 0, 2, 0, 3994],
  [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665], [0, 1, -2, 0, -2689], [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390],
  [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236], [0, 1, 2, 0, -2120], [0, 2, 0, 0, -2069],
];

/** The Moon's tropical longitude, degrees, at a moment (ms since 1970, UTC). About a third of a degree. */
export function moonTropical(at: number): number {
  const T = (at / 86_400_000 + 2440587.5 - 2451545.0) / 36525;
  const Lp = 218.3164477 + 481267.88123421 * T;
  const D = 297.8501921 + 445267.1114034 * T;
  const M = 357.5291092 + 35999.0502909 * T;
  const Mp = 134.9633964 + 477198.8675055 * T;
  const F = 93.272095 + 483202.0175233 * T;
  const E = 1 - 0.002516 * T;
  let sum = 0;
  for (const [d, m, mp, f, c] of TERMS) sum += c * E ** Math.abs(m) * Math.sin((d * D + m * M + mp * Mp + f * F) * rad);
  sum += 3958 * Math.sin((119.75 + 131.849 * T) * rad) + 1962 * Math.sin((Lp - F) * rad) + 318 * Math.sin((53.09 + 479264.29 * T) * rad);
  return norm(Lp + sum / 1e6);
}

/** Lahiri ayanamsa, degrees: 23.853 at the start of 2000, about 50.3 seconds of arc more each year. */
export const lahiri = (at: number) => 23.85306 + 0.013966 * ((at - Date.UTC(2000, 0, 1, 12)) / (365.25 * 86_400_000));

/** The moment of a birth in India's time: `YYYY-MM-DD`, and `HH:MM` or noon. */
export const birthMoment = (date: string, time: string | null) => Date.parse(`${date}T${time ?? '12:00'}:00+05:30`);

/** The Moon's sidereal (Lahiri) longitude at birth, degrees, rounded to a hundredth. */
export const moonAtBirth = (date: string, time: string | null) => {
  const at = birthMoment(date, time);
  return Math.round(norm(moonTropical(at) - lahiri(at)) * 100) / 100;
};

export const nakshatraOf = (moon: number) => Math.floor(norm(moon) / (360 / 27)) % 27;
export const rashiOf = (moon: number) => Math.floor(norm(moon) / 30) % 12;

// ---------- The eight kootas ----------
// Tradition scores some kootas from the groom's side; Pinkilock's version takes both sides and
// averages them, so it is the same whoever's chart is first and works for every couple.

/** Varna by sign (4 highest). Used only inside the score: never shown, it is not about anyone's caste. */
const VARNA = [3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4];
/** Vashya group: 0 four-footed, 1 human, 2 water, 3 wild, 4 insect; Dhanu and Makara by half. */
function vashyaOf(moon: number): number {
  const r = rashiOf(moon);
  const second = norm(moon) % 30 >= 15;
  return [0, 0, 1, 2, 3, 1, 1, 4, second ? 0 : 1, second ? 2 : 0, 1, 2][r];
}
const VASHYA = [
  [2, 1, 1, 0.5, 1],
  [1, 2, 0.5, 0, 1],
  [1, 0.5, 2, 1, 1],
  [0.5, 0, 1, 2, 0],
  [1, 1, 1, 0, 2],
];
/** Yoni animal by nakshatra, and the seven pairs of sworn enemies. */
const YONI = [0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1];
const YONI_ENEMIES = [[0, 8], [1, 13], [2, 11], [3, 12], [4, 10], [5, 6], [7, 9]];
/** Sign lords: 0 Sun, 1 Moon, 2 Mars, 3 Mercury, 4 Jupiter, 5 Venus, 6 Saturn. */
const LORD = [2, 5, 3, 1, 0, 3, 5, 2, 4, 6, 6, 4];
/** How each planet sees each other: 1 friend, 0 neutral, -1 enemy. */
const FRIEND = [
  [1, 1, 1, 0, 1, -1, -1],
  [1, 1, 0, 1, 0, 0, 0],
  [1, 1, 1, -1, 1, 0, 0],
  [1, -1, 0, 1, 0, 1, 0],
  [1, 1, 1, -1, 1, -1, 0],
  [-1, -1, 0, 1, 0, 1, 1],
  [-1, -1, -1, 1, 0, 1, 1],
];
/** Gana by nakshatra: 0 deva, 1 manushya, 2 rakshasa. */
const GANA = [0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0];
const GANA_SCORE = [[6, 5.5, 0.5], [5.5, 6, 0], [0.5, 0, 6]];

function maitri(a: number, b: number): number {
  const [x, y] = [LORD[a], LORD[b]];
  if (x === y) return 5;
  const s = FRIEND[x][y] + FRIEND[y][x];
  const one = FRIEND[x][y] === 1 || FRIEND[y][x] === 1;
  return s === 2 ? 5 : s === 1 ? 4 : s === 0 ? (one ? 1 : 3) : s === -1 ? 0.5 : 0;
}

function tara(from: number, to: number): boolean {
  return ![3, 5, 7].includes((((to - from + 27) % 27) + 1) % 9);
}

/** The eight scores between two Moons, each up to its KOOTA_MAX, the same whichever is first. */
export function kootas(a: number, b: number): Record<Koota, number> {
  const [na, nb, ra, rb] = [nakshatraOf(a), nakshatraOf(b), rashiOf(a), rashiOf(b)];
  const dist = ((rb - ra + 12) % 12) + 1;
  const ya = YONI[na];
  const yb = YONI[nb];
  return {
    varna: VARNA[ra] === VARNA[rb] ? 1 : 0.5,
    vashya: VASHYA[vashyaOf(a)][vashyaOf(b)],
    tara: (Number(tara(na, nb)) + Number(tara(nb, na))) * 1.5,
    yoni: ya === yb ? 4 : YONI_ENEMIES.some(([p, q]) => (p === ya && q === yb) || (p === yb && q === ya)) ? 0 : 2,
    maitri: maitri(ra, rb),
    gana: GANA_SCORE[GANA[na]][GANA[nb]],
    bhakoot: [2, 12, 5, 9, 6, 8].includes(dist) ? 0 : 7,
    nadi: [0, 1, 2, 2, 1, 0][na % 6] === [0, 1, 2, 2, 1, 0][nb % 6] ? 0 : 8,
  };
}

export const gunaScore = (k: Record<Koota, number>) => KOOTAS.reduce((s, x) => s + k[x], 0);

/** A word for a score out of 36, as people usually read it; never "bad". */
export const scoreBand = (score: number): 'great' | 'good' | 'fair' | 'growing' => (score >= 28 ? 'great' : score >= 22 ? 'good' : score >= 18 ? 'fair' : 'growing');

// ---------- Numerology ----------

/** The life path number: the birth date's digits added until one digit is left (1 to 9). */
export function lifePath(date: string): number {
  let n = [...date.replace(/\D/g, '')].reduce((s, d) => s + Number(d), 0);
  while (n > 9) n = [...String(n)].reduce((s, d) => s + Number(d), 0);
  return n;
}

// ---------- The form and the server's answers ----------

/** Age on a day, from a birth date. */
export function ageOn(date: string, today: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

/** '' when the birth details can be saved, else the code. As public.cosmic_save. */
export function checkBirth(date: string, time: string | null, myAge: number, today: string): '' | 'PL246' | 'PL247' | 'PL248' {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) return 'PL246';
  const age = ageOn(date, today);
  if (age < 18 || age > 99) return 'PL246';
  if (Math.abs(age - myAge) > 1) return 'PL247';
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'PL248';
  return '';
}

export interface CosmicMe {
  on: boolean;
  birthDate: string | null;
  birthTime: string | null;
  moon: number | null;
}
export interface CosmicPair {
  profileId: string;
  /** Null until they turn it on too. */
  score: number | null;
  kootas: Record<Koota, number> | null;
  myNumber: number | null;
  theirNumber: number | null;
}
export interface Cosmic {
  me: CosmicMe;
  /** The people I matched with, each with our score once both are on. */
  pairs: CosmicPair[];
}

export const emptyCosmic: Cosmic = { me: { on: false, birthDate: null, birthTime: null, moon: null }, pairs: [] };

const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);

export function cosmicFrom(raw: unknown): Cosmic {
  const r = (raw ?? {}) as Record<string, unknown>;
  const m = (r.me ?? {}) as Record<string, unknown>;
  const pairs = (Array.isArray(r.pairs) ? r.pairs : []).flatMap((x): CosmicPair[] => {
    const p = (x ?? {}) as Record<string, unknown>;
    if (typeof p.profile_id !== 'string') return [];
    const k = p.kootas as Record<string, unknown> | null;
    const ks = k && KOOTAS.every((x) => num(k[x]) !== null) ? (Object.fromEntries(KOOTAS.map((x) => [x, num(k[x])!])) as Record<Koota, number>) : null;
    return [{ profileId: p.profile_id, score: ks ? num(p.score) : null, kootas: ks, myNumber: num(p.my_number), theirNumber: num(p.their_number) }];
  });
  const on = m.on === true;
  return {
    me: { on, birthDate: on && typeof m.birth_date === 'string' ? m.birth_date : null, birthTime: on && typeof m.birth_time === 'string' ? m.birth_time : null, moon: on ? num(m.moon) : null },
    pairs,
  };
}
