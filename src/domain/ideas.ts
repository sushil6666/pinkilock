/**
 * The micro-date catalogue. Every idea is short, cheap and easy to say yes to.
 * The same rows live in the `ideas` table (supabase/migrations): add an idea in both places.
 */
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
  { id: 'photo_booth', title: 'Photo booth strip', emoji: '📸', minutes: 15, kind: 'irl', blurb: 'Four frames, one strip, no retakes.' },
  { id: 'thrift_dare', title: 'Thrift dare', emoji: '🛍️', minutes: 30, kind: 'irl', blurb: 'Pick one loud thing for each other. Trying it on is the deal.' },
  { id: 'pani_puri_duel', title: 'Pani puri face-off', emoji: '🌶️', minutes: 15, kind: 'irl', blurb: 'Six each, spicy water, first to tap out pays.' },
  { id: 'arcade_round', title: 'Arcade round', emoji: '🕹️', minutes: 25, kind: 'irl', blurb: 'Three games, best of three. Loser picks the next plan.' },
  { id: 'matcha_run', title: 'Matcha run', emoji: '🍃', minutes: 20, kind: 'irl', blurb: 'Iced or hot, oat or not. Judge quietly.' },
  { id: 'dog_park_lap', title: 'Dog park lap', emoji: '🐕', minutes: 20, kind: 'irl', blurb: 'Borrow joy from other people\'s dogs. One lap.' },
  { id: 'fit_check', title: 'Fit check', emoji: '👟', minutes: 10, kind: 'video', blurb: 'Show today\'s fit, rate it out of ten, be kind.' },
  { id: 'study_sprint', title: 'Study sprint', emoji: '📖', minutes: 25, kind: 'video', blurb: 'Cameras on, mics off for twenty. Talk for the last five.' },
  { id: 'pet_cam', title: 'Pet cam', emoji: '🐾', minutes: 10, kind: 'video', blurb: 'Introduce the pet, the plant or the plushie.' },
  { id: 'trailer_reacts', title: 'Trailer reacts', emoji: '🍿', minutes: 15, kind: 'video', blurb: 'Three trailers, live reactions, pick one to watch someday.' },
  { id: 'hot_takes', title: 'Hot takes', emoji: '🔥', minutes: 10, kind: 'game', blurb: 'Five spicy opinions each. Agree or defend.' },
  { id: 'two_truths', title: 'Two truths, one lie', emoji: '🤥', minutes: 10, kind: 'game', blurb: 'Three rounds. Catch the lie, earn a question.' },
  { id: 'green_flags', title: 'Green flag check', emoji: '✅', minutes: 10, kind: 'game', blurb: 'Trade three green flags and one harmless ick.' },
];

const byId = new Map(IDEAS.map((i) => [i.id, i]));

export function ideaOf(id: string): MicroDateIdea {
  return byId.get(id) ?? IDEAS[0];
}

export const KIND_LABEL: Record<MicroDateIdea['kind'], string> = { video: 'Video', irl: 'In person', game: 'Game' };

/** The order the kinds are shown in when someone picks what they are up for. */
export const KIND_ORDER: MicroDateIdea['kind'][] = ['irl', 'video', 'game'];

/**
 * One thing to say first, per idea, shown on a locked plan. It is a nudge, not a script: there
 * is no chat before the date, so the first ten seconds are the hard part.
 */
const OPENERS: Record<string, string> = {
  video_coffee: 'What is in the cup, and is it your first today?',
  boba_run: 'Say your order out loud. Be judged.',
  coop_game: 'Who carries, and who talks?',
  chai_walk: 'Cutting or full? Sugar or none?',
  playlist_swap: 'Play the song you have had on repeat this week.',
  bookstore_lap: 'Which section do you always walk to first?',
  momo_stop: 'Steamed or fried? Choose carefully.',
  sunset_spot: 'Best sunset you have seen, and where?',
  meme_duel: 'Open with your strongest. No warm-up.',
  bad_portraits: 'Wrong hand only. No peeking.',
  ice_cream_lap: 'Cup or cone? Defend it.',
  word_race: 'Call your starting word before you begin.',
  photo_booth: 'Decide the four poses before the curtain closes.',
  thrift_dare: 'What is the worst thing you ever bought and still wear?',
  pani_puri_duel: 'Sweet, spicy or both? Answer before the first one lands.',
  arcade_round: 'Name the game you are weirdly good at.',
  matcha_run: 'Is matcha actually good, or are we all pretending?',
  dog_park_lap: 'Rate every dog out of ten. Nothing under an eight.',
  fit_check: 'What is the story behind the thing you are wearing?',
  study_sprint: 'Say what you are working on, then go quiet.',
  pet_cam: 'Who is it, and what is their most annoying habit?',
  trailer_reacts: 'Last film you loved that nobody else did?',
  hot_takes: 'Start mild: pineapple on pizza, yes or no?',
  two_truths: 'Make the lie boring. That is the trick.',
  green_flags: 'What is a green flag people never notice?',
};

export function openerOf(id: string): string {
  return OPENERS[id] ?? 'Say the first thing you noticed on the way here.';
}

/**
 * Ready-made lines for the one line that goes with an ask. Tapping one fills the box; it can
 * still be edited. Every line fits NOTE_MAX (80).
 */
const STARTERS_ANY = ['low stakes, high snacks.', 'hard stop, pinky promise.', 'no pressure, just vibes.', 'i will be early. it is a whole thing.'];
const STARTERS_BY_KIND: Record<MicroDateIdea['kind'], string[]> = {
  irl: ['i will be the one looking lost.', 'loser pays. not nervous at all.'],
  video: ['camera on, effort optional.', 'ten minutes, then you are free.'],
  game: ['prepare to lose, respectfully.', 'winner gets bragging rights only.'],
};

export function noteStarters(kind: MicroDateIdea['kind']): string[] {
  return [...STARTERS_BY_KIND[kind], ...STARTERS_ANY];
}

export const VIBES = [
  'night owl', 'early bird', 'overthinker', 'gym rat', 'homebody', 'foodie', 'film nerd', 'thrifter',
  'dog person', 'cat person', 'gamer', 'bookworm', 'plant parent', 'chai over coffee', 'concert goer', 'meme dealer',
  'chronically online', 'main character', 'golden retriever energy', 'black cat energy', 'side quest enjoyer', 'yapper',
  'good listener', 'always early', 'anime watcher', 'k-drama binger', 'sunset chaser', 'delulu but punctual',
];
