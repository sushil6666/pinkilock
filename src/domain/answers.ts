/**
 * "Usually answers in ...": how quickly someone answers an ask, from the median the analytics
 * worker already computes for the Trust Score. Nothing new is collected.
 */
import { t } from '../i18n';

export function answersIn(minutes: number | null | undefined): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 15) return t('answers.minutes');
  if (minutes < 90) return t('answers.aboutMin', { minutes: Math.round(minutes / 15) * 15 });
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t('answers.aboutHours', { count: hours });
  return t('answers.day');
}
