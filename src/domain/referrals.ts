/**
 * Bring a friend (D118). The same rules are in supabase/migrations/20261127000002_referrals.sql
 * (private.referral_check, private.referral_settle): change both together.
 *
 * A friend joins with my link (/r/CODE, the same link as Talk's free first call, D109) or with my
 * Doubles invite (/duo/TOKEN). They count once they have a verified phone, a finished profile (an
 * approved face photo and a plan they are up for) and a device no other account has used. Then we
 * both get a week of Pink Gold, I get a free Boost, and my fifth friend who counts gives me a month.
 * Nothing is ever given for a rating or a review.
 */

/** Days of Pink Gold each of us gets when a friend counts. */
export const REFERRAL_GOLD_DAYS = 7;
/** Boosts I get for each friend who counts. */
export const REFERRAL_BOOSTS = 1;
/** My friend number this many gives me REFERRAL_MONTH_DAYS more, once. */
export const REFERRAL_MONTH_AT = 5;
export const REFERRAL_MONTH_DAYS = 30;
/** At most this many friends count in any REFERRAL_WINDOW_DAYS; the rest wait. */
export const REFERRAL_CAP = 10;
export const REFERRAL_WINDOW_DAYS = 30;

/** What a friend still has to do before they count. Shown to the friend only. */
export interface ReferralNeeds {
  phone: boolean;
  face: boolean;
  plans: boolean;
  device: boolean;
}
export const NEED_KEYS = ['phone', 'face', 'plans', 'device'] as const;

export const referralCounts = (n: ReferralNeeds): boolean => n.phone && n.face && n.plans && n.device;

export interface MyReferrals {
  /** My link's code (the same as Talk's). */
  code: string;
  /** Friends who joined with my link or my Doubles invite, and how many of them count. */
  joined: number;
  counted: number;
  /** My free month has been given. */
  month: boolean;
  /** A verified phone is needed (the server's `referral_needs_phone`, off until phone sign-in is live); else an email does too. */
  needsPhone: boolean;
  /** I joined with someone's link: my own checklist. */
  mine: (ReferralNeeds & { counted: boolean; via: 'link' | 'duo' }) | null;
}

export const emptyReferrals = (): MyReferrals => ({ code: '', joined: 0, counted: 0, month: false, needsPhone: false, mine: null });

/** What my friends who count have given me so far. */
export function referralRewards(counted: number): { goldDays: number; boosts: number; month: boolean } {
  const month = counted >= REFERRAL_MONTH_AT;
  return { goldDays: counted * REFERRAL_GOLD_DAYS + (month ? REFERRAL_MONTH_DAYS : 0), boosts: counted * REFERRAL_BOOSTS, month };
}

/** How many more friends until my free month, or 0 once it is given. */
export const toMonth = (counted: number): number => Math.max(REFERRAL_MONTH_AT - counted, 0);

/** The device id this app makes once and keeps: random, never a hardware id. */
export const DEVICE_ID = /^[A-Za-z0-9_-]{16,64}$/;
