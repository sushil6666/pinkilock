/**
 * Four tabs and a custom bar that sits above the home indicator or Android navigation bar. On a
 * desktop window the bar becomes a menu down the left: icon beside label, the active tab in pink.
 */
import { Feather } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { column } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { lockRole } from '@/domain/invites';
import { haptic } from '@/lib/haptics';
import { useDesktop } from '@/lib/desktop';
import { aria } from '@/lib/web';
import { useStore } from '@/state/store';
import { color, radius, sideNav, space } from '@/theme/tokens';
import { t } from '@/i18n';

const TABS: Record<string, { label: 'tabs.discover' | 'tabs.asks' | 'tabs.plans' | 'tabs.me'; icon: keyof typeof Feather.glyphMap }> = {
  index: { label: 'tabs.discover', icon: 'compass' },
  invites: { label: 'tabs.asks', icon: 'send' },
  plans: { label: 'tabs.plans', icon: 'lock' },
  me: { label: 'tabs.me', icon: 'user' },
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const desktop = useDesktop();
  const meId = useStore((s) => s.me?.id ?? '');
  const invites = useStore((s) => s.invites);
  const counts: Record<string, number> = {
    invites: invites.filter((i) => ['first', 'seal'].includes(lockRole(i, meId))).length,
    plans: invites.filter((i) => i.status === 'locked').length,
  };

  if (desktop) {
    return (
      <View style={styles.side} accessibilityRole="tablist">
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const count = counts[route.name] ?? 0;
          const tone = focused ? color.pink : color.textDim;
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              {...aria({ selected: focused })}
              accessibilityLabel={count ? t('tabs.withCount', { tab: t(tab.label), count }) : t(tab.label)}
              onPress={() => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
              }}
              style={({ pressed }) => [styles.sideTab, (focused || pressed) && styles.sideOn]}
            >
              <View style={[styles.sideMarker, focused && { backgroundColor: color.pink }]} />
              <Feather name={tab.icon} size={20} color={tone} />
              <T v="bodyBold" c={focused ? color.text : color.textDim} style={{ flex: 1 }}>{t(tab.label)}</T>
              {count > 0 && <View style={styles.sideCount}><T v="label" c={color.onPink} style={{ fontSize: 11, lineHeight: 16, letterSpacing: 0 }}>{count}</T></View>}
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm), paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={styles.row}>
      {state.routes.map((route, index) => {
        const tab = TABS[route.name];
        if (!tab) return null;
        const focused = state.index === index;
        const count = counts[route.name] ?? 0;
        const tone = focused ? color.pink : color.textDim;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            {...aria({ selected: focused })}
            accessibilityLabel={count ? t('tabs.withCount', { tab: t(tab.label), count }) : t(tab.label)}
            onPress={() => {
              haptic.tick();
              const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
            }}
            style={styles.tab}
          >
            <View style={[styles.marker, focused && { backgroundColor: color.pink }]} />
            <View>
              <Feather name={tab.icon} size={22} color={tone} />
              {count > 0 && (
                <View style={styles.count}><T v="label" c={color.onPink} style={{ fontSize: 10, lineHeight: 14, letterSpacing: 0 }}>{count}</T></View>
              )}
            </View>
            <T v="label" c={tone} style={{ fontSize: 10, letterSpacing: 1 }}>{t(tab.label)}</T>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const desktop = useDesktop();
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg }, tabBarPosition: desktop ? 'left' : 'bottom' }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="invites" />
      <Tabs.Screen name="plans" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  side: { width: sideNav, backgroundColor: color.bg, borderRightWidth: 1, borderRightColor: color.line, paddingHorizontal: space.md, paddingTop: 72, gap: space.xs },
  sideTab: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: space.md, borderRadius: radius.card },
  sideOn: { backgroundColor: color.surface },
  sideMarker: { position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 2 },
  sideCount: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: color.pink, alignItems: 'center', justifyContent: 'center' },
  bar: { backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.line },
  row: { ...column, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingBottom: 6, minHeight: 56 },
  marker: { width: 28, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginBottom: 7 },
  count: { position: 'absolute', top: -6, right: -12, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: color.pink, alignItems: 'center', justifyContent: 'center' },
});
