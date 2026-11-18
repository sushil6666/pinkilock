/**
 * Seed data for the mock backend: ten made-up people (in Mumbai, or moved to the city I pick at
 * sign-up, so Discover is never empty in the prototype), their private reveals, and a set
 * of invites in every state so each screen has something real to show on first launch.
 * All times are relative to the moment of seeding.
 */
import { DAY, HOUR, MIN, expiryFor } from '../../domain/invites';
import { areasIn } from '../../domain/areas';
import type { Invite, Profile, Reveal } from '../../domain/types';

export const ME_ID = 'me';

type Seed = Omit<Profile, 'city'> & { contact: [Reveal['contactKind'], string]; photos: [string, string][] };

const people: Seed[] = [
  {
    id: 'aanya', name: 'Aanya', age: 22, area: 'Bandra West', pronouns: 'she/her', distanceKm: 2,
    tagline: 'Will judge your boba order. Lovingly.',
    vibes: ['foodie', 'thrifter', 'shameless flirt'], ideaIds: ['boba_run', 'bookstore_lap', 'meme_duel', 'thrift_dare', 'rizz_off'],
    palette: ['#FF2E93', '#5B0F3A'], glyph: '🧋', kept: 14, flaked: 0, photoCount: 3, answerMinutes: 12, freeWindows: ['wkd_evening', 'wke_afternoon'], vouchCount: 3, vouchPhrases: ['always on time', 'funniest person I know'],
    contact: ['Instagram', '@aanya.frames'], photos: [['Thrift haul, Hill Road', '🛍️'], ['Carter Road, 6pm', '🌊'], ['Film camera era', '📷']],
  },
  {
    id: 'kabir', name: 'Kabir', age: 24, area: 'Andheri West', pronouns: 'he/him', distanceKm: 6,
    tagline: 'Ten minutes of coffee, zero minutes of small talk.',
    vibes: ['early bird', 'old school', 'chai over coffee'], ideaIds: ['video_coffee', 'chai_walk', 'word_race', 'study_sprint', 'dress_up_coffee'],
    palette: ['#2E6BFF', '#0B1640'], glyph: '☕', kept: 9, flaked: 1, photoCount: 3,
    contact: ['WhatsApp', '+91 00000 00142'], photos: [['Sunday run club', '🏃'], ['Versova, low tide', '🐚'], ['My filter coffee setup', '☕']],
  },
  {
    id: 'ira', name: 'Ira', age: 21, area: 'Khar', pronouns: 'she/they', distanceKm: 3,
    tagline: 'Draws on receipts. Might draw you.',
    vibes: ['overthinker', 'cat person', 'film nerd'], ideaIds: ['bad_portraits', 'video_coffee', 'sunset_spot'],
    palette: ['#D7FF3E', '#2A3A00'], glyph: '✏️', kept: 6, flaked: 0, photoCount: 2,
    contact: ['Instagram', '@ira.doodles'], photos: [['Sketchbook, page 40', '📓'], ['Momo the cat', '🐈']],
  },
  {
    id: 'dev', name: 'Dev', age: 23, area: 'Powai', pronouns: 'he/him', distanceKm: 11,
    tagline: 'Support main. In games and in life.',
    vibes: ['gamer', 'night owl', 'meme dealer'], ideaIds: ['coop_game', 'meme_duel', 'momo_stop', 'arcade_round'],
    palette: ['#8A5CFF', '#1B0F45'], glyph: '🎮', kept: 11, flaked: 2, photoCount: 3,
    contact: ['Snapchat', 'dev.plays'], photos: [['The setup', '🖥️'], ['Powai lake, 1am', '🌙'], ['LAN night', '🎧']],
  },
  {
    id: 'zoya', name: 'Zoya', age: 22, area: 'Colaba', pronouns: 'she/her', distanceKm: 14,
    tagline: 'Golden hour or nothing.',
    vibes: ['concert goer', 'foodie', 'dog person'], ideaIds: ['sunset_spot', 'ice_cream_lap', 'playlist_swap', 'photo_booth'],
    palette: ['#FF8A2E', '#4A1B00'], glyph: '🌇', kept: 19, flaked: 1, photoCount: 3, answerMinutes: 25, freeWindows: ['wkd_late', 'wke_evening'], vouchCount: 2, vouchPhrases: ['great listener', 'kind to strangers'],
    contact: ['Instagram', '@zoya.afterfive'], photos: [['Marine Drive, obviously', '🌊'], ['Biscuit, my indie', '🐕'], ['Front row, last gig', '🎤']],
  },
  {
    id: 'rehan', name: 'Rehan', age: 25, area: 'Lower Parel', pronouns: 'he/him', distanceKm: 9,
    tagline: 'Always five minutes away.',
    vibes: ['night owl', 'concert goer', 'homebody'], ideaIds: ['playlist_swap', 'momo_stop', 'video_coffee'],
    palette: ['#FF5A36', '#3D1208'], glyph: '🎧', kept: 3, flaked: 4, photoCount: 2,
    contact: ['Instagram', '@rehan.late'], photos: [['Vinyl wall', '💿'], ['Rooftop, somewhere', '🏙️']],
  },
  {
    id: 'meher', name: 'Meher', age: 20, area: 'Juhu', pronouns: 'she/her', distanceKm: 5,
    tagline: 'Will pick a book for you in under four minutes.',
    vibes: ['bookworm', 'plant parent', 'early bird'], ideaIds: ['bookstore_lap', 'chai_walk', 'word_race'],
    palette: ['#2EE6C5', '#04352E'], glyph: '📚', kept: 1, flaked: 0, photoCount: 2,
    contact: ['Instagram', '@meher.reads'], photos: [['To-be-read pile', '📚'], ['Balcony jungle', '🪴']],
  },
  {
    id: 'arjun', name: 'Arjun', age: 23, area: 'Dadar', pronouns: 'he/him', distanceKm: 8,
    tagline: 'Rates every momo place out of ten. Has a spreadsheet.',
    vibes: ['foodie', 'certified menace', 'meme dealer'], ideaIds: ['momo_stop', 'boba_run', 'coop_game', 'pani_puri_duel', 'red_flag_roast'],
    palette: ['#FFD12E', '#3F3000'], glyph: '🥟', kept: 7, flaked: 1, photoCount: 2, answerMinutes: 95,
    contact: ['WhatsApp', '+91 00000 00177'], photos: [['The spreadsheet', '📊'], ['Shivaji Park, 7am', '🏏']],
  },
  {
    id: 'tara', name: 'Tara', age: 22, area: 'Bandra East', pronouns: 'they/them', distanceKm: 4,
    tagline: 'Three songs. I will know everything about you.',
    vibes: ['concert goer', 'slow burn', 'cat person'], ideaIds: ['playlist_swap', 'ice_cream_lap', 'bad_portraits', 'hot_takes', 'karaoke_duet'],
    palette: ['#FF2ED1', '#3A0A45'], glyph: '🎶', kept: 8, flaked: 0, photoCount: 3, answerMinutes: 40,
    contact: ['Instagram', '@tara.on.shuffle'], photos: [['Gig poster wall', '🎸'], ['Noor, asleep again', '🐈'], ['BKC, blue hour', '🌃']],
  },
  {
    // Passes on every ask, so the declined state can be seen in the prototype.
    id: 'nikhil', name: 'Nikhil', age: 24, area: 'Worli', pronouns: 'he/him', distanceKm: 10,
    tagline: 'Booked till next month. Ask anyway.',
    vibes: ['early bird', 'film nerd', 'homebody'], ideaIds: ['video_coffee', 'sunset_spot', 'word_race'],
    palette: ['#9AA0FF', '#151845'], glyph: '🎬', kept: 5, flaked: 1, photoCount: 2,
    contact: ['Instagram', '@nikhil.cuts'], photos: [['Editing cave', '🎞️'], ['Sea Link at dawn', '🌉']],
  },
];

