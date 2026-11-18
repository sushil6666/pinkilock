/**
 * The whole look of Pinkilock in one file (see DESIGN_SYSTEM.md).
 * Screens and components import from here and never hard-code a colour or a size.
 */
import { Easing } from 'react-native-reanimated';
import type { TextStyle } from 'react-native';

export const color = {
  bg: '#241A63',
  surface: '#30237A',
  surfaceHi: '#3D2E91',
  line: '#5A49B8',
  text: '#FFF8E7',
  textDim: '#D3CBF5',
  textMute: '#A99CE3',
  gold: '#F5C95C',
  goldDeep: '#B8892A',
  goldWash: 'rgba(245,201,92,0.14)',
  moon: '#FFE6A3',
  pink: '#FF6FAE',
  pinkDeep: '#C2457E',
  pinkWash: 'rgba(255,111,174,0.16)',
  pinkHalo: 'rgba(255,111,174,0.38)',
  /** Light catching the top of a clay shape (the logo's fingers). */
  shine: 'rgba(255,255,255,0.34)',
  flare: '#FF8466',
  flareWash: 'rgba(255,132,102,0.14)',
  onGold: '#241A63',
  onPink: '#241A63',
  scrim: 'rgba(20,14,60,0.72)',
  /** Behind a badge that sits on a photo or portrait: dark enough that gold and white stay sharp. */
  onPhoto: 'rgba(20,14,60,0.88)',
  /** The colour shadows are cast in: the night sky, deeper. Never black. */
  shadow: '#0E0838',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, x3: 32, x4: 40, x5: 56 } as const;
export const gutter = space.xl;
/**
 * The widest the app ever draws. On a phone the screen is narrower and this does nothing; in a
 * wide browser window or on a tablet every screen sits in a centred column of this width.
 */
export const columnMax = 480;
/** The first screen in a wide browser window fills the window; its text columns stop at this. */
export const wideMax = 1200;
/**
 * Desktop: a browser window at least `deskMin` wide gets the desktop layout (`src/lib/desktop.ts`):
 * the tabs become a side menu, pages run up to `deskMax` with two columns where they have two
 * kinds of thing, forms sit beside the night sky at `columnMax`, and reading pages stop at `readMax`.
 */
export const deskMin = 960;
export const deskMax = 1080;
export const readMax = 760;
export const sideNav = 232;
/** How far a button stands off its slab, and how far it sinks when pressed. */
export const depth = 5;

export const radius = { chip: 6, card: 14, sheet: 28, pill: 999 } as const;

export const font = {
  display: 'InterTight_800ExtraBold',
  /** The wordmark only: the logo's "pinkilock" in a true italic. */
  displayItalic: 'InterTight_800ExtraBold_Italic',
  regular: 'InterTight_400Regular',
  medium: 'InterTight_500Medium',
  bold: 'InterTight_700Bold',
  hand: 'CaveatBrush_400Regular',
} as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const type = {
  mega: { fontFamily: font.display, fontSize: 54, lineHeight: 58, letterSpacing: -1.5, ...tabular },
  display: { fontFamily: font.display, fontSize: 38, lineHeight: 42, letterSpacing: -1 },
  title: { fontFamily: font.display, fontSize: 25, lineHeight: 30, letterSpacing: -0.5 },
  heading: { fontFamily: font.bold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  bodyBold: { fontFamily: font.bold, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: 'uppercase' },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  hand: { fontFamily: font.hand, fontSize: 24, lineHeight: 27 },
} as const satisfies Record<string, TextStyle>;

export type TypeName = keyof typeof type;

export const motion = {
  fast: 120,
  base: 240,
  slow: 520,
  ease: Easing.out(Easing.cubic),
  spring: {
    snappy: { damping: 18, stiffness: 260, mass: 0.9 },
    lock: { damping: 11, stiffness: 210, mass: 1 },
    back: { damping: 20, stiffness: 180, mass: 1 },
  },
} as const;
