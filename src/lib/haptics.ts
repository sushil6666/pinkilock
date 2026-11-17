/**
 * The app's haptic vocabulary (DESIGN_SYSTEM.md section 6). One place so iOS and Android stay in
 * step, and so web (no haptics) and devices with vibration off never throw.
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';
import { quiet } from './log';

const on = Platform.OS === 'ios' || Platform.OS === 'android';
const safe = (p: Promise<void>) => p.catch(quiet('haptic'));

export const haptic = {
  tick: () => on && safe(Haptics.selectionAsync()),
  light: () => on && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => on && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  heavy: () => on && safe(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)),
  success: () => on && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => on && safe(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
