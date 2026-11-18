/**
 * Time slots for the composer and the few date formats the app uses. Formats follow the phone's
 * locale through Intl (src/i18n); times are shown in the viewer's own time zone.
 */
import { fmtDay, fmtDayMonth, fmtTime, fmtWeekday, t } from '../i18n';
import { DAY, HOUR, MIN } from './invites';

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function dayLabel(at: number, now: number): string {
  const diff = Math.round((startOfDay(at) - startOfDay(now)) / DAY);
  if (diff === 0) return t('common.today');
  if (diff === 1) return t('common.tomorrow');
  if (diff === -1) return t('common.yesterday');
  return fmtDay(at);
}

/** "7:30 PM" or "19:30", as the phone writes times. */
export const timeLabel = (at: number): string => fmtTime(at);

export const whenLabel = (at: number, now: number) => t('common.dayAtTime', { day: dayLabel(at, now), time: timeLabel(at) });

export interface DayOption {
  id: string;
  label: string;
  sub: string;
  start: number;
}

/** Today plus the next four days. */
export function dayOptions(now: number): DayOption[] {
  return Array.from({ length: 5 }, (_, i) => {
    const start = startOfDay(now) + i * DAY;
    const d = new Date(start + 12 * HOUR);
    return {
      id: String(start),
      label: i === 0 ? t('common.today') : i === 1 ? t('common.tomorrowShort') : fmtWeekday(d.getTime()),
      sub: fmtDayMonth(d.getTime()),
      start,
    };
  });
}

const SLOT_HOURS = [11, 13, 16, 17.5, 19, 20.5, 22];

/** Slots on a day that are still at least 45 minutes away. */
export function slotOptions(dayStart: number, now: number): number[] {
  return SLOT_HOURS.map((h) => {
    const d = new Date(dayStart);
    d.setHours(Math.floor(h), (h % 1) * 60, 0, 0);
    return d.getTime();
  }).filter((t) => t - now >= 45 * MIN);
}

export interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  total: number;
}

export function countdownParts(target: number, now: number): Parts {
  const total = Math.max(0, target - now);
  const s = Math.floor(total / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, total };
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2d 4h", "3h 12m", "04:59" */
export function shortCountdown(target: number, now: number): string {
  const p = countdownParts(target, now);
  if (p.days > 0) return t('countdown.shortDays', { days: p.days, hours: p.hours });
  if (p.hours > 0) return t('countdown.shortHours', { hours: p.hours, minutes: pad2(p.minutes) });
  return `${pad2(p.minutes)}:${pad2(p.seconds)}`;
}
