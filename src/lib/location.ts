/**
 * Where the phone is, once, for "Use my location" (D087). Asks for permission when needed. The
 * position goes back to the caller only, to pick a city and an area; it is never saved, logged or
 * sent (src/domain/nearby.ts does the work on the phone).
 */
import * as Location from 'expo-location';
import type { Spot } from '@/domain/nearby';

export type Located = { ok: true; here: Spot } | { ok: false; why: 'denied' | 'unavailable' };

export async function locateOnce(): Promise<Located> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') return { ok: false, why: 'denied' };
    // Balanced is enough to tell one neighbourhood from the next, and quicker than the best fix.
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { ok: true, here: { lat: pos.coords.latitude, lng: pos.coords.longitude } };
  } catch {
    // No location service (many desktops) or it timed out: the person picks by hand.
    return { ok: false, why: 'unavailable' };
  }
}
