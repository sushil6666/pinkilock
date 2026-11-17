/**
 * The whole look of Pinkilock in one file (see DESIGN_SYSTEM.md).
 * Screens and components import from here and never hard-code a colour or a size.
 */
import { Easing } from 'react-native-reanimated';
import type { TextStyle } from 'react-native';

export const color = {
  bg: '#001C55',
  surface: '#04225F',
  surfaceHi: '#0B2F7C',
  line: '#4169E1',
  text: '#F6F6F1',
  textDim: '#A9D8F7',
  textMute: '#7DB0E0',
  pink: '#FF2E93',
  pinkDeep: '#B3115F',
  pinkWash: 'rgba(255,46,147,0.14)',
  volt: '#D7FF3E',
  voltWash: 'rgba(215,255,62,0.12)',
  flare: '#FF5A36',
  flareWash: 'rgba(255,90,54,0.14)',
  onPink: '#00123A',
  scrim: 'rgba(0,10,40,0.7)',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, x3: 32, x4: 40, x5: 56 } as const;
export const gutter = space.xl;
/**
 * The widest the app ever draws. On a phone the screen is narrower and this does nothing; in a
 * wide browser window or on a tablet every screen sits in a centred column of this width.
 */
export const columnMax = 480;

export const radius = { chip: 6, card: 14, sheet: 28, pill: 999 } as const;

export const font = {
  display: 'ArchivoBlack_400Regular',
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  bold: 'SpaceGrotesk_700Bold',
} as const;

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const type = {
  mega: { fontFamily: font.display, fontSize: 56, lineHeight: 58, letterSpacing: -0.5, textTransform: 'uppercase', ...tabular },
  display: { fontFamily: font.display, fontSize: 40, lineHeight: 42, letterSpacing: -0.5, textTransform: 'uppercase' },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 29, letterSpacing: -0.3, textTransform: 'uppercase' },
  heading: { fontFamily: font.bold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
  bodyBold: { fontFamily: font.bold, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: font.bold, fontSize: 12, lineHeight: 16, letterSpacing: 1.4, textTransform: 'uppercase' },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
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
