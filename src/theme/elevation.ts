/**
 * One shadow vocabulary for both platforms. iOS draws a real shadow from the four shadow props;
 * Android draws `elevation` (and tints it with `shadowColor` on API 28+). Asking for a level here
 * gives the closest match on each, so cards look the same weight on both.
 */
import { Platform, type ViewStyle } from 'react-native';
import { color } from './tokens';

type Level = 'raised' | 'glow';

const ios: Record<Level, ViewStyle> = {
  raised: { shadowColor: color.shadow, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } },
  glow: { shadowColor: color.gold, shadowOpacity: 0.5, shadowRadius: 22, shadowOffset: { width: 0, height: 6 } },
};

const android: Record<Level, ViewStyle> = {
  raised: { elevation: 8, shadowColor: color.shadow },
  glow: { elevation: 10, shadowColor: color.gold },
};

const web: Record<Level, ViewStyle> = {
  raised: { boxShadow: '0 8px 24px rgba(14,8,56,0.5)' } as ViewStyle,
  glow: { boxShadow: '0 6px 22px rgba(245,201,92,0.5)' } as ViewStyle,
};

export function elevation(level: Level): ViewStyle {
  return Platform.select({ ios: ios[level], android: android[level], default: web[level] }) as ViewStyle;
}
