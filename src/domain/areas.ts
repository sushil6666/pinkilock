/**
 * Areas a person picks from (docs/build-plan.md, WP1 and WP9): typed areas were a way to slip a
 * contact onto a card, and a city with a list reads as local. The same rows are the `areas` table
 * (supabase/migrations/20261118000003_picked_fields.sql); tests/unit/areas.test.ts keeps the two in
 * step. A city gets its list when it opens. The names match the venue catalogue's areas, so the
 * places nearest to someone come first in an ask.
 */
export const AREAS: Record<string, string[]> = {
  Mumbai: [
    'Andheri East', 'Andheri West', 'Bandra East', 'Bandra West', 'BKC', 'Borivali', 'Byculla', 'Chembur',
    'Churchgate', 'Colaba', 'Dadar', 'Dahisar', 'Fort', 'Ghatkopar', 'Goregaon', 'Grant Road', 'Juhu',
    'Kalina', 'Kandivali', 'Khar', 'Kurla', 'Lower Parel', 'Mahim', 'Malad', 'Marine Lines', 'Matunga',
    'Mira Road', 'Mulund', 'Navi Mumbai', 'Parel', 'Powai', 'Prabhadevi', 'Santacruz', 'Sion', 'Tardeo',
    'Thane', 'Versova', 'Vile Parle', 'Wadala', 'Worli',
  ],
};

export const areasIn = (city: string): string[] => AREAS[city] ?? [];

/** The areas whose name contains what was typed, for the search box. Everything when nothing is. */
export function matchAreas(city: string, typed: string): string[] {
  const q = typed.trim().toLowerCase();
  return areasIn(city).filter((a) => !q || a.toLowerCase().includes(q));
}
