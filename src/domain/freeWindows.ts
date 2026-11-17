/**
 * "When I'm free" (from the market review): a few broad windows a person is usually free in. An
 * ask can still pick any time; the composer marks the times inside the other person's windows, so
 * the easy yes is the obvious choice. The same ids are checked by save_availability in SQL.
 */
export type FreeWindow = 'wkd_morning' | 'wkd_lunch' | 'wkd_evening' | 'wkd_late' | 'wke_morning' | 'wke_afternoon' | 'wke_evening' | 'wke_late';

export const FREE_WINDOWS: { id: FreeWindow; label: string; weekend: boolean; from: number; to: number }[] = [
  { id: 'wkd_morning', label: 'Weekday mornings', weekend: false, from: 7, to: 11 },
  { id: 'wkd_lunch', label: 'Weekday lunch', weekend: false, from: 12, to: 15 },
  { id: 'wkd_evening', label: 'Weekday evenings', weekend: false, from: 17, to: 21 },
  { id: 'wkd_late', label: 'Weekday late', weekend: false, from: 21, to: 24 },
  { id: 'wke_morning', label: 'Weekend mornings', weekend: true, from: 7, to: 12 },
  { id: 'wke_afternoon', label: 'Weekend afternoons', weekend: true, from: 12, to: 17 },
  { id: 'wke_evening', label: 'Weekend evenings', weekend: true, from: 17, to: 21 },
  { id: 'wke_late', label: 'Weekend late', weekend: true, from: 21, to: 24 },
];

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
  FREE_WINDOWS.filter((w) => windows.includes(w.id)).map((w) => w.label.toLowerCase()).join(', ');
