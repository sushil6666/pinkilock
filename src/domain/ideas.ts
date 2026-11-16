/** The micro-date catalogue. Small on purpose: every idea is short, cheap and easy to say yes to. */
import type { MicroDateIdea } from './types';

export const IDEAS: MicroDateIdea[] = [
  { id: 'video_coffee', title: '10-min video coffee', emoji: '☕', minutes: 10, kind: 'video', blurb: 'Cameras on, one cup, hard stop at ten.' },
  { id: 'boba_run', title: 'Boba run', emoji: '🧋', minutes: 25, kind: 'irl', blurb: 'Order, walk one block, done.' },
  { id: 'coop_game', title: 'Co-op mobile game', emoji: '🎮', minutes: 20, kind: 'game', blurb: 'Two rounds, same team, voice on.' },
  { id: 'chai_walk', title: 'Chai and a walk', emoji: '🍵', minutes: 20, kind: 'irl', blurb: 'Cutting chai, one lap of the block.' },
  { id: 'playlist_swap', title: 'Playlist swap', emoji: '🎧', minutes: 15, kind: 'video', blurb: 'Three songs each. Defend your picks.' },
  { id: 'bookstore_lap', title: 'Bookstore lap', emoji: '📚', minutes: 30, kind: 'irl', blurb: 'Pick a book for each other. No buying required.' },
  { id: 'momo_stop', title: 'Momo stop', emoji: '🥟', minutes: 20, kind: 'irl', blurb: 'One plate, split it, rate the chutney.' },
  { id: 'sunset_spot', title: 'Sunset spot', emoji: '🌇', minutes: 30, kind: 'irl', blurb: 'Show up for golden hour, leave when it is dark.' },
  { id: 'meme_duel', title: 'Meme duel', emoji: '😂', minutes: 10, kind: 'game', blurb: 'Five memes each. Loser plans the real date.' },
  { id: 'bad_portraits', title: 'Draw each other badly', emoji: '✏️', minutes: 10, kind: 'video', blurb: 'Sixty seconds, wrong hand, reveal together.' },
  { id: 'ice_cream_lap', title: 'Ice cream lap', emoji: '🍦', minutes: 20, kind: 'irl', blurb: 'One scoop, one lap, swap a bite.' },
  { id: 'word_race', title: 'Word puzzle race', emoji: '🔤', minutes: 10, kind: 'game', blurb: 'Same puzzle, same time, first to solve wins.' },
];

const byId = new Map(IDEAS.map((i) => [i.id, i]));

export function ideaOf(id: string): MicroDateIdea {
  return byId.get(id) ?? IDEAS[0];
}

export const KIND_LABEL: Record<MicroDateIdea['kind'], string> = { video: 'Video', irl: 'In person', game: 'Game' };

export const VIBES = [
  'night owl', 'early bird', 'overthinker', 'gym rat', 'homebody', 'foodie', 'film nerd', 'thrifter',
  'dog person', 'cat person', 'gamer', 'bookworm', 'plant parent', 'chai over coffee', 'concert goer', 'meme dealer',
];
