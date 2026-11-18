/** Bottom sheet for confirmations. The app has no system alerts; anything that needs a second thought comes up here. */
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { elevation } from '../../theme/elevation';
import { color, gutter, motion, radius, space } from '../../theme/tokens';
import { column } from './Screen';
import { T } from './T';
import { t } from '../../i18n';

interface Props {
  visible: boolean;
  onClose: () => void;
  eyebrow?: string;
  title: string;
  body?: string;
  children: ReactNode;
}

export function Sheet({ visible, onClose, eyebrow, title, body, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(motion.base)} style={styles.scrim}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} accessibilityRole="button" />
        <Animated.View
          entering={SlideInDown.duration(280).easing(motion.ease)}
          style={[styles.sheet, elevation('raised'), { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}
          accessibilityViewIsModal
        >
          <View style={styles.grip} />
          {eyebrow ? <T v="label" c={color.pink}>{eyebrow}</T> : null}
          <T v="title">{title}</T>
          {body ? <T c={color.textDim}>{body}</T> : null}
          <View style={{ gap: space.md, marginTop: space.sm }}>{children}</View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: color.scrim, justifyContent: 'flex-end' },
  sheet: { ...column, backgroundColor: color.surface, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet, borderWidth: 1, borderBottomWidth: 0, borderColor: color.line, paddingHorizontal: gutter, paddingTop: space.md, gap: space.sm },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.line, marginBottom: space.md },
});
