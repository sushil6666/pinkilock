/** The in-app banner for what the other person just did. Tap to go there; it leaves on its own after 6 seconds. */
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { haptic } from '../lib/haptics';
import { useStore } from '../state/store';
import { elevation } from '../theme/elevation';
import { color, columnMax, gutter, radius, space } from '../theme/tokens';
import { T } from './ui/T';

const TONE = { pink: color.pink, volt: color.gold, flare: color.flare };

export function NoticeBanner() {
  const notice = useStore((s) => s.notice);
  const invite = useStore((s) => s.invites.find((i) => i.id === s.notice?.inviteId));
  const dismiss = useStore((s) => s.dismissNotice);
  const insets = useSafeAreaInsets();
  const path = usePathname();
  // The lock and plan screens already show this change as it happens.
  const redundant = !!notice?.inviteId && path.endsWith(notice.inviteId);

  useEffect(() => {
    if (!notice) return;
    if (redundant) return dismiss();
    if (notice.tone === 'volt') haptic.success();
    else haptic.medium();
    const id = setTimeout(dismiss, 6000);
    return () => clearTimeout(id);
  }, [notice, redundant, dismiss]);

  if (!notice || redundant) return null;
  const tone = TONE[notice.tone];
  const open = () => {
    dismiss();
    if (!invite) return;
    const plan = invite.status === 'locked' || invite.status === 'kept' || invite.status === 'flaked';
    router.push(plan ? `/plan/${invite.id}` : `/invite/${invite.id}`);
  };

  return (
    <Animated.View entering={FadeInUp.duration(280)} exiting={FadeOutUp.duration(200)} style={[styles.wrap, { top: insets.top + space.sm }]} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel={`${notice.title}. ${notice.body}`} onPress={open} style={[styles.card, elevation('raised'), { borderColor: tone }]}>
        <View style={[styles.stripe, { backgroundColor: tone }]} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold" c={tone}>{notice.title}</T>
          <T v="caption" c={color.text}>{notice.body}</T>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, paddingHorizontal: gutter, alignItems: 'center', zIndex: 50 },
  card: { width: '100%', maxWidth: columnMax - 2 * gutter, flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: color.surfaceHi, borderWidth: 1, borderRadius: radius.card, padding: space.md, overflow: 'hidden' },
  stripe: { width: 4, alignSelf: 'stretch', borderRadius: 2 },
});
