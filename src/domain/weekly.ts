/**
 * This week's plan ideas and city events (D121): a reason to make the next plan, every week, on Plans.
 *
 * The three ideas are picked in the phone from the catalogue offered in my city (ideasFor), new each
 * Monday and never last week's again, of different kinds where they can be. Events come from the server (`city_events()`), written by
 * the team. Pure TypeScript: no React Native, so unit tests load it in plain Node.
 */
import { ideasFor, ideaOf } from './ideas';
import { isDone, otherId, isDouble } from './invites';
import type { Invite, MicroDateIdea, Profile } from './types';

export const WEEKLY_IDEAS = 3;

export interface CityEvent {
  id: string;
  title: string;
  emoji: string;
  /** In a few words; a venue's name and area when it is on the list. */
  place: string;
  venueId: string | null;
  ideaId: string | null;
  startsAt: number;
  endsAt: number;
  url: string | null;
  free: boolean;
}

/** The Monday a moment's week starts on, in India's time, as `YYYY-MM-DD`. */
export function mondayOf(at: number): string {
  const d = new Date(at + 330 * 60_000);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)).toISOString().slice(0, 10);
}

function hash(s: string): number {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Ideas looked at each week: consecutive weeks take different stretches of my own order of the catalogue. */
const WINDOW = 9;

/**
 * This week's ideas for me: three, new each Monday. Each person has their own order of the ideas
 * offered in their city; each week takes the next nine in it and picks three of different kinds, the
 * kinds I said I am up for first. So no idea comes back the week after (with 18 or more offered; every open city has more).
 */
export function weeklyIdeas(me: Pick<Profile, 'id' | 'country' | 'city' | 'ideaIds'>, now: number): MicroDateIdea[] {
  const pool = [...ideasFor(me.country, me.city)].sort((a, b) => hash(`${me.id}:${a.id}`) - hash(`${me.id}:${b.id}`) || a.id.localeCompare(b.id));
  if (!pool.length) return [];
  const week = Math.round(Date.parse(`${mondayOf(now)}T00:00:00Z`) / (7 * 86_400_000));
  const start = (week * WINDOW) % pool.length;
  const window = Array.from({ length: Math.min(WINDOW, pool.length) }, (_, k) => pool[(start + k) % pool.length]);
  const kinds = new Set(me.ideaIds.map((id) => ideaOf(id).kind));
  const ranked = [...window.filter((i) => kinds.has(i.kind)), ...window.filter((i) => !kinds.has(i.kind))];
  const out: MicroDateIdea[] = [];
  for (const i of ranked) if (out.length < WEEKLY_IDEAS && !out.some((o) => o.kind === i.kind)) out.push(i);
  for (const i of ranked) if (out.length < WEEKLY_IDEAS && !out.includes(i)) out.push(i);
  return out;
}

/**
 * People I kept a plan for two with, most recent first, once each: whom "Ask" offers first. The
 * store holds only people I may still see (a block removes them), so this never brings one back.
 */
export function keptWith(invites: Invite[], meId: string): string[] {
  const ids = invites.filter((i) => isDone(i) && i.status === 'kept' && !isDouble(i)).sort((a, b) => b.startsAt - a.startsAt).map((i) => otherId(i, meId));
  return [...new Set(ids)];
}

/** Happening now (started, not over). */
export const isOn = (e: CityEvent, now: number) => e.startsAt <= now && now < e.endsAt;
