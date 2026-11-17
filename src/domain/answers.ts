/**
 * "Usually answers in ...": how quickly someone answers an ask, from the median the analytics
 * worker already computes for the Trust Score. Nothing new is collected.
 */
export function answersIn(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 15) return 'Usually answers in minutes';
  if (minutes < 90) return `Usually answers in about ${Math.round(minutes / 15) * 15} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Usually answers in about ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  return 'Usually takes a day or more to answer';
}
