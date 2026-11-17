/**
 * A short clay animation: two pinkies hooking, or a padlock clicking shut. They are GIFs drawn by
 * scripts/make-loops.mjs from a 3D scene, on the page's own `bg`, so they sit on `bg` with no edge.
 * Put them only on `bg`, never on a card.
 *
 * They are decoration: hidden from screen readers, and with reduced motion on they hold still on
 * the moment the lock closes.
 */
import { Image, type StyleProp, type ViewStyle, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { webOnly } from '../lib/web';

const LOOPS = {
  pinkyLock: { moving: require('../../assets/loops/pinky-lock.gif'), still: require('../../assets/loops/pinky-lock.png'), w: 440, h: 330 },
  padlock: { moving: require('../../assets/loops/padlock.gif'), still: require('../../assets/loops/padlock.png'), w: 320, h: 280 },
} as const;

export type LoopName = keyof typeof LOOPS;

/** Fills the width it is given, up to a little over its drawn size, and keeps its shape. */
export function Loop({ name, style }: { name: LoopName; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const loop = LOOPS[name];
  return (
    <View
      style={[{ width: '100%', maxWidth: Math.round(loop.w * 1.2), aspectRatio: loop.w / loop.h, alignSelf: 'center' }, style]}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      {...webOnly({ 'aria-hidden': true })}
    >
      <Image source={reduced ? loop.still : loop.moving} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
    </View>
  );
}
