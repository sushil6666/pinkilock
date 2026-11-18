/**
 * What a profile and an ask may contain (docs/build-plan.md, WP1). The server is the authority:
 * `save_profile` and `send_invite` in supabase/migrations enforce the same rules with the same
 * error codes. This copy lets the app say no before the server does, and makes the mock behave
 * the same. tests/unit/profile.test.ts runs one table of lines through this file, and
 * tests/db/profile_rules.sql runs the same table through the SQL.
 *
 * The contact check stops the plain cases (a handle, a link, a number, "add me on ..."). It does
 * not stop an invented code; that needs review before a line is shown (WP1, not built yet).
 */
import { areasIn } from './areas';
import { contactKindOf, contactKindsFor } from './contacts';
import { AppError } from './errors';
import { CITIES } from './countries';
import { IDEAS, VIBES, offeredIn } from './ideas';
import type { OnboardingInput } from './types';

export const NAME_MIN = 2;
export const NAME_MAX = 16;
export const AREA_MAX = 40;
export const PRONOUNS_MAX = 20;
export const TAGLINE_MAX = 80;
export const PLACE_MAX = 60;
export const VIBES_MAX = 3;
export const IDEAS_MIN = 3;
export const IDEAS_MAX = 6;

/** A first name: one word of letters. No digits, spaces, dots, underscores or symbols. */
export function nameOk(name: string): boolean {
  const n = name.trim();
  const length = [...n].length;
  return length >= NAME_MIN && length <= NAME_MAX && !/[\d\s\p{P}\p{S}]/u.test(n);
}

const APPS = 'instagram|insta|snapchat|whatsapp|telegram|discord|facebook|tiktok|twitter|wechat|kakao|linkedin';
const PHRASES = 'add me|find me on|dm me|text me|call me|ping me|hit me up|my number|my handle|my id|decode';
const DIGIT_WORDS = 'zero|one|two|three|four|five|six|seven|eight|nine';

/** The same five patterns as private.looks_like_contact in SQL. Keep them identical. */
const CONTACT_PATTERNS: RegExp[] = [
  /@/,
  new RegExp('(https?://|www\\.|[a-z0-9-]+\\.(com|in|me|io|co|net|org|app|ly|gg|link)([^a-z]|$))'),
  /[0-9]([ .()-]*[0-9]){4,}/,
  new RegExp(`(^|[^a-z])(${APPS}|ig|${PHRASES})([^a-z]|$)`),
  new RegExp(`(^|[^a-z])(${DIGIT_WORDS})([^a-z]+(${DIGIT_WORDS})){3,}([^a-z]|$)`),
];

/** True when a line looks like a way to reach the writer outside the app. */
export function looksLikeContact(text: string | null | undefined): boolean {
  const t = (text ?? '').toLowerCase();
  return CONTACT_PATTERNS.some((p) => p.test(t));
}

/** Pronouns are picked, never typed (WP1). The same list is `pronoun_options` in SQL. */
export const PRONOUN_OPTIONS = ['she/her', 'he/him', 'they/them', 'she/they', 'he/they', 'any pronouns'];

const ideaIds = new Set(IDEAS.map((i) => i.id));
const vibeSet = new Set(VIBES);

/**
 * Throws the same coded error the server would for a profile it would refuse. `city` makes the area
 * a pick from that city's list (when it has one); `was` is the saved profile, whose area and
 * pronouns stay valid even if they were typed before lists existed.
 */
