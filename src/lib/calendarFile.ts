/**
 * Hands a plan's calendar file to the person: a download in a browser, the share sheet on a phone
 * (they pick their calendar app). The file is written to the app's cache and nowhere else.
 * A phone build from before expo-sharing was added has no share module: it says so, and the
 * screen hides the button.
 */
import { Platform } from 'react-native';
import { icsFor, type CalendarPlan } from '../domain/calendar';

type Sharing = typeof import('expo-sharing');
type Files = typeof import('expo-file-system');

function phoneModules(): { sharing: Sharing; files: Files } | null {
  try {
    // Loaded here, not at the top: an older binary has no native share module to load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return { sharing: require('expo-sharing') as Sharing, files: require('expo-file-system') as Files };
  } catch {
    // An older phone build: no calendar file there, and the button stays hidden.
    return null;
  }
}

/** True when this phone or browser can hand over a calendar file. */
export async function calendarAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return typeof document !== 'undefined';
  const m = phoneModules();
  return !!m && (await m.sharing.isAvailableAsync());
}

export async function addToCalendar(plan: CalendarPlan, dialogTitle: string): Promise<void> {
  const ics = icsFor(plan);
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'pinkilock-plan.ics';
    a.click();
    return;
  }
  const m = phoneModules();
  if (!m) throw new Error('calendar: no share module');
  const file = new m.files.File(m.files.Paths.cache, 'pinkilock-plan.ics');
  file.write(ics);
  await m.sharing.shareAsync(file.uri, { mimeType: 'text/calendar', UTI: 'com.apple.ical.ics', dialogTitle });
}
