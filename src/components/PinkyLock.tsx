/**
 * The Pinkilock gesture: slide your pinky in until it hooks theirs.
 * The exact numbers (travel, thresholds, springs, haptics, timings) are DESIGN_SYSTEM.md section 6;
 * change them there first.
 *
 * Two rules shape the code:
 *  1. The lock is only drawn once the backend says `locked`. Committing my pinky calls
 *     `onCommit`; the hook animation waits for the `locked` prop.
 *  2. The pan area is inset 32 px from both screen edges so it never competes with Android's
 *     edge-swipe back gesture or iOS's back swipe, and it only claims horizontal drags.
 *
 * The stage is as wide as whatever holds it (the screen on a phone, the centred column in a wide
 * browser window) and clips what it draws, so a pinky waiting off stage never widens the page.
 * In a browser it also takes the keyboard: arrow keys slide the pinky a quarter at a time, and
 * Enter or Space locks.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing, cancelAnimation, interpolate, runOnJS, useAnimatedReaction, useAnimatedStyle, useReducedMotion, useSharedValue,
  withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { haptic } from '../lib/haptics';
import { focusRing, isWeb, webOnly } from '../lib/web';
import { color, motion } from '../theme/tokens';
import { FINGER, MyPinky, TheirPinky, TheirTip } from './PinkyFinger';
import { t } from '../i18n';

export type LockPhase = 'idle' | 'committed' | 'sealing' | 'sealed';

interface Props {
  /** 'seal': their pinky is already out. 'first': I go first and theirs arrives after. */
  mode: 'first' | 'seal';
  /** My pinky is already in (I came back to a half-locked invite). */
  startCommitted?: boolean;
  /** The backend has confirmed both pinkies. */
  locked: boolean;
  /** Bump to spring my pinky back out after a failed commit. */
  resetKey: number;
  /** Bump to commit without the drag (the visible "Lock without sliding" button). */
  commitKey: number;
  onCommit: () => void;
  onPhase: (p: LockPhase) => void;
  onMiss: () => void;
}

const EDGE_INSET = 32;
const REST = 0.08;
const COMMIT_AT = 0.82;
const MY_TRAVEL = 0.36;
/** Their tip ends 48 px right of centre, so parking it off-screen takes half the width plus this. */
const THEIR_CLEARANCE = 96;
/** Keyboard: four presses of an arrow key take the pinky from rest to locked. */
const KEY_STEPS = 4;

