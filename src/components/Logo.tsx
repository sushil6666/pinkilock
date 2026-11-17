/**
 * The Pinkilock logo: the two pinkies in their locked pose (the same geometry as the app icon,
 * scripts/make-icons.mjs, and PinkyFinger.tsx), beside the name set in the display face with a
 * gold full stop. It sits centred at the top of every screen (Screen draws it) and on the website.
 *
 * `size` is the height of the wordmark's letters; the mark scales with it. `mark` alone drops the
 * name, for tight spots. The logo is one image to a screen reader: "Pinkilock".
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Line, Path } from 'react-native-svg';
import { webOnly } from '../lib/web';
import { color, font } from '../theme/tokens';
import { T } from './ui/T';

// make-icons.mjs: stroke 36, curl 34, tip 46, offset 30, reach 150, drawn around (0, 0).
const S = 36, CURL = 34, TIP = 46, OFF = 30, REACH = 150;
const VIEW = { x: -170, y: -70, w: 340, h: 140 };

export function LogoMark({ height = 24 }: { height?: number }) {
  const width = (height * VIEW.w) / VIEW.h;
  const stroke = { fill: 'none', strokeWidth: S, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={width} height={height} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}>
      <G>
        <Path d={`M ${-REACH} ${-OFF} H ${OFF - CURL} a ${CURL} ${CURL} 0 0 1 ${CURL} ${CURL} v ${TIP}`} {...stroke} stroke={color.pink} />
        <Path d={`M ${REACH} ${OFF} H ${-OFF + CURL} a ${CURL} ${CURL} 0 0 1 ${-CURL} ${-CURL} v ${-TIP}`} {...stroke} stroke={color.gold} />
        <Line x1={OFF} x2={OFF} y1={6} y2={-OFF + CURL + TIP} stroke={color.pink} strokeWidth={S} strokeLinecap="round" />
      </G>
    </Svg>
  );
}

export function Logo({ size = 20, mark = false, style }: { size?: number; mark?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[{ flexDirection: 'row', alignItems: 'center', gap: size * 0.4 }, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Pinkilock"
      {...webOnly({ role: 'img' as const, 'aria-label': 'Pinkilock' })}
    >
      <LogoMark height={size * 1.15} />
      {!mark && (
        <T style={{ fontFamily: font.display, fontSize: size, lineHeight: size * 1.2, letterSpacing: -size * 0.03 }} maxFontSizeMultiplier={1} importantForAccessibility="no" accessibilityElementsHidden>
          pinkilock<T style={{ fontFamily: font.display, fontSize: size, lineHeight: size * 1.2 }} c={color.gold}>.</T>
        </T>
      )}
    </View>
  );
}
