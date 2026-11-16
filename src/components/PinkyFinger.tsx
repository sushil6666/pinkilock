/**
 * The two pinkies, as thick SVG strokes drawn in their LOCKED pose (DESIGN_SYSTEM.md section 6).
 * PinkyLock moves each layer with transforms only, so nothing here re-renders during the gesture.
 *
 * Theirs comes from the left and curls down; mine comes from the right and curls up. `TheirTip`
 * is drawn again above mine so the two strokes pass over and under like a real link.
 */
import Svg, { Line, Path } from 'react-native-svg';
import { color } from '../theme/tokens';

export const FINGER = { stroke: 36, curl: 34, tip: 46, offset: 30, gap: 72, stageH: 340 } as const;
const { stroke, curl, tip, offset } = FINGER;

interface Props {
  w: number;
  cx: number;
  cy: number;
}

const theirPath = (w: number, cx: number, cy: number) =>
  `M ${-w} ${cy - offset} H ${cx + offset - curl} a ${curl} ${curl} 0 0 1 ${curl} ${curl} v ${tip}`;
const myPath = (w: number, cx: number, cy: number) =>
  `M ${2 * w} ${cy + offset} H ${cx - offset + curl} a ${curl} ${curl} 0 0 1 ${-curl} ${-curl} v ${-tip}`;

const common = { fill: 'none', strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export function TheirPinky({ w, cx, cy, slot }: Props & { slot?: boolean }) {
  if (slot) {
    return (
      <Svg width={w} height={FINGER.stageH} pointerEvents="none">
        <Path d={theirPath(w, cx, cy)} {...common} stroke={color.surfaceHi} />
        <Path d={theirPath(w, cx, cy)} fill="none" stroke={color.line} strokeWidth={2} strokeDasharray="6 8" strokeLinecap="round" />
      </Svg>
    );
  }
  return (
    <Svg width={w} height={FINGER.stageH} pointerEvents="none">
      <Path d={theirPath(w, cx, cy)} {...common} stroke={color.pink} />
      <Line x1={cx - 62} x2={cx - 62} y1={cy - offset - 9} y2={cy - offset + 9} stroke={color.pinkDeep} strokeWidth={3} strokeLinecap="round" />
      <Line x1={cx - 74} x2={cx - 74} y1={cy - offset - 9} y2={cy - offset + 9} stroke={color.pinkDeep} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}

/** The last stretch of their pinky, redrawn on top of mine, with the nail. */
export function TheirTip({ w, cx, cy }: Props) {
  const x = cx + offset;
  return (
    <Svg width={w} height={FINGER.stageH} pointerEvents="none">
      <Line x1={x} x2={x} y1={cy + 6} y2={cy - offset + curl + tip} stroke={color.pink} strokeWidth={stroke} strokeLinecap="round" />
      <Line x1={x} x2={x} y1={cy + 30} y2={cy + 46} stroke="rgba(255,255,255,0.42)" strokeWidth={16} strokeLinecap="round" />
    </Svg>
  );
}

export function MyPinky({ w, cx, cy }: Props) {
  const x = cx - offset;
  return (
    <Svg width={w} height={FINGER.stageH} pointerEvents="none">
      <Path d={myPath(w, cx, cy)} {...common} stroke={color.text} />
      <Line x1={x} x2={x} y1={cy - 30} y2={cy - 46} stroke="rgba(255,46,147,0.38)" strokeWidth={16} strokeLinecap="round" />
      <Line x1={cx + 62} x2={cx + 62} y1={cy + offset - 9} y2={cy + offset + 9} stroke={color.textDim} strokeWidth={3} strokeLinecap="round" />
      <Line x1={cx + 74} x2={cx + 74} y1={cy + offset - 9} y2={cy + offset + 9} stroke={color.textDim} strokeWidth={3} strokeLinecap="round" />
    </Svg>
  );
}
