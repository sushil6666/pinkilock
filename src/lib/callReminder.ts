/**
 * Spicy call reminders (D106): two notifications on this phone, 15 minutes and 1 minute before a
 * call. Local only: no server push carries anything about Spicy mode, so the words are plain ("Your
 * call starts in 15 minutes") with no name, app or username. The web has none; the call panel says
 * when the call is.
 */
import { Platform } from 'react-native';
import { log, quiet } from './log';
import { t } from '../i18n';

const keys = (callId: string) => [`call-${callId}-15`, `call-${callId}-1`];

function notifications(): typeof import('expo-notifications') | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    log.warn('call_reminder.unavailable');
    return null;
  }
}

/** Schedule (or replace) the two reminders. False when this phone cannot. */
export async function scheduleCallReminders(callId: string, startsAt: number): Promise<boolean> {
  const N = notifications();
  if (!N) return false;
  const permission = await N.getPermissionsAsync();
  if (!permission.granted) return false;
  await cancelCallReminders(callId);
  const [k15, k1] = keys(callId);
  for (const [identifier, before, body] of [[k15, 15, t('calls.remind15')], [k1, 1, t('calls.remind1')]] as const) {
    const at = startsAt - before * 60_000;
    if (at <= Date.now()) continue;
    await N.scheduleNotificationAsync({
      identifier,
      content: { title: t('calls.remindTitle'), body, data: { kind: 'call_reminder' } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(at) },
    });
  }
  return true;
}

export async function cancelCallReminders(callId: string): Promise<void> {
  const N = notifications();
  if (!N) return;
  for (const k of keys(callId)) await N.cancelScheduledNotificationAsync(k).catch(quiet('call_reminder.cancel'));
}
