/**
 * The Pinkilock logo: the two pinkies in their locked pose (the same geometry as the app icon,
 * scripts/make-icons.mjs, and PinkyFinger.tsx), turned 45 degrees and given 3D depth, beside the
 * name in the display face, slanted forward (Sora has no italic, so the wordmark is skewed 12
 * degrees), with a gold full stop. It sits centred at the top of every screen (Screen draws it).
 *
 * `size` is the height of the wordmark's letters; the mark scales with it. `mark` alone drops the
 * name, for tight spots. The logo is one image to a screen reader: "Pinkilock".
 */
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Line, Path } from 'react-native-svg';
import { webOnly } from '../lib/web';
import { color, font } from '../theme/tokens';
import { T } from './ui/T';

// make-icons.mjs: stroke 36, curl 34, tip 46, offset 30, reach 150, drawn around (0, 0), then
// turned 45 degrees and stood on a block of its deep colours (D066).
const S = 36, CURL = 34, TIP = 46, OFF = 30, REACH = 150, TILT = -45, DEPTH = 14;
const VIEW = { x: -150, y: -112, w: 300, h: 232 };
const THEIRS = `M ${-REACH} ${-OFF} H ${OFF - CURL} a ${CURL} ${CURL} 0 0 1 ${CURL} ${CURL} v ${TIP}`;
const MINE = `M ${REACH} ${OFF} H ${-OFF + CURL} a ${CURL} ${CURL} 0 0 1 ${-CURL} ${-CURL} v ${-TIP}`;
const stroke = { fill: 'none', strokeWidth: S, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function Pinkies({ theirs, mine, detail }: { theirs: string; mine: string; detail?: boolean }) {
  return (
    <G rotation={TILT}>
      <Path d={THEIRS} {...stroke} stroke={theirs} />
      <Path d={MINE} {...stroke} stroke={mine} />
      <Line x1={OFF} x2={OFF} y1={6} y2={-OFF + CURL + TIP} stroke={theirs} strokeWidth={S} strokeLinecap="round" />
      {detail && (
        <>
          <Line x1={-REACH + 14} x2={-62} y1={-OFF - 9} y2={-OFF - 9} stroke={color.shine} strokeWidth={7} strokeLinecap="round" />
          <Line x1={60} x2={REACH - 14} y1={OFF - 9} y2={OFF - 9} stroke={color.shine} strokeWidth={7} strokeLinecap="round" />
          <Line x1={OFF} x2={OFF} y1={30} y2={46} stroke={color.shine} strokeWidth={16} strokeLinecap="round" />
          <Line x1={-OFF} x2={-OFF} y1={-30} y2={-46} stroke={color.pinkHalo} strokeWidth={16} strokeLinecap="round" />
        </>
      )}
    </G>
  );
}

/** The pinkies, turned 45 degrees, standing on their own depth like the clay loops. */
export function LogoMark({ height = 24 }: { height?: number }) {
  const width = (height * VIEW.w) / VIEW.h;
  const block = [];
  for (let d = DEPTH; d > 0; d -= 2) {
    block.push(<G key={d} y={d}><Pinkies theirs={color.pinkDeep} mine={color.goldDeep} /></G>);
  }
  return (
    <Svg width={width} height={height} viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}>
      <G y={-DEPTH / 2}>
        {block}
        <Pinkies theirs={color.pink} mine={color.gold} detail />
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
      <LogoMark height={size * 2} />
      {!mark && (
        <T style={{ fontFamily: font.display, fontSize: size, lineHeight: size * 1.2, letterSpacing: -size * 0.03, transform: [{ skewX: '-12deg' }] }} maxFontSizeMultiplier={1} importantForAccessibility="no" accessibilityElementsHidden>
          pinkilock<T style={{ fontFamily: font.display, fontSize: size, lineHeight: size * 1.2 }} c={color.gold}>.</T>
        </T>
      )}
    </View>
  );
}