export function checkProfile(
  p: Pick<OnboardingInput, 'name' | 'age' | 'area' | 'pronouns' | 'tagline' | 'vibes' | 'ideaIds'>,
  city = 'Mumbai',
  was?: { area: string; pronouns: string; ideaIds?: string[] },
): void {
  if (!nameOk(p.name)) throw new AppError('PL060');
  if (!Number.isInteger(p.age) || p.age < 18 || p.age > 99) throw new AppError('PL061');
  if (p.vibes.length > VIBES_MAX || new Set(p.vibes).size !== p.vibes.length || p.vibes.some((v) => !vibeSet.has(v))) throw new AppError('PL062');
  if (p.ideaIds.length < IDEAS_MIN || p.ideaIds.length > IDEAS_MAX || new Set(p.ideaIds).size !== p.ideaIds.length || p.ideaIds.some((id) => !ideaIds.has(id))) throw new AppError('PL063');
  if ([...p.area.trim()].length > AREA_MAX || [...p.pronouns.trim()].length > PRONOUNS_MAX || [...p.tagline.trim()].length > TAGLINE_MAX) throw new AppError('PL064');
  if (looksLikeContact(p.tagline) || looksLikeContact(p.area) || looksLikeContact(p.pronouns)) throw new AppError('PL065');
  const area = p.area.trim();
  if (area && area !== was?.area && areasIn(city).length && !areasIn(city).includes(area)) throw new AppError('PL095');
  const pronouns = p.pronouns.trim();
  if (pronouns && pronouns !== was?.pronouns && !PRONOUN_OPTIONS.includes(pronouns)) throw new AppError('PL096');
  const country = CITIES.find((c) => c.name === city)?.country;
  if (p.ideaIds.some((id) => !was?.ideaIds?.includes(id) && !offeredIn(id, country))) throw new AppError('PL104');
}

/**
 * A contact handle in its stored form, or the coded error the server gives (D077). The same rules
 * as private.normalize_contact in supabase/migrations/20261118000004_contact_checks.sql; HANDLE_CASES
 * below runs through both.
 *   Instagram  1 to 30 of a-z 0-9 . _ ; no dot first or last, no two dots together. "@name".
 *   Snapchat   3 to 15 of a-z 0-9 . _ - ; a letter first, a letter or digit last. "name".
 *   WhatsApp   a mobile number. With + (or 00) it carries its own country code, 8 to 15 digits; an
 *              Indian one must be 10 digits from 6 to 9. Without, it is read as Indian (with or
 *              without 91 or 0). "+91 XXXXX XXXXX" in India, "+<digits>" elsewhere.
 *   The rest   2 to 40 characters, as typed (their apps have no single rule worth copying yet).
 * A leading @ and a pasted profile link are taken off.
 */
