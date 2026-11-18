/**
 * After-date safety check (from the market review): a notification on this phone 15 minutes after
 * a plan ends, asking "Home safe?". Tapping it opens the Safety screen with the emergency numbers.
 * Local only: nothing goes to the server, and nobody else is told. It cannot alert anyone by
 * itself; that would need a server-side sender and a trusted contact, which Pinkilock does not
 * keep.
 */
import { Platform } from 'react-native';
import { log, quiet } from './log';
import { t } from '../i18n';

const key = (inviteId: string) => `safety-${inviteId}`;

function notifications(): typeof import('expo-notifications') | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('expo-notifications') as typeof import('expo-notifications');
  } catch {
    log.warn('safety_check.unavailable');
    return null;
  }
}

export const safetyCheckAvailable = () => Platform.OS !== 'web';

/** Schedule (or replace) the check for a plan. Returns false when this phone cannot. */
export async function scheduleSafetyCheck(inviteId: string, name: string, endsAt: number): Promise<boolean> {
  const N = notifications();
  if (!N) return false;
  const permission = await N.getPermissionsAsync();
  if (!permission.granted) return false;
  await N.cancelScheduledNotificationAsync(key(inviteId)).catch(quiet('safety_check.cancel'));
  await N.scheduleNotificationAsync({
    identifier: key(inviteId),
    content: { title: t('safetyCheck.title'), body: t('safetyCheck.body', { name }), data: { kind: 'safety_check', inviteId } },
    trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(endsAt + 15 * 60_000) },
  });
  return true;
}

export async function cancelSafetyCheck(inviteId: string): Promise<void> {
  const N = notifications();
  if (N) await N.cancelScheduledNotificationAsync(key(inviteId)).catch(quiet('safety_check.cancel'));
}

export { shareText } from './shareText';
