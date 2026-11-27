/**
 * The paid switch (D117, Sushil 2026-11-27): every feature that takes money is paused until
 * Pinkilock has a good number of users. One switch, `paid`, off by default, kept on the server
 * (`private.config`, read by `public.app_switches()`) and set by the Supabase deploy from the
 * repository variable PAID_FEATURES (on / off). Turning it back on needs no code change: set the
 * variable to `on` and run the Supabase deploy (OPERATIONS.md, "Paid features").
 *
 * Sushil, the same day: "all those paid service we will keep, so that referral people will get
 * something". So the features stay on screen and keep working; only taking money stops.
 *
 * While it is off:
 *  - Nothing can be bought: no credit packs, no Pink Gold plans, no Boost packs (PL188). The app
 *    shows no prices and no Pay buttons, on the phone and on the website.
 *  - Pink Gold, its badge and perks, and Boosts keep working for whoever has them. The team (and a
 *    referral programme, later) can give them as rewards: private.pink_gold_gift, private.boost_gift.
 *  - Saathi is free: one 15-minute session a day (local calendar day) for everyone, which caps
 *    what the AI costs. A chat that mentions self-harm stays free and is never cut off, as before.
 *  - Paid calls with human listeners wait (PL188). The free first call (D109) still works.
 *  - Spicy mode's unlock is free, one new unlock per person per 7 days (PL190, Sushil's pick).
 *  - Treat the plan waits (it is paid from bought credits only, PL188).
 *  - Earned credits still work: stakes and extra asks.
 *
 * The code and the tables all stay; the server enforces every one of these, the app only follows.
 * Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */

export interface Switches {
  /** Payments are on: buying, paid Saathi sessions, paid listener calls, the paid Spicy unlock. */
  paid: boolean;
}

/** What the app assumes until the server answers, and on any error: paused. */
export const PAUSED: Switches = { paid: false };

/** Saathi while paused: this many free sessions a day (Indian calendar day). */
export const SAATHI_FREE_PER_DAY = 1;
/** Spicy while paused: one free unlock per person in this many days. */
export const SPICY_FREE_DAYS = 7;

const DAY = 24 * 3_600_000;

/** When my next free Spicy unlock opens, from my free unlocks so far: null when it is open now. */
export function spicyFreeNext(myFreeUnlocks: readonly number[], now: number): number | null {
  const recent = myFreeUnlocks.filter((at) => at > now - SPICY_FREE_DAYS * DAY);
  return recent.length ? Math.max(...recent) + SPICY_FREE_DAYS * DAY : null;
}

/** The app reads the switch from the server's answer; anything but a plain true is off. */
export function switchesFrom(raw: unknown): Switches {
  const paid = !!raw && typeof raw === 'object' && (raw as { paid?: unknown }).paid === true;
  return { paid };
}
