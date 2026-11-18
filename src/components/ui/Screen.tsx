/**
 * Every screen sits in one of these. It owns the safe area (notch, Dynamic Island, home
 * indicator, Android gesture or 3-button bar), the gutter, the header (the logo top centre, with an
 * optional back control and title under the logo) and a footer that stays above the keyboard, so no screen handles insets itself.
 *
 * It also owns the width. Nothing is drawn wider than `columnMax`: in a wide browser window or
 * on a tablet the screen is a centred column with the app's own background around it and a
 * hairline down each side. Things drawn outside a Screen (the tab bar, sheets, the notice
 * banner) use `column` from here, so the rule lives in one place.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { webOnly } from '../../lib/web';
import { color, columnMax, gutter, space, wideMax } from '../../theme/tokens';
import { Logo } from '../Logo';
import { T } from './T';

interface Props {
  children: ReactNode;
  /** Shows a header with a back (or close) control. */
  title?: string;
  back?: 'back' | 'close' | false;
  onBack?: () => void;
  right?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** Tab screens: the tab bar already covers the bottom inset. */
  inTabs?: boolean;
  /** The first screen only, in a wide window: drawn up to `wideMax` instead of the column. */
  wide?: boolean;
  /** The logo sits top centre on every screen; only a page with its own top bar turns it off. */
  logo?: boolean;
}

/**
 * Back to Discover with nothing stacked on top: after a block or a report the screens behind
 * may be about the person who is now gone.
 */
export function backToDiscover() {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/(tabs)');
}

export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

/** Centred, never wider than the column. For anything that is drawn outside a Screen. */
export const column = { width: '100%', maxWidth: columnMax, alignSelf: 'center' } as const;

export function Screen({ children, title, back = false, onBack, right, footer, scroll = true, inTabs, wide, logo = true }: Props) {
  const width = wide ? { ...column, maxWidth: wideMax } : column;
  const insets = useSafeAreaInsets();
  const bottom = inTabs ? space.xxl : Math.max(insets.bottom, space.lg) + space.sm;
  const hasHeader = logo || back !== false || !!title || !!right;

  return (
    <KeyboardAvoidingView {...webOnly({ role: 'main' as const })} style={[styles.root, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* The column's edges, only visible where the window is wider than it. */}
      <View style={styles.rail} pointerEvents="none"><View style={[styles.railLines, wide && { maxWidth: wideMax + 2 }]} /></View>
      {hasHeader && (
        <View style={styles.header}>
          {back !== false ? (
            <Pressable accessibilityRole="button" accessibilityLabel={back === 'close' ? 'Close' : 'Back'} hitSlop={12} onPress={onBack ?? goBack} style={styles.headerBtn}>
              <Feather name={back === 'close' ? 'x' : 'arrow-left'} size={22} color={color.text} />
            </Pressable>
          ) : <View style={styles.headerBtn} />}
          <View style={styles.middle}>
            {logo && <Logo size={18} />}
            {title ? <T v="label" c={color.textDim} numberOfLines={1} center>{title}</T> : null}
          </View>
          <View style={[styles.headerBtn, { alignItems: 'flex-end' }]}>{right}</View>
        </View>
      )}
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ ...width, paddingHorizontal: gutter, paddingTop: hasHeader ? space.sm : space.lg, paddingBottom: footer ? space.xxl : bottom }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, width, { paddingHorizontal: gutter, paddingBottom: footer ? 0 : bottom }]}>{children}</View>
      )}
      {footer && <View style={[styles.footer, { paddingBottom: bottom }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  rail: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  railLines: { flex: 1, width: '100%', maxWidth: columnMax + 2, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  header: { ...column, minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: gutter - 4, paddingVertical: space.xs },
  middle: { flex: 1, alignItems: 'center', gap: 2 },
  headerBtn: { width: 48, height: 48, justifyContent: 'center' },
  footer: { ...column, paddingHorizontal: gutter, paddingTop: space.md, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, backgroundColor: color.bg },
});
