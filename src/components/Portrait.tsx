/**
 * A person, drawn: two-colour gradient, a big glyph, an oversized initial. The prototype ships no
 * photographs of real people, and the block style suits the editorial look better than stock faces.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { color, font, radius } from '../theme/tokens';
import { T } from './ui/T';

interface Props {
  name: string;
  palette: [string, string];
  glyph: string;
  size?: number;
  /** Fill the parent instead of being a square avatar. */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Portrait({ name, palette, glyph, size = 56, fill, style }: Props) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  if (fill) {
    return (
      <View style={[styles.fill, style]} accessible accessibilityRole="image" accessibilityLabel={`${name}'s card`}>
        <LinearGradient colors={palette} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <T style={styles.bigInitial} c="rgba(10,10,12,0.22)" maxFontSizeMultiplier={1}>{initial}</T>
        <T style={styles.bigGlyph} maxFontSizeMultiplier={1}>{glyph}</T>
        <LinearGradient colors={['transparent', 'rgba(10,10,12,0.92)']} style={styles.fade} />
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
