/**
 * Festive packs (D128): for a few days around a festival, Plans shows a pack of plan ideas that fit
 * it, and Couple mode's Today a festive challenge for the two. Christmas and New Year first; more
 * festivals join the list as packs are written (one with a lunar date gets its dates per year).
 * In the app only, from the catalogue already offered in my city: no new table, no push.
 * Pure TypeScript: no React Native, so unit tests load it in plain Node. Words in `festivals.<id>`.
 */
import { ideasFor } from './ideas';
import type { MicroDateIdea } from './types';

export const FESTIVE_IDEAS = 3;

export interface Festival {
  id: 'christmas' | 'new_year';
  emoji: string;
  /** First and last day, `MM-DD` in India's time; `to` before `from` runs over the new year. */
  from: string;
  to: string;
  /** Catalogue ideas that fit, best first; the first three offered in my city show. */
  ideas: readonly string[];
}

export const FESTIVALS: readonly Festival[] = [
  { id: 'christmas', emoji: '🎄', from: '12-18', to: '12-26', ideas: ['night_market', 'photo_walk', 'dress_up_coffee', 'bookstore_lap', 'karaoke_duet', 'ice_cream_lap'] },
  { id: 'new_year', emoji: '🎆', from: '12-27', to: '01-01', ideas: ['sunset_spot', 'playlist_swap', 'dress_up_coffee', 'two_truths', 'photo_booth', 'chai_walk'] },
];

/** A moment's day in India's time, as `MM-DD`. */
export const monthDay = (at: number) => new Date(at + 330 * 60_000).toISOString().slice(5, 10);

/** The festival whose days include this moment, or null. */
export function festivalOn(at: number): Festival | null {
  const d = monthDay(at);
  return FESTIVALS.find((f) => (f.from <= f.to ? d >= f.from && d <= f.to : d >= f.from || d <= f.to)) ?? null;
}

/** The pack's ideas offered in my city, at most three. */
export function festiveIdeas(f: Festival, country: string | undefined, city: string | undefined): MicroDateIdea[] {
  const offered = ideasFor(country, city);
  return f.ideas.flatMap((id) => offered.filter((i) => i.id === id)).slice(0, FESTIVE_IDEAS);
}
