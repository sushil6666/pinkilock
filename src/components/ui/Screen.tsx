/**
 * Every screen sits in one of these. It owns the safe area (notch, Dynamic Island, home
 * indicator, Android gesture or 3-button bar), the gutter, the optional back header and a
 * footer that stays above the keyboard, so no screen handles insets itself.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, gutter, space } from '../../theme/tokens';
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

export function Screen({ children, title, back = false, onBack, right, footer, scroll = true, inTabs }: Props) {
  const insets = useSafeAreaInsets();
  const bottom = inTabs ? space.xxl : Math.max(insets.bottom, space.lg) + space.sm;
  const hasHeader = back !== false || !!title || !!right;

  return (
    <KeyboardAvoidingView style={[styles.root, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {hasHeader && (
        <View style={styles.header}>
          {back !== false ? (
            <Pressable accessibilityRole="button" accessibilityLabel={back === 'close' ? 'Close' : 'Back'} hitSlop={12} onPress={onBack ?? goBack} style={styles.headerBtn}>
              <Feather name={back === 'close' ? 'x' : 'arrow-left'} size={22} color={color.text} />
            </Pressable>
          ) : <View style={styles.headerBtn} />}
          <T v="label" c={color.textDim} numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>{title ?? ''}</T>
          <View style={[styles.headerBtn, { alignItems: 'flex-end' }]}>{right}</View>
        </View>
      )}
      {scroll ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ paddingHorizontal: gutter, paddingTop: hasHeader ? space.sm : space.lg, paddingBottom: footer ? space.xxl : bottom }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, { paddingHorizontal: gutter, paddingBottom: footer ? 0 : bottom }]}>{children}</View>
      )}
      {footer && <View style={[styles.footer, { paddingBottom: bottom }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  header: { height: 52, flexDirection: 'row', alignItems: 'center', paddingHorizontal: gutter - 4 },
  headerBtn: { width: 48, height: 48, justifyContent: 'center' },
  footer: { paddingHorizontal: gutter, paddingTop: space.md, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, backgroundColor: color.bg },
});
