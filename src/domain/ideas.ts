/**
 * The micro-date catalogue. Every idea is short, cheap and easy to say yes to.
 * The same rows live in the `ideas` table (supabase/migrations): add an idea in both places.
 */
import type { MicroDateIdea } from './types';
import { t } from '../i18n';

export const IDEAS: MicroDateIdea[] = [
  { id: 'video_coffee', title: '10-min video coffee', emoji: '☕', minutes: 10, kind: 'video', blurb: 'Cameras on, one cup, hard stop at ten.' },
  { id: 'boba_run', title: 'Boba run', emoji: '🧋', minutes: 25, kind: 'irl', blurb: 'Order, walk one block, done.' },
  { id: 'coop_game', title: 'Co-op mobile game', emoji: '🎮', minutes: 20, kind: 'game', blurb: 'Two rounds, same team, voice on.' },
  { id: 'chai_walk', title: 'Chai and a walk', emoji: '🍵', minutes: 20, kind: 'irl', blurb: 'Cutting chai, one lap of the block.', countries: ['IN'] },
  { id: 'playlist_swap', title: 'Playlist swap', emoji: '🎧', minutes: 15, kind: 'video', blurb: 'Three songs each. Defend your picks.' },
  { id: 'bookstore_lap', title: 'Bookstore lap', emoji: '📚', minutes: 30, kind: 'irl', blurb: 'Pick a book for each other. No buying required.' },
  { id: 'momo_stop', title: 'Momo stop', emoji: '🥟', minutes: 20, kind: 'irl', blurb: 'One plate, split it, rate the chutney.', countries: ['IN'] },
  { id: 'sunset_spot', title: 'Sunset spot', emoji: '🌇', minutes: 30, kind: 'irl', blurb: 'Show up for golden hour, leave when it is dark.' },
  { id: 'meme_duel', title: 'Meme duel', emoji: '😂', minutes: 10, kind: 'game', blurb: 'Five memes each. Loser plans the real date.' },
  { id: 'bad_portraits', title: 'Draw each other badly', emoji: '✏️', minutes: 10, kind: 'video', blurb: 'Sixty seconds, wrong hand, reveal together.' },
  { id: 'ice_cream_lap', title: 'Ice cream lap', emoji: '🍦', minutes: 20, kind: 'irl', blurb: 'One scoop, one lap, swap a bite.' },
  { id: 'word_race', title: 'Word puzzle race', emoji: '🔤', minutes: 10, kind: 'game', blurb: 'Same puzzle, same time, first to solve wins.' },
  { id: 'photo_booth', title: 'Photo booth strip', emoji: '📸', minutes: 15, kind: 'irl', blurb: 'Four frames, one strip, no retakes.' },
  { id: 'thrift_dare', title: 'Thrift dare', emoji: '🛍️', minutes: 30, kind: 'irl', blurb: 'Pick one loud thing for each other. Trying it on is the deal.' },
  { id: 'pani_puri_duel', title: 'Pani puri face-off', emoji: '🌶️', minutes: 15, kind: 'irl', blurb: 'Six each, spicy water, first to tap out pays.', countries: ['IN'] },
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
  { id: 'red_flag_roast', title: 'Red flag roast', emoji: '🚩', minutes: 10, kind: 'game', blurb: 'Confess three red flags each. Roast gently, laugh loudly.' },
  { id: 'would_you_rather', title: 'Would you rather, spicy', emoji: '😈', minutes: 10, kind: 'game', blurb: 'Ten rounds. "It depends" is banned. Pick and defend.' },
  { id: 'rizz_off', title: 'Rizz-off', emoji: '😏', minutes: 10, kind: 'game', blurb: 'Trade your worst pickup lines. First to laugh loses.' },
  { id: 'never_have_i', title: 'Never have I ever', emoji: '🙈', minutes: 10, kind: 'game', blurb: 'Ten fingers up. Keep it honest, keep it kind.' },
  { id: 'ick_or_not', title: 'Ick or not', emoji: '🫣', minutes: 10, kind: 'game', blurb: 'Ten habits, instant verdicts. Find the dealbreakers early.' },
  { id: 'truth_or_dare', title: 'Truth or dare, lite', emoji: '🎲', minutes: 15, kind: 'game', blurb: 'Three rounds each. Either of you can skip once.' },
  { id: 'stare_down', title: 'Staring contest', emoji: '👀', minutes: 10, kind: 'video', blurb: 'Cameras on, eyes locked. First to blink or laugh loses.' },
  { id: 'karaoke_duet', title: 'Karaoke duet', emoji: '🎤', minutes: 15, kind: 'video', blurb: 'One song, both of you, no skill required.' },
  { id: 'after_hours', title: 'After-hours call', emoji: '🌙', minutes: 15, kind: 'video', blurb: 'After ten, lights low, fifteen minutes. Then sleep.' },
  { id: 'night_market', title: 'Night market lap', emoji: '🏮', minutes: 30, kind: 'irl', blurb: 'One lap, three stalls, share everything.' },
  { id: 'photo_walk', title: 'Golden hour photoshoot', emoji: '🤳', minutes: 20, kind: 'irl', blurb: 'Shoot each other\'s next profile picture. Hype is mandatory.' },
  { id: 'kulfi_gossip', title: 'Kulfi and gossip', emoji: '🍡', minutes: 20, kind: 'irl', blurb: 'One kulfi each. Trade your best harmless gossip.', countries: ['IN'] },
  { id: 'dress_up_coffee', title: 'Overdressed coffee', emoji: '✨', minutes: 25, kind: 'irl', blurb: 'Both overdress for a very ordinary coffee. Commit to it.' },
  // Local to one city (city ideas): offered only to people who live there.
  { id: 'mumbai_sea_wall', title: 'Vada pav on the sea wall', emoji: '🌊', minutes: 30, kind: 'irl', blurb: 'One vada pav each, one stretch of the sea wall.', countries: ['IN'], cities: ['Mumbai'] },
  { id: 'delhi_chaat_crawl', title: 'Two-stall chaat crawl', emoji: '🥙', minutes: 25, kind: 'irl', blurb: 'Two chaat stalls, one plate at each. Pick a winner.', countries: ['IN'], cities: ['Delhi NCR'] },
  { id: 'blr_darshini_coffee', title: 'Darshini filter coffee', emoji: '☕', minutes: 20, kind: 'irl', blurb: 'Stand-up filter coffee and one masala dosa to split.', countries: ['IN'], cities: ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi-Dharwad', 'Belagavi', 'Kalaburagi'] },
  { id: 'hyd_irani_chai', title: 'Irani chai and Osmania biscuits', emoji: '🫖', minutes: 20, kind: 'irl', blurb: 'Two chais, a plate of biscuits. Dunk and talk.', countries: ['IN'], cities: ['Hyderabad', 'Warangal'] },
  { id: 'chennai_beach_sundal', title: 'Beach walk and sundal', emoji: '🏖️', minutes: 30, kind: 'irl', blurb: 'A paper cone of sundal and a slow walk by the sea.', countries: ['IN'], cities: ['Chennai'] },
  { id: 'kol_phuchka_bhaar', title: 'Phuchka and bhaar chai', emoji: '🍵', minutes: 20, kind: 'irl', blurb: 'Phuchka till one taps out, then chai in clay cups.', countries: ['IN'], cities: ['Kolkata', 'Siliguri', 'Asansol', 'Durgapur'] },
  { id: 'misal_stop', title: 'Misal pav stop', emoji: '🌶️', minutes: 25, kind: 'irl', blurb: 'One plate each, pick your spice, extra pav allowed.', countries: ['IN'], cities: ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Chhatrapati Sambhajinagar', 'Solapur', 'Kolhapur', 'Amravati', 'Nanded', 'Sangli', 'Malegaon'] },
  { id: 'amd_riverfront_walk', title: 'Riverfront sunset walk', emoji: '🌉', minutes: 30, kind: 'irl', blurb: 'One stretch of the riverfront at sunset, a cold drink each.', countries: ['IN'], cities: ['Ahmedabad'] },
  { id: 'bbsr_dahibara', title: 'Dahibara aloodum stop', emoji: '🥣', minutes: 20, kind: 'irl', blurb: 'One plate each from a street cart. Rate the spice.', countries: ['IN'], cities: ['Bhubaneswar', 'Cuttack', 'Rourkela'] },
  { id: 'chd_sukhna_lake', title: 'Sukhna Lake walk', emoji: '🌅', minutes: 30, kind: 'irl', blurb: 'One lap of the lake path, then a chai.', countries: ['IN'], cities: ['Chandigarh'] },
  { id: 'cbe_bakery_puff', title: 'Bakery puff break', emoji: '🥐', minutes: 20, kind: 'irl', blurb: 'Hot puffs and tea at a local bakery. Split two kinds.', countries: ['IN'], cities: ['Coimbatore', 'Tiruppur', 'Erode', 'Salem'] },
  { id: 'goa_shack_sunset', title: 'Beach shack sunset', emoji: '🌴', minutes: 30, kind: 'irl', blurb: 'A soft drink each at a shack. Stay till the sun goes.', countries: ['IN'], cities: ['Goa'] },
  { id: 'indore_poha_jalebi', title: 'Poha jalebi breakfast', emoji: '🥞', minutes: 20, kind: 'irl', blurb: 'Poha and jalebi from a morning stall. Sweet first or savoury?', countries: ['IN'], cities: ['Indore', 'Bhopal', 'Gwalior', 'Jabalpur', 'Ujjain'] },
  { id: 'jaipur_kachori_chai', title: 'Pyaaz kachori and chai', emoji: '🧅', minutes: 20, kind: 'irl', blurb: 'One kachori each, one chai. Find the best stall.', countries: ['IN'], cities: ['Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer'] },
  { id: 'kochi_pazham_pori', title: 'Chai and pazham pori', emoji: '🍌', minutes: 20, kind: 'irl', blurb: 'Banana fritters and chai at a tea shop. Split the plate.', countries: ['IN'], cities: ['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Malappuram'] },
  { id: 'lko_basket_chaat', title: 'Basket chaat stop', emoji: '🧺', minutes: 20, kind: 'irl', blurb: 'One basket chaat to share. Two spoons, no fighting.', countries: ['IN'], cities: ['Lucknow'] },
  { id: 'ngp_tarri_poha', title: 'Tarri poha stop', emoji: '🍛', minutes: 20, kind: 'irl', blurb: 'Spicy poha with chana curry from a morning cart.', countries: ['IN'], cities: ['Nagpur', 'Amravati'] },
  { id: 'surat_locho', title: 'Locho stop', emoji: '🫓', minutes: 20, kind: 'irl', blurb: 'One plate of locho to split. Extra sev is the rule.', countries: ['IN'], cities: ['Surat'] },
  { id: 'vdr_sev_usal', title: 'Sev usal stop', emoji: '🍲', minutes: 20, kind: 'irl', blurb: 'One plate each, pick your spice, a cold drink after.', countries: ['IN'], cities: ['Vadodara'] },
  { id: 'vizag_beach_road', title: 'Beach road corn walk', emoji: '🐚', minutes: 30, kind: 'irl', blurb: 'A slow walk on the beach road, a corn cob each.', countries: ['IN'], cities: ['Visakhapatnam'] },
  { id: 'andhra_punugulu', title: 'Punugulu and chai', emoji: '🍘', minutes: 20, kind: 'irl', blurb: 'A paper plate of punugulu and a chai each.', countries: ['IN'], cities: ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore'] },
  { id: 'ghy_lal_cha', title: 'Lal cha and pitha', emoji: '🍵', minutes: 20, kind: 'irl', blurb: 'Red tea and a plate of pitha at a tea stall.', countries: ['IN'], cities: ['Guwahati'] },
  { id: 'patna_litti', title: 'Litti chokha stop', emoji: '🔥', minutes: 20, kind: 'irl', blurb: 'One plate of litti chokha each, straight off the coals.', countries: ['IN'], cities: ['Patna'] },
  { id: 'cg_gupchup', title: 'Gupchup face-off', emoji: '🥟', minutes: 15, kind: 'irl', blurb: 'Six gupchup each. First to tap out pays.', countries: ['IN'], cities: ['Raipur', 'Bhilai'] },
  { id: 'gujarat_fafda', title: 'Fafda jalebi morning', emoji: '🥨', minutes: 20, kind: 'irl', blurb: 'Fafda, jalebi and chutney from a morning farsan shop.', countries: ['IN'], cities: ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Jamnagar', 'Bhavnagar'] },
  { id: 'jh_dhuska', title: 'Dhuska and chai', emoji: '🍩', minutes: 20, kind: 'irl', blurb: 'A plate of dhuska with aloo and a chai each.', countries: ['IN'], cities: ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro'] },
  { id: 'jk_kahwa', title: 'Kahwa and a walk', emoji: '🫖', minutes: 25, kind: 'irl', blurb: 'A cup of kahwa each and a short walk.', countries: ['IN'], cities: ['Srinagar', 'Jammu'] },
  { id: 'pdy_promenade', title: 'Promenade sea walk', emoji: '🌊', minutes: 30, kind: 'irl', blurb: 'One stretch of the sea front, one cold drink each.', countries: ['IN'], cities: ['Puducherry'] },
  { id: 'punjab_lassi', title: 'Lassi stop', emoji: '🥛', minutes: 20, kind: 'irl', blurb: 'One tall lassi each. Sweet or salty, no judging.', countries: ['IN'], cities: ['Ludhiana', 'Amritsar', 'Jalandhar', 'Chandigarh'] },
  { id: 'tn_jigarthanda', title: 'Jigarthanda stop', emoji: '🥤', minutes: 20, kind: 'irl', blurb: 'One jigarthanda each, extra ice cream on top.', countries: ['IN'], cities: ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tiruppur', 'Erode'] },
  { id: 'doon_bakery', title: 'Bakery rusk and chai', emoji: '🍪', minutes: 20, kind: 'irl', blurb: 'Fresh rusks or buns and a chai at an old bakery.', countries: ['IN'], cities: ['Dehradun'] },
  { id: 'up_kulhad_samosa', title: 'Kulhad chai and samosa', emoji: '🫖', minutes: 20, kind: 'irl', blurb: 'Chai in clay cups and one samosa each.', countries: ['IN'], cities: ['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj', 'Meerut', 'Bareilly', 'Aligarh', 'Moradabad', 'Gorakhpur', 'Saharanpur', 'Jhansi', 'Firozabad'] },
];

const byId = new Map(IDEAS.map((i) => [i.id, i]));

export function ideaOf(id: string): MicroDateIdea {
  return byId.get(id) ?? IDEAS[0];
}

/** The words come from src/i18n (`kinds`). */
/** The ideas offered in a country, in catalogue order: everywhere ones and its own local ones (WP9). */
/** A city idea (`cities`) is offered only to people who live in one of those cities. */
export const ideasFor = (country: string | undefined, city?: string): MicroDateIdea[] =>
  IDEAS.filter((i) => (!i.countries || (!!country && i.countries.includes(country))) && (!i.cities || (!!city && i.cities.includes(city))));

/** Ideas of one kind for a picker: the ones local to the city first, then the rest in catalogue order. */
export const pickerIdeas = (ideas: MicroDateIdea[], kind: MicroDateIdea['kind']): MicroDateIdea[] => {
  const ofKind = ideas.filter((i) => i.kind === kind);
  return [...ofKind.filter((i) => i.cities), ...ofKind.filter((i) => !i.cities)];
};

/** True when an idea is offered in that country (and city, for a city idea). */
export const offeredIn = (id: string, country: string | undefined, city?: string): boolean => ideasFor(country, city).some((i) => i.id === id);

export const KIND_LABEL: Readonly<Record<MicroDateIdea['kind'], string>> = {
  get video() {
    return t('kinds.video');
  },
  get irl() {
    return t('kinds.irl');
  },
  get game() {
    return t('kinds.game');
  },
};

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
  red_flag_roast: 'Lead with your worst one. Set the bar.',
  would_you_rather: 'Would you rather know every secret, or keep one forever?',
  rizz_off: 'Deliver your worst line with a straight face.',
  never_have_i: 'Never have I ever stalked a crush online. Fingers?',
  ick_or_not: 'Start easy: clapping when the plane lands. Ick or not?',
  truth_or_dare: 'Truth first: what made you say yes to this?',
  stare_down: 'No talking for the first ten seconds. Just look.',
  karaoke_duet: 'Pick the song you both secretly know every word of.',
  after_hours: 'What is keeping you up tonight?',
  night_market: 'First stall is your pick. Choose bravely.',
  photo_walk: 'Tell them your good side. Then ignore it.',
  kulfi_gossip: 'Best harmless gossip you are sitting on. Go.',
  dress_up_coffee: 'Compliment the outfit first. Mean it.',
  mumbai_sea_wall: 'Dry chutney or green? This decides a lot.',
  delhi_chaat_crawl: 'Aloo tikki or papdi chaat? Choose your fighter.',
  blr_darshini_coffee: 'Strong or light decoction? Be honest.',
  hyd_irani_chai: 'How many biscuits before it gets weird?',
  chennai_beach_sundal: 'Sundal or bajji next? Plan the second snack.',
  kol_phuchka_bhaar: 'How many phuchkas before you tap out?',
  misal_stop: 'Medium or tikhat? No judgement. Some judgement.',
  amd_riverfront_walk: 'Best thing to eat in this city, go.',
  bbsr_dahibara: 'More dahi or more aloodum? Pick a side.',
  chd_sukhna_lake: 'Morning person or evening person? Defend it.',
  cbe_bakery_puff: 'Veg puff or egg puff? This matters.',
  goa_shack_sunset: 'Which beach is overrated? Say it.',
  indore_poha_jalebi: 'Sweet first or savoury first?',
  jaipur_kachori_chai: 'Best kachori in town? Argue.',
  kochi_pazham_pori: 'Best rainy-day snack in town? Go.',
  lko_basket_chaat: 'Who gets the last bite? Decide now.',
  ngp_tarri_poha: 'How much tarri is too much tarri?',
  surat_locho: 'Butter or cheese locho? Pick one.',
  vdr_sev_usal: 'Extra sev or extra spice?',
  vizag_beach_road: 'Lemon and chilli on the corn, or plain?',
  andhra_punugulu: 'Peanut chutney or ginger chutney?',
  ghy_lal_cha: 'Til pitha or narikol? Pick your side.',
  patna_litti: 'Extra ghee or none? Be honest.',
  cg_gupchup: 'Sweet water or spicy water first?',
  gujarat_fafda: 'Fafda first or jalebi first?',
  jh_dhuska: 'Best snack in town? Argue.',
  jk_kahwa: 'Saffron or almonds in your kahwa?',
  pdy_promenade: 'French Quarter or Tamil Quarter? Pick a favourite street.',
  punjab_lassi: 'Sweet or salty? Choose with care.',
  tn_jigarthanda: 'Extra ice cream or extra basundi?',
  doon_bakery: 'Rusk or bun maska? Decide.',
  up_kulhad_samosa: 'Green chutney or saunth?',
};

export function openerOf(id: string): string {
  return OPENERS[id] ?? 'Say the first thing you noticed on the way here.';
}

/**
 * Dares for a locked plan, next to the opener: optional, one at a time, shuffled by a tap. They
 * are between two strangers in a public place or on a call, so none asks for touch, for anything
 * private, or for anything a person could not laugh off.
 */
const DARES_ANY = [
  'Give one real compliment in the first minute.',
  'Hold eye contact for five full seconds. No laughing.',
  'Admit the first thing you noticed on their card.',
  'Say your most unhinged opinion out loud.',
  'Ask the question you would normally save for date three.',
  'Confess your current roman empire.',
  'Before you leave, say one thing you actually liked.',
];
const DARES_BY_KIND: Record<MicroDateIdea['kind'], string[]> = {
  irl: ['Order for each other. No vetoes.', 'Let them pick the route. No questions asked.', 'Take one photo together before you leave.'],
  video: ['Show the messiest corner of your room.', 'Show your lock screen. Explain it.', 'Do the first ten seconds in a made-up accent.'],
  game: ['Trash talk, but only in compliments.', 'Loser admits their most embarrassing playlist song.', 'Winner asks one question. Loser has to answer.'],
};

export function daresFor(kind: MicroDateIdea['kind']): string[] {
  return [...DARES_BY_KIND[kind], ...DARES_ANY];
}

/** Starts for the one line about you. Tapping one fills the box; the person finishes it. */
export const TAGLINE_PROMPTS = [
  'my toxic trait: ', 'green flag: ', 'the ick: ', 'my roman empire: ', 'delulu belief: ', 'unpopular opinion: ',
  'i will judge your ', 'ask me about ',
];

/**
 * Ready-made lines for the one line that goes with an ask, in a tone the sender picks. Tapping
 * one fills the box; it can still be edited. Every line fits NOTE_MAX (80). The line is the only
 * thing a stranger reads before saying yes, so the spicy tones tease and never get explicit.
 */
export type NoteTone = 'chill' | 'bold' | 'flirty' | 'wild' | 'naughty' | 'old_school';

/** The words come from src/i18n (`tones`). */
export const NOTE_TONES: { id: NoteTone; readonly label: string }[] = (['chill', 'bold', 'flirty', 'wild', 'naughty', 'old_school'] as const).map((id) => ({
  id,
  get label() {
    return t(`tones.${id}`);
  },
}));

const STARTERS_ANY = ['low stakes, high snacks.', 'hard stop, pinky promise.', 'no pressure, just vibes.', 'i will be early. it is a whole thing.'];
const STARTERS_BY_KIND: Record<MicroDateIdea['kind'], string[]> = {
  irl: ['i will be the one looking lost.', 'loser pays. not nervous at all.'],
  video: ['camera on, effort optional.', 'ten minutes, then you are free.'],
  game: ['prepare to lose, respectfully.', 'winner gets bragging rights only.'],
};
const STARTERS_BY_TONE: Record<Exclude<NoteTone, 'chill'>, string[]> = {
  bold: [
    'saw your card. stopped scrolling.',
    'i am asking first. your move.',
    'i do not do maybes. you in?',
    'you, me, twenty minutes. that is the pitch.',
    'say yes. overthink it later.',
    'not here for a pen pal. see you there?',
  ],
  flirty: [
    'fair warning: i am better in person.',
    'come find out if the rizz is real.',
    'i will try not to stare. no promises.',
    'you are cute. this is the follow-up.',
    'bring that smile. i will handle the rest.',
    'my screen time says i like your card.',
  ],
  wild: [
    'worst case, it is a great story.',
    'no plan past minute one. pure chaos.',
    'dare you to show up.',
    'bad idea? probably. still asking.',
    'side quest unlocked. accept?',
    'main character behaviour only.',
  ],
  naughty: [
    'i am trouble. the fun kind.',
    'behave? on a first date? unlikely.',
    'i will be good. mostly.',
    'blushing is allowed. encouraged, even.',
    'pinky promise to keep it pg. ish.',
    'you look like a bad influence. perfect.',
  ],
  old_school: [
    'may i have the pleasure of your company?',
    'i will be on time. it is called manners.',
    'no games. i would simply like to meet you.',
    'the chai is on me. i insist.',
    'a proper hello, in person. like the old days.',
    'i would have written a letter. this is faster.',
  ],
};

/**
 * Every line an ask can carry (decision O03: picked, never typed). The same list is the
 * `ask_lines` table (supabase/migrations); send_invite refuses any other note.
 * tests/unit/profile.test.ts keeps the two in step.
 */
export const ASK_LINES: string[] = [
  ...new Set([
    ...Object.values(STARTERS_BY_KIND).flat(),
    ...STARTERS_ANY,
    ...Object.values(STARTERS_BY_TONE).flat(),
  ]),
];

export function noteStarters(kind: MicroDateIdea['kind'], tone: NoteTone = 'chill'): string[] {
  return tone === 'chill' ? [...STARTERS_BY_KIND[kind], ...STARTERS_ANY] : STARTERS_BY_TONE[tone];
}

/**
 * Profile tags, grouped for the picker. A profile stores the plain strings, so a tag that is
 * already on someone's card must keep its exact spelling. Flirty tags stay suggestive, not explicit.
 */
/** Group names come from src/i18n (`vibeGroups`); the tags are the `vibes` table, reviewed per language (WP9). */
export const VIBE_GROUPS: { id: string; readonly label: string; vibes: string[] }[] = [
  {
    id: 'energy',
    get label() {
      return t('vibeGroups.energy');
    },
    vibes: [
      'night owl', 'early bird', 'overthinker', 'homebody', 'chronically online', 'main character',
      'golden retriever energy', 'black cat energy', 'side quest enjoyer', 'yapper', 'good listener', 'always early',
      'delulu but punctual', 'chaotic good', 'soft life', 'certified menace', 'unbothered', 'touch grass advocate',
    ],
  },
  {
    id: 'into',
    get label() {
      return t('vibeGroups.into');
    },
    vibes: [
      'gym rat', 'foodie', 'film nerd', 'thrifter', 'dog person', 'cat person', 'gamer', 'bookworm', 'plant parent',
      'chai over coffee', 'concert goer', 'meme dealer', 'anime watcher', 'k-drama binger', 'sunset chaser',
      'street food hunter', 'late night drives', 'karaoke menace',
    ],
  },
  {
    id: 'wild',
    get label() {
      return t('vibeGroups.wild');
    },
    vibes: [
      'wild one', 'bold moves only', 'says it first', 'dare taker', 'spontaneous', 'no filter', 'loud laugh',
      'bad influence', 'adrenaline junkie', 'rule bender', 'life of the party', 'zero chill',
    ],
  },
  {
    id: 'flirt',
    get label() {
      return t('vibeGroups.flirt');
    },
    vibes: [
      'shameless flirt', 'smooth talker', 'a little naughty', 'tease', 'rizz on demand', 'eye contact enjoyer',
      'slow burn', 'trouble, the fun kind', 'playful', 'hard to get', 'blushes easily', 'hopeless romantic',
      'lover era', 'will steal your hoodie',
    ],
  },
  {
    id: 'oldSchool',
    get label() {
      return t('vibeGroups.oldSchool');
    },
    vibes: [
      'old school', 'old soul', 'gentleman', 'chivalry is not dead', 'calls, not texts', 'handwritten notes',
      'flowers on the first date', 'retro bollywood', 'ghazals and chai', 'vinyl and film cameras', 'slow dancer',
      'opens doors',
    ],
  },
];

export const VIBES = VIBE_GROUPS.flatMap((g) => g.vibes);