export const ALWAYS_PASSES = 'nikhil';

/** Who is in a duo with whom among the made-up people (docs/build-plan.md F3), both ways. */
export const SEED_DUOS: Record<string, string> = {
  aanya: 'meher', meher: 'aanya', zoya: 'tara', tara: 'zoya', arjun: 'kabir', kabir: 'arjun',
};

/** The friend who joins my duo in the prototype, a few seconds after I make a duo link. */
export function seedFriend(): Profile {
  return {
    id: 'rhea', name: 'Rhea', age: 23, city: 'Mumbai', area: 'Bandra West', pronouns: 'she/her', distanceKm: 1,
    tagline: 'Your plus-one for anything with snacks.', vibes: ['foodie', 'yapper'], ideaIds: ['boba_run', 'momo_stop', 'karaoke_duet'],
    palette: ['#7FD3FF', '#123A5C'], glyph: '🫶', kept: 4, flaked: 0, photoCount: 1, hasDuo: true,
  };
}

/** A made-up person moved to another city, with an area from its list. Mumbai keeps their own. */
export function inCity(p: Profile, city: string, i: number): Profile {
  const areas = areasIn(city);
  if (p.city === city || !areas.length) return { ...p, city };
  return { ...p, city, area: areas[(i * 7) % areas.length] };
}

