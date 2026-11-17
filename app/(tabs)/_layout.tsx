/** Four tabs and a custom bar that sits above the home indicator or Android navigation bar. */
import { Feather } from '@expo/vector-icons';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Tabs } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { column } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { lockRole } from '@/domain/invites';
import { haptic } from '@/lib/haptics';
import { useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';

const TABS: Record<string, { label: string; icon: keyof typeof Feather.glyphMap }> = {
  index: { label: 'Discover', icon: 'compass' },
  invites: { label: 'Asks', icon: 'send' },
  plans: { label: 'Plans', icon: 'lock' },
  me: { label: 'Me', icon: 'user' },
};

function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const meId = useStore((s) => s.me?.id ?? '');
  const invites = useStore((s) => s.invites);
  const counts: Record<string, number> = {
    invites: invites.filter((i) => ['first', 'seal'].includes(lockRole(i, meId))).length,
    plans: invites.filter((i) => i.status === 'locked').length,
  };

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
            accessibilityLabel={count ? `${tab.label}, ${count}` : tab.label}
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
            <T v="label" c={tone} style={{ fontSize: 10, letterSpacing: 1 }}>{tab.label}</T>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: color.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="invites" />
      <Tabs.Screen name="plans" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: color.bg, borderTopWidth: 1, borderTopColor: color.line },
  row: { ...column, flexDirection: 'row' },
  tab: { flex: 1, alignItems: 'center', gap: 4, paddingBottom: 6, minHeight: 56 },
  marker: { width: 28, height: 3, borderBottomLeftRadius: 2, borderBottomRightRadius: 2, marginBottom: 7 },
  count: { position: 'absolute', top: -6, right: -12, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, backgroundColor: color.pink, alignItems: 'center', justifyContent: 'center' },
});
