/**
 * The person's language choice (D102): kept on the device only, never sent to the server. A
 * browser keeps it in localStorage and reads it before the first frame (src/i18n/index.ts); a
 * phone keeps it in AsyncStorage and reads it at start, before the splash screen goes
 * (`loadSavedLanguage`, app/_layout.tsx). Changing it restarts the app, because the fonts, the
 * writing direction and every screen's words are chosen at start.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Updates from 'expo-updates';
import { DevSettings, I18nManager, Platform } from 'react-native';
import { LANG_KEY, isRtl, setLocale } from '../i18n';
import { quiet } from './log';

const isWeb = Platform.OS === 'web';

/** On a phone: apply the saved choice, and make the layout's direction match it. */
export async function loadSavedLanguage(): Promise<void> {
  if (isWeb) return;
  const saved = process.env.EXPO_PUBLIC_LANG ? null : await AsyncStorage.getItem(LANG_KEY).catch(() => null);
  if (saved) setLocale(saved);
  // A right-to-left language flips the whole layout, which a phone applies from the next start.
  if (I18nManager.isRTL !== isRtl()) {
    I18nManager.allowRTL(isRtl());
    I18nManager.forceRTL(isRtl());
  }
}

function restart(): void {
  if (isWeb) {
    // Drop a `?lang=` the address may carry, or it would win over the new choice.
    const url = new URL(window.location.href);
    url.searchParams.delete('lang');
    window.location.replace(url.toString());
    return;
  }
  Updates.reloadAsync().catch(() => {
    // Development builds have no updates module to reload with: the dev menu's reload does it.
    DevSettings.reload();
  });
}

/** Saves the choice and restarts in it. */
export async function chooseLanguage(tag: string): Promise<void> {
  if (isWeb) {
    try {
      window.localStorage.setItem(LANG_KEY, tag);
    } catch (e) {
      // Storage blocked: the choice still holds for this visit through the address.
      quiet('language.save')(e);
      const url = new URL(window.location.href);
      url.searchParams.set('lang', tag);
      window.location.replace(url.toString());
      return;
    }
  } else {
    await AsyncStorage.setItem(LANG_KEY, tag).catch(quiet('language.save'));
    setLocale(tag);
    if (I18nManager.isRTL !== isRtl()) {
      I18nManager.allowRTL(isRtl());
      I18nManager.forceRTL(isRtl());
    }
  }
  restart();
}
