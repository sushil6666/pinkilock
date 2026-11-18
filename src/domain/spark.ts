/**
 * The spark: what two cards have in common, worked out on the phone from what both people
 * already show publicly (tags and the ideas they are up for). It reads nothing RLS would hide,
 * and it is a reason to ask, not a score: nothing is stored and nobody is ranked by it.
 */
import type { Profile } from './types';
import { t } from '../i18n';

/** Tags that are fun because they do not match. Either person can hold either side. */
const OPPOSITES: [string, string][] = [
  ['night owl', 'early bird'],
  ['dog person', 'cat person'],
  ['yapper', 'good listener'],
  ['homebody', 'life of the party'],
  ['golden retriever energy', 'black cat energy'],
  ['shameless flirt', 'blushes easily'],
  ['says it first', 'hard to get'],
  ['zero chill', 'unbothered'],
  ['chronically online', 'touch grass advocate'],
  ['wild one', 'old soul'],
];

export interface Spark {
  /** Tags both people picked. */
  vibes: string[];
  /** Ideas both people are up for, in the other person's order. */
  ideaIds: string[];
  /** Pairs of tags that pull against each other: [mine, theirs]. */
  opposites: [string, string][];
  /** How many things line up, opposites included. */
  count: number;
  title: string;
}

type Card = Pick<Profile, 'vibes' | 'ideaIds'>;

export function sparkOf(me: Card, them: Card): Spark | null {
  const vibes = them.vibes.filter((v) => me.vibes.includes(v));
  const ideaIds = them.ideaIds.filter((id) => me.ideaIds.includes(id));
  const opposites: [string, string][] = [];
  for (const [a, b] of OPPOSITES) {
    if (me.vibes.includes(a) && them.vibes.includes(b)) opposites.push([a, b]);
    else if (me.vibes.includes(b) && them.vibes.includes(a)) opposites.push([b, a]);
  }
  const count = vibes.length + ideaIds.length + opposites.length;
  if (count === 0) return null;
  return { vibes, ideaIds, opposites, count, title: t(count >= 4 ? 'spark.rare' : count >= 2 ? 'spark.click' : 'spark.one') };
}
