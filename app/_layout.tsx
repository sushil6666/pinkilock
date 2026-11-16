/**
 * App shell: fonts, the gesture root, safe-area provider, dark system bars on both platforms,
 * and the one-time boot of the backend. Screens below can assume all of that is in place.
 */
import { ArchivoBlack_400Regular } from '@expo-google-fonts/archivo-black';
import { SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk';
import { useFonts } from 'expo-font';
import * as NavigationBar from 'expo-navigation-bar';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NoticeBanner } from '@/components/NoticeBanner';
import { startPush } from '@/lib/push';
import { useStore } from '@/state/store';
import { color } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ ArchivoBlack_400Regular, SpaceGrotesk_400Regular, SpaceGrotesk_500Medium, SpaceGrotesk_700Bold });
  const ready = useStore((s) => s.ready);
  const boot = useStore((s) => s.boot);
  const onboarded = useStore((s) => !!s.me);

  useEffect(() => {
    boot();
    SystemUI.setBackgroundColorAsync(color.bg).catch(() => {});
    if (Platform.OS === 'android') {
      // Obsidian behind the 3-button or gesture bar, with light buttons.
      NavigationBar.setBackgroundColorAsync(color.bg).catch(() => {});
      NavigationBar.setButtonStyleAsync('light').catch(() => {});
    }
  }, [boot]);

  // Once there is a profile to attach a device to: ask for notifications and register the phone.
  useEffect(() => {
    if (onboarded) startPush();
  }, [onboarded]);

  const up = (fontsLoaded || !!fontError) && ready;
  useEffect(() => {
    if (up) SplashScreen.hideAsync().catch(() => {});
  }, [up]);

  if (!up) return <View style={{ flex: 1, backgroundColor: color.bg }} />;

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
        <NoticeBanner />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
