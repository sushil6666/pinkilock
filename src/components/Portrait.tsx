/**
 * A person, drawn: two-colour gradient, a big glyph, an oversized initial. The prototype ships no
 * photographs of real people, and the block style suits the editorial look better than stock faces.
 *
 * With `faceUrl` (D095), their checked face takes the drawing's place. A link that does not load
 * (expired, or taken down since) falls back to the drawing.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, font, radius } from '../theme/tokens';
import { T } from './ui/T';
import { t } from '../i18n';

interface Props {
  name: string;
  palette: [string, string];
  glyph: string;
  size?: number;
  /** Fill the parent instead of being a square avatar. */
  fill?: boolean;
  /** Their face, when they have one that this person may see. */
  faceUrl?: string | null;
  style?: StyleProp<ViewStyle>;
}

export function Portrait({ name, palette, glyph, size = 56, fill, faceUrl, style }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const [broken, setBroken] = useState<string | null>(null);
  const face = faceUrl && faceUrl !== broken ? faceUrl : null;
  if (face && fill) {
    return (
      <View style={[styles.fill, style]} accessible accessibilityRole="image" accessibilityLabel={t('common.cardOf', { name })}>
        <Image source={{ uri: face }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setBroken(face)} />
        <LinearGradient colors={['transparent', color.onPhoto]} style={styles.fade} />
      </View>
    );
  }
  if (face) {
    return (
      <View style={[{ width: size, height: size, borderRadius: radius.card, overflow: 'hidden', backgroundColor: color.surface }, style]} accessible accessibilityRole="image" accessibilityLabel={name}>
        <Image source={{ uri: face }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={() => setBroken(face)} />
      </View>
    );
  }
  if (fill) {
    return (
      <View style={[styles.fill, style]} accessible accessibilityRole="image" accessibilityLabel={t('common.cardOf', { name })}>
        <LinearGradient colors={palette} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <T style={styles.bigInitial} c="rgba(20,14,60,0.22)" maxFontSizeMultiplier={1}>{initial}</T>
        <T style={styles.bigGlyph} maxFontSizeMultiplier={1}>{glyph}</T>
        <LinearGradient colors={['transparent', 'rgba(20,14,60,0.92)']} style={styles.fade} />
      </View>
    );
  }
  return (
    <View style={[{ width: size, height: size, borderRadius: radius.card, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }, style]} accessible accessibilityRole="image" accessibilityLabel={name}>
      <LinearGradient colors={palette} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <T maxFontSizeMultiplier={1} style={{ fontFamily: font.display, fontSize: size * 0.46, lineHeight: size * 0.6 }} c={color.bg}>{initial}</T>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { overflow: 'hidden', backgroundColor: color.surface },
  bigInitial: { position: 'absolute', right: -12, top: -44, fontFamily: font.display, fontSize: 300, lineHeight: 320 },
  bigGlyph: { position: 'absolute', left: 20, top: 20, fontSize: 44, lineHeight: 54 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
});
