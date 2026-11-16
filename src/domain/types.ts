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

export type InviteStatus = 'sent' | 'half_locked' | 'locked' | 'kept' | 'flaked' | 'declined' | 'expired';

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
