/**
 * Desktop: a browser window wide enough for the desktop layout (a side menu, wider pages, two
 * columns). Phones, tablets in the app and narrow windows get the phone layout unchanged. Screens
 * ask this rather than measuring for themselves, so the breakpoint lives in one place.
 */
import { Platform, useWindowDimensions } from 'react-native';
import { deskMin } from '../theme/tokens';

export function useDesktop(): boolean {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= deskMin;
}
