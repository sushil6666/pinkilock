/**
 * How people reach each other after a kept promise, by region (docs/build-plan.md, WP9). A kind
 * with no `countries` works everywhere; the others show only where people use them. The same rows
 * are the `contact_kinds` table (supabase/migrations/20261118000003_picked_fields.sql), checked by
 * tests/unit/areas.test.ts.
 */
export interface ContactKindInfo {
  kind: string;
  /** Asked for as a phone number rather than a handle. */
  phone: boolean;
  countries: string[] | null;
}

export const CONTACT_KINDS: ContactKindInfo[] = [
  { kind: 'Instagram', phone: false, countries: null },
  { kind: 'Snapchat', phone: false, countries: null },
  { kind: 'WhatsApp', phone: true, countries: null },
  { kind: 'Telegram', phone: false, countries: null },
  { kind: 'Signal', phone: false, countries: null },
  { kind: 'LINE', phone: false, countries: ['JP', 'TH', 'TW'] },
  { kind: 'KakaoTalk', phone: false, countries: ['KR'] },
  { kind: 'WeChat', phone: false, countries: ['CN'] },
];

/** The kinds a person in this country can pick, in catalogue order. */
export const contactKindsFor = (country: string): ContactKindInfo[] =>
  CONTACT_KINDS.filter((k) => !k.countries || k.countries.includes(country));

export const contactKindOf = (kind: string): ContactKindInfo | undefined => CONTACT_KINDS.find((k) => k.kind === kind);