export function seedProfiles(): Profile[] {
  return people.map(({ contact: _c, photos: _p, ...p }) => ({ ...p, city: 'Mumbai', hasDuo: p.id in SEED_DUOS }));
}

export function seedReveals(): Record<string, Reveal> {
  return Object.fromEntries(
    people.map((p) => [
      p.id,
      {
        profileId: p.id,
        contactKind: p.contact[0],
        contactHandle: p.contact[1],
        contactVerified: p.contact[0] !== 'Snapchat',
        photos: p.photos.map(([caption, glyph], i) => ({
          caption,
          glyph,
          palette: (i % 2 === 0 ? p.palette : [p.palette[1], p.palette[0]]) as [string, string],
        })),
      },
    ]),
  );
}

function atHour(now: number, dayOffset: number, hour: number, minute = 0): number {
  const d = new Date(now + dayOffset * DAY);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

const base = { firstPinkyBy: null, lockedAt: null, checkIns: [], flakedBy: null, declinedBy: null, resolvedAt: null } as const;

export function seedInvites(now: number): Invite[] {
  const tomorrowBoba = atHour(now, 1, 17, 30);
  const tomorrowCoffee = atHour(now, 1, 9, 0);
  const weekendGame = atHour(now, 3, 21, 0);
  return [
    // Incoming asks: I go first on these.
    {
      ...base, id: 'inv_aanya', fromId: 'aanya', toId: ME_ID, ideaId: 'boba_run', minutes: 25,
      startsAt: tomorrowBoba, place: 'Boba counter, Linking Road', note: 'Brown sugar or taro. Choose wisely.',
      status: 'sent', createdAt: now - 2 * HOUR, expiresAt: expiryFor(now - 2 * HOUR, tomorrowBoba), checkIns: [],
    },
    {
      ...base, id: 'inv_kabir', fromId: 'kabir', toId: ME_ID, ideaId: 'video_coffee', minutes: 10,
      startsAt: tomorrowCoffee, place: 'Pinkilock video room', note: 'Ten minutes before work. Bring your worst mug.',
      status: 'sent', createdAt: now - 5 * HOUR, expiresAt: expiryFor(now - 5 * HOUR, tomorrowCoffee), checkIns: [],
    },
    // Locked and about to start: check-in is already open.
    {
      ...base, id: 'inv_ira', fromId: ME_ID, toId: 'ira', ideaId: 'bad_portraits', minutes: 10,
      startsAt: now + 4 * MIN, place: 'Pinkilock video room', note: 'Wrong hand only. No erasing.',
      status: 'locked', createdAt: now - DAY, expiresAt: now + 4 * MIN, firstPinkyBy: 'ira', lockedAt: now - 20 * HOUR, checkIns: [],
    },
    // Locked for the weekend.
    {
      ...base, id: 'inv_dev', fromId: 'dev', toId: ME_ID, ideaId: 'coop_game', minutes: 20,
      startsAt: weekendGame, place: 'Voice chat in the app', note: 'Two rounds. I carry, you call the shots.',
      status: 'locked', createdAt: now - 30 * HOUR, expiresAt: weekendGame, firstPinkyBy: ME_ID, lockedAt: now - 26 * HOUR, checkIns: [],
    },
    // History: one kept (reveal unlocked), one where they flaked.
    {
      ...base, id: 'inv_zoya', fromId: 'zoya', toId: ME_ID, ideaId: 'sunset_spot', minutes: 30,
      startsAt: now - 3 * DAY, place: 'Marine Drive, by the steps', note: 'Golden hour. Do not be late for the sun.',
      status: 'kept', createdAt: now - 5 * DAY, expiresAt: now - 3 * DAY, firstPinkyBy: ME_ID, lockedAt: now - 4 * DAY,
      checkIns: [ME_ID, 'zoya'], resolvedAt: now - 3 * DAY,
    },
    {
      ...base, id: 'inv_rehan', fromId: ME_ID, toId: 'rehan', ideaId: 'playlist_swap', minutes: 15,
      startsAt: now - 6 * DAY, place: 'Pinkilock video room', note: 'Three songs each. No skips.',
      status: 'flaked', createdAt: now - 8 * DAY, expiresAt: now - 6 * DAY, firstPinkyBy: 'rehan', lockedAt: now - 7 * DAY,
      checkIns: [ME_ID], flakedBy: 'rehan', resolvedAt: now - 6 * DAY + 30 * MIN,
    },
  ];
}

/** I start with the one kept promise from the seeded history. */
export const SEED_ME_RECORD = { kept: 1, flaked: 0 };
