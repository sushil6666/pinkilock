/**
 * The face on a card (D095). The same rule as public.add_photo for `face`
 * (supabase/migrations/20261119000004_face_photo.sql): change both together.
 *
 *   * one waits for a person at a time (PL113);
 *   * a new one at most once every 7 days, except straight after one that was held (PL114);
 *   * three tries in 7 days at most, held or not (PL114).
 */
import type { ErrorCode } from './errors';

export const FACE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const FACE_TRIES_PER_WEEK = 3;

export interface FaceRow {
  at: number;
  status: 'pending' | 'approved' | 'held';
}

/**
 * Why a new face would be refused now, or null when it may be sent. `tries`: when each face was
 * sent (removing one does not take its try back). `faces`: the face rows still there.
 */
export function faceRefusal(tries: number[], faces: FaceRow[], now: number): ErrorCode | null {
  if (faces.some((f) => f.status === 'pending')) return 'PL113';
  const week = tries.filter((at) => at > now - FACE_WEEK_MS);
  if (week.length >= FACE_TRIES_PER_WEEK) return 'PL114';
  const latest = faces.reduce<FaceRow | null>((a, f) => (!a || f.at > a.at ? f : a), null);
  if (week.length && latest?.status !== 'held') return 'PL114';
  return null;
}
