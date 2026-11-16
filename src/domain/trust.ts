/**
 * The Promise Keeper trust score.
 *
 * score = 100 * (kept + PRIOR) / (kept + flaked + PRIOR)
 *
 * The prior means a new person starts at 100 and a first flake costs 20 points instead of
 * everything. The raw counts are always shown beside the score, so the number never hides a record.
 */
import { color } from '../theme/tokens';

const PRIOR = 4;
const MIN_FINISHED_FOR_TIER = 3;

export type TrustTier = 'new' | 'keeper' | 'solid' | 'shaky' | 'risk';

export interface Trust {
  score: number;
  tier: TrustTier;
  label: string;
  tone: string;
  kept: number;
  flaked: number;
}

export function trustScore(kept: number, flaked: number): number {
  return Math.round((100 * (kept + PRIOR)) / (kept + flaked + PRIOR));
}

export function trustOf(p: { kept: number; flaked: number; trustScore?: number }): Trust {
  const score = p.trustScore ?? trustScore(p.kept, p.flaked);
  const base = { score, kept: p.kept, flaked: p.flaked };
  if (p.kept + p.flaked < MIN_FINISHED_FOR_TIER) return { ...base, tier: 'new', label: 'New here', tone: color.text };
  if (score >= 90) return { ...base, tier: 'keeper', label: 'Promise Keeper', tone: color.volt };
  if (score >= 75) return { ...base, tier: 'solid', label: 'Mostly solid', tone: color.text };
  if (score >= 55) return { ...base, tier: 'shaky', label: 'Shaky', tone: color.flare };
  return { ...base, tier: 'risk', label: 'Flake risk', tone: color.flare };
}
