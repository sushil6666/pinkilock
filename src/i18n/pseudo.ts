/**
 * Pseudo-languages for testing (src/i18n/index.ts). `long` swaps letters for accented ones and
 * pads each string by about a third, the way German or Tamil runs longer than English; text that
 * still reads plain on screen was never put through `t()`. `rtl` writes each string right to left,
 * to check that layouts mirror. `{placeholders}` stay as they are.
 */
const ACCENTS: Record<string, string> = {
  a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
  n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
  A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
  N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
};

const RLO = '‮';
const PDF = '‬';

function one(s: string, kind: 'long' | 'rtl'): string {
  // Keep {name} whole; change only the words around it.
  const parts = s.split(/(\{\w+\})/);
  if (kind === 'rtl') return parts.map((p) => (/^\{\w+\}$/.test(p) || !p ? p : RLO + p + PDF)).join('');
  const body = parts.map((p) => (/^\{\w+\}$/.test(p) ? p : [...p].map((ch) => ACCENTS[ch] ?? ch).join(''))).join('');
  const letters = s.replace(/\{\w+\}/g, '').length;
  return `[${body}${letters > 3 ? ' ' + '·'.repeat(Math.ceil(letters / 3)) : ''}]`;
}

export function pseudo<T>(strings: T, kind: 'long' | 'rtl'): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return one(v, kind);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(strings) as T;
}
