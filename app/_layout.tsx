/**
 * App shell: fonts, the gesture root, safe-area provider, dark system bars on both platforms,
 * and the one-time boot of the backend. Screens below can assume all of that is in place.
 */
import { CaveatBrush_400Regular } from '@expo-google-fonts/caveat-brush';
import { InterTight_400Regular, InterTight_500Medium, InterTight_700Bold, InterTight_800ExtraBold, InterTight_800ExtraBold_Italic } from '@expo-google-fonts/inter-tight';
import { useFonts } from 'expo-font';
import { Stack, router, usePathname, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { CaptchaHost } from '@/components/captcha/CaptchaHost';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NoticeBanner } from '@/components/NoticeBanner';
import { startPush } from '@/lib/push';
import { useStore } from '@/state/store';
import { color } from '@/theme/tokens';
import { quiet } from '@/lib/log';
import { Button } from '@/components/ui/Button';
import { ErrorText } from '@/components/ui/ErrorText';
import { T } from '@/components/ui/T';
import { shown } from '@/lib/report';
import { needsProfile, titleFor } from '@/lib/routes';
import { setPageTitle } from '@/lib/web';
import { space } from '@/theme/tokens';
import { isRtl, language, script, t } from '@/i18n';
import { loadSavedLanguage } from '@/lib/language';
import { scriptFontFiles } from '@/theme/scriptFonts';

SplashScreen.preventAutoHideAsync().catch(quiet('/_layout'));

// The writing direction follows the language (WP9). A browser page says it on <html>; a phone
// flips its layout from the next start, once the saved choice is read (src/lib/language.ts).
if (Platform.OS === 'web') {
  document.documentElement.lang = language();
  document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
}

/** The current language's script font, in a browser only (src/theme/scriptFonts.web.ts). Read once. */
const SCRIPT_FONTS = scriptFontFiles(script());

/**
 * A crash in any screen lands here instead of a white screen: it is reported once, with a code
 * and a trace id the person can read out, and "Try again" re-renders the screen that broke.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const path = usePathname();
  // Reported once per crash. The path's ids are dropped: only its shape is sent.
  const text = useMemo(() => shown(error, path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|inv_\w+/g, '[id]'), 'PC009'), [error, path]);
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, justifyContent: 'center', padding: space.xl, gap: space.lg }}>
      <T v="display">{t('crash.title')}</T>
      <ErrorText text={text} tone={color.textDim} />
      <Button label={t('common.tryAgain')} icon="rotate-ccw" onPress={retry} />
    </View>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ InterTight_800ExtraBold, InterTight_800ExtraBold_Italic, CaveatBrush_400Regular, InterTight_400Regular, InterTight_500Medium, InterTight_700Bold, ...SCRIPT_FONTS });
  // A phone's saved language is read before anything shows (a browser has it already).
  const [langReady, setLangReady] = useState(Platform.OS === 'web');
  useEffect(() => {
    if (!langReady) loadSavedLanguage().catch(quiet('/_layout')).finally(() => setLangReady(true));
  }, [langReady]);
  const ready = useStore((s) => s.ready);
  const boot = useStore((s) => s.boot);
  const onboarded = useStore((s) => !!s.me);

  useEffect(() => {
    boot();
    SystemUI.setBackgroundColorAsync(color.bg).catch(quiet('/_layout'));
    // Android draws the app edge to edge: the night sky is already behind the 3-button or gesture
    // bar, and the expo-navigation-bar plugin (app.json) makes its buttons light with no scrim.
  }, [boot]);

  // Once there is a profile to attach a device to: ask for notifications and register the phone.
  useEffect(() => {
    if (onboarded) startPush();
  }, [onboarded]);

  const up = (fontsLoaded || !!fontError) && ready && langReady;
  useEffect(() => {
    if (up) SplashScreen.hideAsync().catch(quiet('/_layout'));
  }, [up]);

  // Where we are, as the route's own name: "plan/[id]", never the id.
  const route = useSegments().join('/');
  useEffect(() => setPageTitle(titleFor(route.split('/'))), [route]);

  // A link straight to a screen that belongs to a person, opened by someone with no profile
  // (a shared link, a bookmark after signing out): send them through the gate at "/", which
  // leads to onboarding or says why it cannot connect. Checked here once, not in every screen.
  const shut = up && !onboarded && needsProfile(route.split('/'));
  useEffect(() => {
    if (shut) router.replace('/');
  }, [shut]);

  // The captcha check may be needed while the app is still starting (the first anonymous sign-in).
  if (!up) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: color.bg }} />
        <CaptchaHost />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: color.bg }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg }, animation: 'slide_from_right' }}>
          <Stack.Screen name="index" options={{ animation: 'none' }} />
          <Stack.Screen name="onboarding" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
          <Stack.Screen name="invite/new" options={{ animation: 'slide_from_bottom' }} />
          {/* No swipe-back on the lock: the pan belongs to the pinky. */}
          <Stack.Screen name="lock/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
        </Stack>
        {/* Nothing of the screen underneath may show for the moment before the gate takes over. */}
        {shut ? <View style={[StyleSheet.absoluteFill, { backgroundColor: color.bg }]} /> : null}
        <NoticeBanner />
        <CaptchaHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
