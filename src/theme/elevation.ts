/**
 * One shadow vocabulary for both platforms. iOS draws a real shadow from the four shadow props;
 * Android draws `elevation` (and tints it with `shadowColor` on API 28+). Asking for a level here
 * gives the closest match on each, so cards look the same weight on both.
 */
import { Platform, type ViewStyle } from 'react-native';
import { color } from './tokens';

type Level = 'raised' | 'glow';

const ios: Record<Level, ViewStyle> = {
  raised: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  glow: { shadowColor: color.pink, shadowOpacity: 0.55, shadowRadius: 22, shadowOffset: { width: 0, height: 6 } },
};

const android: Record<Level, ViewStyle> = {
  raised: { elevation: 8, shadowColor: '#000' },
  glow: { elevation: 10, shadowColor: color.pink },
};

const web: Record<Level, ViewStyle> = {
  raised: { boxShadow: '0 8px 24px rgba(0,0,0,0.45)' } as ViewStyle,
  glow: { boxShadow: '0 6px 22px rgba(255,46,147,0.55)' } as ViewStyle,
};

export function elevation(level: Level): ViewStyle {
  return Platform.select({ ios: ios[level], android: android[level], default: web[level] }) as ViewStyle;
}
