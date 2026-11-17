/**
 * This phone's side of push (ARCHITECTURE.md section 6). It does two things and no more:
 * hand the device's Expo push token to the backend, and open the right screen when a
 * notification is tapped. Sending is the server's job: there is no code here, or anywhere in the
 * app, that can send a push.
 *
 * Push needs a real device and a development or store build. On web, simulators and Expo Go it
 * reports why it is off and the app carries on with the in-app banner alone.
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { router } from 'expo-router';
import { Platform } from 'react-native';
import { backend } from '../services';
import { color } from '../theme/tokens';

export type PushState = 'on' | 'denied' | 'unavailable' | 'error';
export interface PushStatus { state: PushState; detail: string }

/** Must match `channelId` in supabase/functions/push/index.ts. */
const CHANNEL = 'promises';

let status: PushStatus = { state: 'unavailable', detail: 'Not set up yet.' };
let started: Promise<PushStatus> | null = null;
/** The token this device registered, so that signing out can hand it back. */
let registered: string | null = null;
let listening = false;
const watchers = new Set<(s: PushStatus) => void>();
const set = (s: PushStatus) => {
  status = s;
  watchers.forEach((w) => w(s));
  return s;
};

export const pushStatus = () => status;
export function watchPush(w: (s: PushStatus) => void): () => void {
  watchers.add(w);
  return () => void watchers.delete(w);
}

function whyUnavailable(): string | null {
  if (Platform.OS === 'web') return 'Push is for the phone app, not the web build.';
  if (!Device.isDevice) return 'Push needs a real phone, not a simulator.';
  // Expo Go cannot receive remote pushes on Android, and cannot use this project's credentials.
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'Push needs a development or preview build, not Expo Go.';
  return null;
}

/** Where a tapped notification leads: the same rule as the in-app banner. */
function open(data: unknown) {
  const inviteId = (data as { inviteId?: unknown } | null)?.inviteId;
  const kind = (data as { kind?: unknown } | null)?.kind;
  if (typeof inviteId !== 'string') return;
  const isPlan = kind !== 'new_ask' && kind !== 'pinky_out';
  router.push(isPlan ? `/plan/${inviteId}` : `/invite/${inviteId}`);
}

async function start(): Promise<PushStatus> {
  const why = whyUnavailable();
  if (why) return set({ state: 'unavailable', detail: why });
  try {
    // Loaded here, not at the top: the module complains at import time inside Expo Go.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Notifications = require('expo-notifications') as typeof import('expo-notifications');

    // While the app is open the in-app banner already says it; do not also drop a system banner.
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      // Android shows nothing without a channel. HIGH, because a promise has a clock on it.
      await Notifications.setNotificationChannelAsync(CHANNEL, {
        name: 'Promises',
        description: 'Asks, locks, check-in and bails',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: color.pink,
        vibrationPattern: [0, 200, 120, 200],
      });
    }

    // Once per app run, even if a sign-out and a sign-in start push again.
    if (!listening) {
      Notifications.addNotificationResponseReceivedListener((r) => open(r.notification.request.content.data));
      // The app was closed and a tap started it.
      Notifications.getLastNotificationResponseAsync().then((r) => r && open(r.notification.request.content.data), () => {});
    }

    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
    if (!permission.granted) return set({ state: 'denied', detail: 'Notifications are off for Pinkilock in system settings.' });

    const projectId: string | undefined = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return set({ state: 'error', detail: 'This build has no EAS project id, so it cannot get a push token.' });
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    await backend.registerPushToken(token, Platform.OS === 'ios' ? 'ios' : 'android');
    registered = token;

    // Tokens can rotate (restore from backup, reinstall of Google Play services).
    if (!listening) Notifications.addPushTokenListener(() => {
      Notifications.getExpoPushTokenAsync({ projectId }).then(async (t) => {
        if (!registered) return; // signed out since
        await backend.registerPushToken(t.data, Platform.OS === 'ios' ? 'ios' : 'android');
        registered = t.data;
      }, () => {});
    });
    listening = true;
    return set({ state: 'on', detail: 'You will hear about asks, locks, check-in and bails.' });
  } catch (e) {
    return set({ state: 'error', detail: e instanceof Error ? e.message : 'Could not set up notifications.' });
  }
}

/** Ask for permission and register this device. Safe to call often: it only runs once. */
export function startPush(): Promise<PushStatus> {
  return (started ??= start());
}

/**
 * Signing out: this phone stops getting the person's pushes. The next sign-in registers again.
 * (Deleting the account needs none of this: the server drops the person's tokens with them.)
 */
export async function stopPush(): Promise<void> {
  const token = registered;
  registered = null;
  started = null;
  if (token) await backend.unregisterPushToken(token).catch(() => {});
  set({ state: 'unavailable', detail: 'Not set up yet.' });
}