export function PinkyLock({ mode, startCommitted, locked, resetKey, commitKey, onCommit, onPhase, onMiss }: Props) {
  // The window's width until the stage has been laid out, then its own.
  const { width: windowW } = useWindowDimensions();
  const [stageW, setStageW] = useState(0);
  const w = stageW || windowW;
  const onLayout = useCallback((e: LayoutChangeEvent) => setStageW(Math.round(e.nativeEvent.layout.width)), []);
  const reduced = useReducedMotion();
  const [keyStep, setKeyStep] = useState(0);
  const cx = w / 2;
  const cy = FINGER.stageH / 2;

  const [phase, setPhaseState] = useState<LockPhase>(startCommitted ? 'committed' : 'idle');
  const phaseRef = useRef(phase);
  const setPhase = useCallback((p: LockPhase) => {
    phaseRef.current = p;
    setPhaseState(p);
    onPhase(p);
  }, [onPhase]);

  const mine = useSharedValue(startCommitted ? 1 : REST);
  const theirs = useSharedValue(mode === 'seal' ? 1 : 0);
  const hook = useSharedValue(0);
  const burst = useSharedValue(0);
  const flash = useSharedValue(0);
  const shake = useSharedValue(0);
  const bob = useSharedValue(0);
  const nudge = useSharedValue(0);
  const pulse = useSharedValue(1);
  const start = useSharedValue(REST);
  const active = useSharedValue(!startCommitted);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    // Their waiting pinky breathes; mine nudges until first touched. Neither with reduced motion.
    if (!reduced) bob.value = withRepeat(withTiming(1, { duration: 800, easing: Easing.inOut(Easing.sin) }), -1, true);
    if (!startCommitted && !reduced) nudge.value = withRepeat(withSequence(withDelay(1600, withTiming(1, { duration: 400 })), withTiming(0, { duration: 400 })), -1);
    return () => {
      timers.current.forEach(clearTimeout);
      [bob, nudge, pulse].forEach(cancelAnimation);
    };
  }, [bob, nudge, pulse, startCommitted, reduced]);

  const commit = useCallback(() => {
    if (phaseRef.current !== 'idle') return;
    active.value = false;
    cancelAnimation(nudge);
    nudge.value = 0;
    mine.value = withSpring(1, motion.spring.snappy);
    haptic.medium();
    setPhase('committed');
    onCommit();
  }, [active, mine, nudge, onCommit, setPhase]);

  const miss = useCallback(() => {
    haptic.light();
    onMiss();
  }, [onMiss]);

  useEffect(() => {
    if (commitKey > 0) commit();
  }, [commitKey, commit]);

  // A failed commit (network, expired): let my pinky go back out and accept input again.
  useEffect(() => {
    if (resetKey === 0) return;
    mine.value = withSpring(REST, motion.spring.back);
    active.value = true;
    setKeyStep(0);
    setPhase('idle');
  }, [resetKey, mine, active, setPhase]);

  // Browser only: the stage is focusable and the arrow keys do what a drag does.
  const onKeyDown = useCallback((e: { key: string; preventDefault: () => void }) => {
    if (phaseRef.current !== 'idle') return;
    const dir = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowRight' || e.key === 'ArrowDown' ? -1 : 0;
    const lock = e.key === 'Enter' || e.key === ' ' || e.key === 'End';
    if (!dir && !lock) return;
    e.preventDefault();
    const next = lock ? KEY_STEPS : Math.min(KEY_STEPS, Math.max(0, keyStep + dir));
    if (next === KEY_STEPS) return commit();
    setKeyStep(next);
    cancelAnimation(nudge);
    nudge.value = 0;
    mine.value = withTiming(REST + (next / KEY_STEPS) * (1 - REST), { duration: 120 });
  }, [keyStep, commit, mine, nudge]);

  // Waiting for them: my committed pinky pulses.
  useEffect(() => {
    if (phase === 'committed' && !locked && !reduced) pulse.value = withRepeat(withTiming(1.04, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 120 });
    }
  }, [phase, locked, pulse, reduced]);

  // Both pinkies confirmed: bring theirs in if needed, hook, tug, burst.
  useEffect(() => {
    if (phase !== 'committed' || !locked) return;
    setPhase('sealing');
    const later = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    const arrive = mode === 'first' ? 620 : 180;
    if (mode === 'first') {
      theirs.value = withTiming(1, { duration: 620, easing: motion.ease });
      later(620, haptic.light);
    }
    later(arrive, () => {
      haptic.heavy();
      hook.value = reduced ? withTiming(1, { duration: 200 }) : withSpring(1, motion.spring.lock);
    });
    later(arrive + 140, () => {
      haptic.success();
      if (reduced) return;
      shake.value = withSequence(withTiming(-7, { duration: 80 }), withTiming(6, { duration: 80 }), withTiming(-3, { duration: 80 }), withTiming(0, { duration: 80 }));
      burst.value = withTiming(1, { duration: 700, easing: Easing.out(Easing.quad) });
      flash.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 160 }));
    });
    later(arrive + 520, () => setPhase('sealed'));
  }, [phase, locked, mode, reduced, theirs, hook, shake, burst, flash, setPhase]);

  useAnimatedReaction(
    () => (active.value ? Math.floor(mine.value * 4) : -1),
    (step, prev) => {
      if (prev !== null && prev >= 0 && step > prev && step < 4) runOnJS(haptic.tick)();
    },
  );

  const pan = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .failOffsetY([-24, 24])
    .onBegin(() => {
      if (!active.value) return;
      cancelAnimation(nudge);
      nudge.value = withTiming(0, { duration: 120 });
      cancelAnimation(mine);
      start.value = mine.value;
    })
    .onUpdate((e) => {
      if (!active.value) return;
      const next = Math.min(1, Math.max(0, start.value - e.translationX / (MY_TRAVEL * w)));
      mine.value = next;
      if (next >= 1) {
        active.value = false;
        runOnJS(commit)();
      }
    })
    .onEnd(() => {
      if (!active.value) return;
      if (mine.value >= COMMIT_AT) {
        active.value = false;
        runOnJS(commit)();
      } else {
        mine.value = withSpring(REST, motion.spring.back);
        runOnJS(miss)();
      }
    });

  const mineStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: (1 - mine.value) * MY_TRAVEL * w - nudge.value * 10 + shake.value },
      { translateY: (1 - hook.value) * FINGER.gap },
      { scale: pulse.value },
    ],
  }));
  const theirStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -(1 - theirs.value) * (cx + THEIR_CLEARANCE) - shake.value },
      { translateY: -(1 - hook.value) * FINGER.gap + (1 - hook.value) * theirs.value * (bob.value - 0.5) * 8 },
    ],
  }));
  const slotStyle = useAnimatedStyle(() => ({ opacity: 1 - theirs.value, transform: [{ translateY: -FINGER.gap }] }));
  const ringStyle = useAnimatedStyle(() => {
    const pull = interpolate(mine.value, [0.75, 1], [0, 1], 'clamp');
    return { transform: [{ scale: 1 + pull * 0.12 }], borderColor: pull > 0.02 || hook.value > 0 ? color.pink : color.line, opacity: 0.5 + pull * 0.5 };
  });
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value === 0 ? 0 : 0.9 * (1 - burst.value), transform: [{ scale: 0.4 + burst.value * 2.2 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const trackStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, interpolate(mine.value, [REST, 1], [0, 1], 'clamp')) }] }));

  const layer = [StyleSheet.absoluteFill, { width: w }];

  return (
    <View
      style={[styles.stage, isWeb && styles.clip, focusRing]}
      onLayout={onLayout}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('pinky.slide')}
      accessibilityHint={t('pinky.slideHint')}
      accessibilityActions={[{ name: 'activate' }, { name: 'increment' }]}
      onAccessibilityAction={commit}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={phase === 'idle' ? Math.round((keyStep / KEY_STEPS) * 100) : 100}
      aria-valuetext={t(phase === 'idle' ? 'pinky.notYet' : phase === 'sealed' ? 'pinky.locked' : 'pinky.yoursIn')}
      {...webOnly({ tabIndex: phase === 'idle' ? 0 : -1, onKeyDown })}
    >
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: color.pinkWash }, flashStyle]} pointerEvents="none" />
      <Animated.View style={[styles.ring, { left: cx - 70, top: cy - 70 }, ringStyle]} pointerEvents="none" />
      <Animated.View style={[styles.ring, styles.burst, { left: cx - 70, top: cy - 70 }, burstStyle]} pointerEvents="none" />

      {mode === 'first' && <Animated.View style={[layer, slotStyle]} pointerEvents="none"><TheirPinky w={w} cx={cx} cy={cy} slot /></Animated.View>}
      <Animated.View style={[layer, theirStyle]} pointerEvents="none"><TheirPinky w={w} cx={cx} cy={cy} /></Animated.View>
      <Animated.View style={[layer, mineStyle]} pointerEvents="none"><MyPinky w={w} cx={cx} cy={cy} /></Animated.View>
      <Animated.View style={[layer, theirStyle]} pointerEvents="none"><TheirTip w={w} cx={cx} cy={cy} /></Animated.View>

      <View style={[styles.track, { left: EDGE_INSET, right: EDGE_INSET }]} pointerEvents="none">
        <Animated.View style={[styles.trackFill, trackStyle]} />
      </View>

      {/* The only touchable part: inset from both edges, above everything. */}
      <GestureDetector gesture={pan}>
        <View style={{ position: 'absolute', top: 0, bottom: 0, left: EDGE_INSET, right: EDGE_INSET }} collapsable={false} />
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { alignSelf: 'stretch', height: FINGER.stageH },
  /** A browser page grows to fit what is drawn past its edge; a phone screen does not. */
  clip: { overflow: 'hidden' },
  ring: { position: 'absolute', width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: color.line },
  burst: { borderColor: color.pink, borderWidth: 6 },
  track: { position: 'absolute', bottom: 6, height: 3, borderRadius: 2, backgroundColor: color.line, overflow: 'hidden' },
  trackFill: { ...StyleSheet.absoluteFill, backgroundColor: color.pink, transformOrigin: 'right center' },
});
