/** Time slots for the composer and the few date formats the app uses. No date library needed. */
import { DAY, HOUR, MIN } from './invites';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export function dayLabel(t: number, now: number): string {
  const diff = Math.round((startOfDay(t) - startOfDay(now)) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = new Date(t);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function timeLabel(t: number): string {
  const d = new Date(t);
  const h = d.getHours();
  const m = d.getMinutes();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export const whenLabel = (t: number, now: number) => `${dayLabel(t, now)}, ${timeLabel(t)}`;

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
      label: i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAYS[d.getDay()],
      sub: `${d.getDate()} ${MONTHS[d.getMonth()]}`,
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
  if (p.days > 0) return `${p.days}d ${p.hours}h`;
  if (p.hours > 0) return `${p.hours}h ${pad2(p.minutes)}m`;
  return `${pad2(p.minutes)}:${pad2(p.seconds)}`;
}
