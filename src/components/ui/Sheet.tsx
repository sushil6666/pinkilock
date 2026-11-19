/**
 * Bottom sheet for confirmations. The app has no system alerts; anything that needs a second thought comes up here.
 * On desktop it is a dialog in the middle of the window instead, since a sheet at the foot of a wide window is easy to miss.
 */
import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDesktop } from '../../lib/desktop';
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
  const desk = useDesktop();
  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View entering={FadeIn.duration(motion.base)} style={[styles.scrim, desk && styles.scrimDesk]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={t('common.close')} accessibilityRole="button" />
        <Animated.View
          entering={(desk ? FadeInDown : SlideInDown).duration(280).easing(motion.ease)}
          style={[styles.sheet, elevation('raised'), desk ? styles.dialog : { paddingBottom: Math.max(insets.bottom, space.lg) + space.sm }]}
          accessibilityViewIsModal
        >
          {desk ? null : <View style={styles.grip} />}
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
  scrimDesk: { justifyContent: 'center', padding: space.xl },
  dialog: { maxWidth: 480, borderRadius: radius.sheet, borderBottomWidth: 1, paddingTop: space.xl, paddingBottom: space.xl },
  grip: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: color.line, marginBottom: space.md },
});