export function normalizeContact(kind: string, handle: string): string {
  let h = handle.trim().toLowerCase();
  if (kind === 'Instagram') {
    h = h.replace(/^(https?:\/\/)?(www\.)?(instagram\.com|instagr\.am)\//, '').replace(/[/?#].*$/, '').replace(/^@/, '');
    if (!/^[a-z0-9._]{1,30}$/.test(h) || h.startsWith('.') || h.endsWith('.') || h.includes('..')) throw new AppError('PL097');
    return `@${h}`;
  }
  if (kind === 'Snapchat') {
    h = h.replace(/^(https?:\/\/)?(www\.)?snapchat\.com\/(add\/)?/, '').replace(/[/?#].*$/, '').replace(/^@/, '');
    if (!/^[a-z][a-z0-9._-]{1,13}[a-z0-9]$/.test(h)) throw new AppError('PL098');
    return h;
  }
  if (kind === 'WhatsApp') {
    if (!/^[0-9+ ()-]+$/.test(h)) throw new AppError('PL099');
    let d = h.replace(/[^0-9]/g, '');
    const international = /^[ (]*\+/.test(h) || d.startsWith('00');
    if (international) {
      d = d.replace(/^00/, '');
      if (!d.startsWith('91')) {
        if (!/^[1-9][0-9]{7,14}$/.test(d)) throw new AppError('PL099');
        return `+${d}`;
      }
      d = d.slice(2);
    } else if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
    else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
    if (!/^[6-9][0-9]{9}$/.test(d)) throw new AppError('PL099');
    return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  }
  const raw = handle.trim();
  if ([...raw].length < 2 || [...raw].length > 40 || !contactKindOf(kind)) throw new AppError('PL066');
  return raw;
}

/** A contact kind offered in this country (src/domain/contacts.ts), in its stored form. */
export function checkContact(kind: string, handle: string, country = 'IN'): string {
  if (!contactKindsFor(country).some((k) => k.kind === kind) || !handle.trim()) throw new AppError('PL066');
  return normalizeContact(kind, handle);
}

/** True when this handle would be saved (the form's Next button). */
export function handleOk(kind: string, handle: string, country = 'IN'): boolean {
  try {
    checkContact(kind, handle, country);
    return true;
  } catch {
    return false;
  }
}

/** Where "Check it" opens, so the person sees the account others will get. Null for apps with no web link. */
export function contactLink(kind: string, stored: string): string | null {
  if (kind === 'Instagram') return `https://instagram.com/${stored.replace(/^@/, '')}`;
  if (kind === 'Snapchat') return `https://snapchat.com/add/${stored}`;
  if (kind === 'WhatsApp') return `https://wa.me/${stored.replace(/[^0-9]/g, '')}`;
  if (kind === 'Telegram') return `https://t.me/${stored.replace(/^@/, '')}`;
  return null;
}

/** The kinds a handle can be proved for (D078): the ones Meta sends us messages from. */
export const PROVABLE_KINDS = ['WhatsApp', 'Instagram'];

/** Where a proof code goes: a WhatsApp chat with the code typed in, or the Instagram account's DMs. */
export function proofLink(kind: string, to: string, code: string): string {
  if (kind === 'WhatsApp') return `https://wa.me/${to.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(code)}`;
  return `https://ig.me/m/${to.replace(/^@/, '')}`;
}

/** The one line and the place on an ask. */
export function checkAsk(note: string, place: string): void {
  if ([...place.trim()].length > PLACE_MAX) throw new AppError('PL064');
  if (looksLikeContact(note) || looksLikeContact(place)) throw new AppError('PL065');
}

/**
 * One table for both copies of the contact check: [line, should it be refused].
 * tests/unit/profile.test.ts and tests/db/profile_rules.sql both run it.
 */
export const CONTACT_CASES: [string, boolean][] = [
  ['dm me on insta @xavier.real', true],
  ['@aanya', true],
  ['aanya.frames on IG', true],
  ['find me on snapchat', true],
  ['whatsapp is easier', true],
  ['telegram: sam_k', true],
  ['call me 98765 43210', true],
  ['9876543210', true],
  ['+91 (98765) 43-210', true],
  ['98.76.54.32.10', true],
  ['wa.me/919876543210', true],
  ['https://example.com/me', true],
  ['www.example.org', true],
  ['sam-k.io', true],
  ['add me, you know where', true],
  ['text me after', true],
  ['hit me up', true],
  ['my number is in the name', true],
  ['my handle is the same everywhere', true],
  ['nine eight seven six five, then four three two one zero', true],
  ['One Two Three Four', true],
  ['decode the first letters', true],
  ['Insta', true],
  ['discord gang', true],
  ['Will judge your boba order. Lovingly.', false],
  ['Ten minutes of coffee, zero minutes of small talk.', false],
  ['Three songs. I will know everything about you.', false],
  ['Golden hour or nothing.', false],
  ['born in 1999, 5 feet 10', false],
  ['my toxic trait: I am always early', false],
  ['the ick: clapping when the plane lands', false],
  ['ask me about my plants', false],
  ['Bandra West', false],
  ['Sector 15, Noida', false],
  ['she/her', false],
  ['Boba counter, Linking Road', false],
  ['one more round, then two more', false],
  ['big fan of bad puns', false],
  ['coming in hot', false],
  ['i will be early. it is a whole thing.', false],
  ['you, me, twenty minutes. that is the pitch.', false],
  ['pinky promise to keep it pg. ish.', false],
  ['Co-op game, 2 rounds', false],
  ['signal me with a wave', false],
];

/**
 * One table for both copies of the handle rule: [kind, typed, stored form or the error code].
 * tests/unit/profile.test.ts and tests/db/profile_rules.sql both run it.
 */
export const HANDLE_CASES: [string, string, string][] = [
  ['Instagram', '@riya', '@riya'],
  ['Instagram', 'riya', '@riya'],
  ['Instagram', ' @Riya.Frames ', '@riya.frames'],
  ['Instagram', 'r', '@r'],
  ['Instagram', 'riya_k.99', '@riya_k.99'],
  ['Instagram', 'https://www.instagram.com/riya.frames/', '@riya.frames'],
  ['Instagram', 'instagram.com/riya?igsh=abc', '@riya'],
  ['Instagram', 'a'.repeat(30), '@' + 'a'.repeat(30)],
  ['Instagram', 'a'.repeat(31), 'PL097'],
  ['Instagram', '@iabc', '@iabc'],
  ['Instagram', '.riya', 'PL097'],
  ['Instagram', 'riya.', 'PL097'],
  ['Instagram', 'ri..ya', 'PL097'],
  ['Instagram', 'riya-k', 'PL097'],
  ['Instagram', 'riya k', 'PL097'],
  ['Instagram', '@@riya', 'PL097'],
  ['Instagram', '@', 'PL097'],
  ['Instagram', 'प्रिया', 'PL097'],
  ['Snapchat', 'sana', 'sana'],
  ['Snapchat', '@Sana.K', 'sana.k'],
  ['Snapchat', 'sana-k_99', 'sana-k_99'],
  ['Snapchat', 'https://www.snapchat.com/add/sana_k', 'sana_k'],
  ['Snapchat', 'abc', 'abc'],
  ['Snapchat', 'ab', 'PL098'],
  ['Snapchat', 'a' + 'b'.repeat(14), 'a' + 'b'.repeat(14)],
  ['Snapchat', 'a' + 'b'.repeat(15), 'PL098'],
  ['Snapchat', '9sana', 'PL098'],
  ['Snapchat', 'sana_', 'PL098'],
  ['Snapchat', 'sa na', 'PL098'],
  ['WhatsApp', '+91 98765 43210', '+91 98765 43210'],
  ['WhatsApp', '9876543210', '+91 98765 43210'],
  ['WhatsApp', '919876543210', '+91 98765 43210'],
  ['WhatsApp', '09876543210', '+91 98765 43210'],
  ['WhatsApp', '+91-98765-43210', '+91 98765 43210'],
  ['WhatsApp', '(+91) 98765 43210', '+91 98765 43210'],
  ['WhatsApp', '6000000001', '+91 60000 00001'],
  ['WhatsApp', '5876543210', 'PL099'],
  ['WhatsApp', '+91 00000 00001', 'PL099'],
  ['WhatsApp', '98765 4321', 'PL099'],
  ['WhatsApp', '98765 432100', 'PL099'],
  ['WhatsApp', '+1 415 555 0100', '+14155550100'],
  ['WhatsApp', '+44 7911 123456', '+447911123456'],
  ['WhatsApp', '0044 7911 123456', '+447911123456'],
  ['WhatsApp', '+91 5876543210', 'PL099'],
  ['WhatsApp', '+0 12345678', 'PL099'],
  ['WhatsApp', '+1234567', 'PL099'],
  ['WhatsApp', '+1234567890123456', 'PL099'],
  ['WhatsApp', 'wa.me/919876543210', 'PL099'],
  ['WhatsApp', 'nine eight seven', 'PL099'],
  ['Telegram', ' @riya_k ', '@riya_k'],
  ['Signal', 'riya.01', 'riya.01'],
  ['Telegram', 'r', 'PL066'],
  ['Email', 'riya@example.com', 'PL066'],
];
