/** The nouns of Pinkilock. Field names mirror the SQL columns in supabase/schema.sql. */

export type IdeaKind = 'video' | 'irl' | 'game';

export interface MicroDateIdea {
  id: string;
  title: string;
  emoji: string;
  minutes: number;
  kind: IdeaKind;
  blurb: string;
}

export type ContactKind = 'Instagram' | 'Snapchat' | 'WhatsApp';

/** The public card. Nothing here is gated. */
export interface Profile {
  id: string;
  name: string;
  age: number;
  city: string;
  area: string;
  pronouns: string;
  tagline: string;
  vibes: string[];
  ideaIds: string[];
  /** Two colours for the generated portrait; the prototype ships no photos of real people. */
  palette: [string, string];
  glyph: string;
  kept: number;
  flaked: number;
  /** Set when the score came from the analytics worker; absent in the mock, which computes it. */
  trustScore?: number;
  distanceKm: number;
  /** How many extra photos exist. The photos themselves live behind the reveal. */
  photoCount: number;
}

/** What a kept promise unlocks. Only ever returned by Backend.getReveal. */
export interface Reveal {
  profileId: string;
  contactKind: ContactKind;
  contactHandle: string;
  /** Captions stand in for photos in the prototype. */
  photos: { caption: string; palette: [string, string]; glyph: string }[];
}

/** `ended`: closed by a block or an account deletion. Nobody's flake. */
export type InviteStatus = 'sent' | 'half_locked' | 'locked' | 'kept' | 'flaked' | 'declined' | 'expired' | 'ended';

export interface Invite {
  id: string;
  fromId: string;
  toId: string;
  ideaId: string;
  startsAt: number;
  minutes: number;
  place: string;
  note: string;
  status: InviteStatus;
  createdAt: number;
  expiresAt: number;
  firstPinkyBy: string | null;
  lockedAt: number | null;
  checkIns: string[];
  flakedBy: string | null;
  declinedBy: string | null;
  resolvedAt: number | null;
}

export interface NewInvite {
  toId: string;
  ideaId: string;
  startsAt: number;
  place: string;
  note: string;
  /** A picked venue (src/domain/venues.ts). When set, the server writes the place from it. */
  venueId?: string;
}

export interface OnboardingInput {
  name: string;
  age: number;
  area: string;
  pronouns: string;
  tagline: string;
  vibes: string[];
  ideaIds: string[];
  contactKind: ContactKind;
  contactHandle: string;
}

export interface MyContact {
  kind: ContactKind;
  handle: string;
}

/** Someone I blocked, for the unblock list. Who blocked me is never known to the app. */
export interface BlockedPerson {
  profileId: string;
  name: string;
  blockedAt: number;
}

export type ReportReason = 'fake' | 'harassment' | 'inappropriate' | 'underage' | 'unsafe' | 'shared_contact' | 'other';

export interface NewReport {
  profileId: string;
  reason: ReportReason;
  detail: string;
  /** The invite it is about, if any. The server drops it unless the two of you share it. */
  inviteId?: string;
}

/**
 * How this person signs in. Anonymous until a phone number or an email address is linked; the id
 * never changes. Either one is enough to get back in on a new phone.
 */
export interface Account {
  phone: string | null;
  email: string | null;
  /** Whether the backend can text sign-in codes (an SMS provider is configured). */
  phoneAvailable: boolean;
  /** Whether the backend can email sign-in codes (a mail sender is configured). */
  emailAvailable: boolean;
  /** Mock only: the one code it accepts, so the screen can say so. */
  mockCode?: string;
}

/** Where a sign-in code goes. */
export type CodeKind = 'phone' | 'email';
/** `link` adds the address to the person signed in; `sign_in` gets back into an existing account. */
export type CodeMode = 'link' | 'sign_in';
