/**
 * "When I'm free" (from the market review): a few broad windows a person is usually free in. An
 * ask can still pick any time; the composer marks the times inside the other person's windows, so
 * the easy yes is the obvious choice. The same ids are checked by save_availability in SQL.
 */
import { t } from '../i18n';
export type FreeWindow = 'wkd_morning' | 'wkd_lunch' | 'wkd_evening' | 'wkd_late' | 'wke_morning' | 'wke_afternoon' | 'wke_evening' | 'wke_late';

/** The words come from src/i18n (`freeWindows`). */
export const FREE_WINDOWS: { id: FreeWindow; readonly label: string; weekend: boolean; from: number; to: number }[] = ([
  ['wkd_morning', false, 7, 11],
  ['wkd_lunch', false, 12, 15],
  ['wkd_evening', false, 17, 21],
  ['wkd_late', false, 21, 24],
  ['wke_morning', true, 7, 12],
  ['wke_afternoon', true, 12, 17],
  ['wke_evening', true, 17, 21],
  ['wke_late', true, 21, 24],
] as const).map(([id, weekend, from, to]) => ({
  id,
  get label() {
    return t(`freeWindows.${id}`);
  },
  weekend,
  from,
  to,
}));

/** Which window a start time falls in, in the phone's own time zone. */
export function windowOf(at: number): FreeWindow | null {
  const d = new Date(at);
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  const h = d.getHours() + d.getMinutes() / 60;
  return FREE_WINDOWS.find((w) => w.weekend === weekend && h >= w.from && h < w.to)?.id ?? null;
}

/** True when a time suits someone; someone who set no windows suits any time. */
export function suits(at: number, windows: readonly string[] | undefined): boolean {
  if (!windows?.length) return true;
  const w = windowOf(at);
  return !!w && windows.includes(w);
}

export const windowsLabel = (windows: readonly string[]): string =>
  FREE_WINDOWS.filter((w) => windows.includes(w.id)).map((w) => t(`freeWindowsInLine.${w.id}`)).join(', ');
