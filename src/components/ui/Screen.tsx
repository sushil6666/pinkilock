/**
 * Every screen sits in one of these. It owns the safe area (notch, Dynamic Island, home
 * indicator, Android gesture or 3-button bar), the gutter, the header (the logo top centre, with an
 * optional back control and title under the logo) and a footer that stays above the keyboard, so no screen handles insets itself.
 *
 * It also owns the width. On a phone, or a narrow window, nothing is drawn wider than `columnMax`:
 * the screen is a centred column with a hairline down each side where the window is wider. On a
 * desktop window (`useDesktop`) each screen says what kind it is with `desk`:
 * - `page` (the default): up to `deskMax`, for screens that lay out two columns (`Columns`, `Grid`).
 * - `form`: one thing to fill in or decide. The night sky and the pinkies fill the left of the
 *   window; the form sits on the right at `columnMax`, with its footer under it; the city runs
 *   along the bottom of both, edge to edge (D086).
 * - `read`: long text, up to `readMax`.
 * Things drawn outside a Screen (sheets, the notice banner) use `column` from here.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesktop } from '../../lib/desktop';
import { webOnly } from '../../lib/web';
import { color, columnMax, deskMax, gutter, readMax, space } from '../../theme/tokens';
import { Logo } from '../Logo';
import { Loop } from '../Loop';
import { City, NightSky } from '../NightSky';
import { useStore } from '../../state/store';
import { T } from './T';
import { t } from '../../i18n';

export type Desk = 'page' | 'form' | 'read';

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
  /** The first screen only, in a wide window: drawn across the whole window instead of the column. */
  wide?: boolean;
  /** The logo sits top centre on every screen; only a page with its own top bar turns it off. */
  logo?: boolean;
  /** How the screen is laid out on a desktop window. Phones ignore it. */
  desk?: Desk;
  /** A `form` screen's left side on desktop, in place of the night sky and the pinkies. */
  aside?: ReactNode;
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

/** The default left side of a form on desktop: the night sky with the pinkies hooking in it. */
function SkyAside() {
  return (
    <View style={styles.aside}>
      <NightSky wide city={false} moon={styles.asideMoon}>
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}><Loop name="pinkyLock" /></View>
      </NightSky>
    </View>
  );
}

export function Screen({ children, title, back = false, onBack, right, footer, scroll = true, inTabs, wide, logo = true, desk = 'page', aside }: Props) {
  const desktop = useDesktop() && !wide;
  const form = desktop && desk === 'form';
  const maxWidth = !desktop ? columnMax : desk === 'read' ? readMax : desk === 'page' ? deskMax : columnMax;
  const width = wide ? ({ width: '100%' } as const) : ({ width: '100%', maxWidth, alignSelf: 'center' } as const);
  const insets = useSafeAreaInsets();
  const bottom = inTabs ? space.xxl : Math.max(insets.bottom, space.lg) + space.sm;
  const hasHeader = logo || back !== false || !!title || !!right;
  // Mumbai's landmarks only over Mumbai, or before anyone has a city (sign-up).
  const myCity = useStore((s) => s.me?.city);
  const landmarks = !myCity || myCity === 'Mumbai';

  const header = hasHeader && (
    <View style={[styles.header, desktop && !form && { maxWidth: maxWidth + gutter * 2 }, form && styles.headerWide]}>
      {back !== false ? (
        <Pressable accessibilityRole="button" accessibilityLabel={t(back === 'close' ? 'common.close' : 'common.back')} hitSlop={12} onPress={onBack ?? goBack} style={styles.headerBtn}>
          <Feather name={back === 'close' ? 'x' : 'arrow-left'} size={22} color={color.text} />
        </Pressable>
      ) : <View style={styles.headerBtn} />}
      <View style={styles.middle}>
        {logo && <Logo size={desktop ? 20 : 18} />}
        {title ? <T v="label" c={color.textDim} numberOfLines={1} center>{title}</T> : null}
      </View>
      <View style={[styles.headerBtn, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );

  const body = scroll ? (
    <ScrollView
      style={styles.fill}
      contentContainerStyle={{ ...width, paddingHorizontal: gutter, paddingTop: hasHeader ? space.sm : space.lg, paddingBottom: footer ? space.xxl : bottom, ...(form ? { flexGrow: 1, justifyContent: 'center' } : null) }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, width, { paddingHorizontal: gutter, paddingBottom: footer ? 0 : bottom }]}>{children}</View>
  );

  const foot = footer && <View style={[styles.footer, form && styles.footerForm, { paddingBottom: bottom }]}>{footer}</View>;

  return (
    <KeyboardAvoidingView {...webOnly({ role: 'main' as const })} style={[styles.root, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* The column's edges, only on the phone layout where the window is wider than it. */}
      {!wide && !desktop && <View style={styles.rail} pointerEvents="none"><View style={styles.railLines} /></View>}
      {header}
      {form ? (
        <>
          <View style={styles.split}>
            {aside ?? <SkyAside />}
            <View style={styles.formSide}>
              {body}
              {foot}
            </View>
          </View>
          {!aside && <City wide landmarks={landmarks} />}
        </>
      ) : (
        <>
          {body}
          {foot}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg },
  fill: { flex: 1 },
  rail: { ...StyleSheet.absoluteFillObject, alignItems: 'center' },
  railLines: { flex: 1, width: '100%', maxWidth: columnMax + 2, borderLeftWidth: StyleSheet.hairlineWidth, borderRightWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  header: { ...column, minHeight: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: gutter - 4, paddingVertical: space.xs },
  headerWide: { maxWidth: undefined, paddingHorizontal: space.x4 },
  middle: { flex: 1, alignItems: 'center', gap: 2 },
  headerBtn: { width: 48, height: 48, justifyContent: 'center' },
  footer: { ...column, paddingHorizontal: gutter, paddingTop: space.md, gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, backgroundColor: color.bg },
  footerForm: { borderTopWidth: 0 },
  // Desktop form: the sky on the left, the form on the right.
  split: { flex: 1, flexDirection: 'row' },
  aside: { flex: 1.2, justifyContent: 'center', overflow: 'hidden', paddingHorizontal: gutter },
  asideMoon: { right: '12%', top: 0 },
  // No line between the two sides: the sky runs into the form, and the city runs under both.
  formSide: { flex: 1, minWidth: columnMax + gutter * 2 },
});
