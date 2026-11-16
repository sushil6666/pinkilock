/**
 * The accountable reveal. Locked: blurred tiles and a masked handle, with the line that says what
 * opens them. Open: the handle and the photos. The locked state holds no real data at all; the
 * server only returns it for a kept promise (ARCHITECTURE.md section 5).
 */
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Profile, Reveal } from '../domain/types';
import { color, radius, space } from '../theme/tokens';
import { T } from './ui/T';

interface Props {
  person: Profile;
  reveal: Reveal | null;
  hint: string;
}

export function LockedReveal({ person, reveal, hint }: Props) {
  const open = !!reveal;
  const tiles = open ? reveal.photos : Array.from({ length: Math.max(person.photoCount, 2) }, () => null);

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Feather name={open ? 'unlock' : 'lock'} size={14} color={open ? color.volt : color.pink} />
        <T v="label" c={open ? color.volt : color.pink}>{open ? 'Unlocked: you both showed' : 'Locked'}</T>
      </View>

      <View style={styles.contact} accessible accessibilityLabel={open ? `${reveal.contactKind}: ${reveal.contactHandle}` : `Contact locked. ${hint}`}>
        <Feather name="at-sign" size={18} color={open ? color.volt : color.textMute} />
        <View style={{ flex: 1 }}>
          <T v="label" c={color.textMute}>{open ? reveal.contactKind : 'Contact'}</T>
          {open ? (
            <Animated.View entering={FadeIn.duration(500)}><T v="heading" selectable>{reveal.contactHandle}</T></Animated.View>
          ) : (
            <View style={styles.maskRow}>{[38, 22, 54, 30].map((w, i) => <View key={i} style={[styles.mask, { width: w }]} />)}</View>
          )}
        </View>
      </View>

      <View style={styles.grid}>
        {tiles.map((photo, i) => (
          <View key={i} style={styles.tile} accessible accessibilityRole="image" accessibilityLabel={photo ? photo.caption : 'Locked photo'}>
            <LinearGradient colors={photo ? photo.palette : (i % 2 ? [person.palette[1], person.palette[0]] : person.palette)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {photo ? (
              <Animated.View entering={FadeIn.delay(i * 120).duration(500)} style={styles.tileOpen}>
                <T style={{ fontSize: 40, lineHeight: 50 }} maxFontSizeMultiplier={1}>{photo.glyph}</T>
                <T v="caption" style={styles.caption}>{photo.caption}</T>
              </Animated.View>
            ) : (
              <>
                {/* Android's blur is costly and uneven across devices, so it gets a dense scrim instead. */}
                {Platform.OS === 'ios' ? <BlurView intensity={70} tint="dark" style={StyleSheet.absoluteFill} /> : null}
                <View style={[StyleSheet.absoluteFill, styles.scrim, Platform.OS !== 'ios' && { backgroundColor: 'rgba(10,10,12,0.78)' }]}>
                  <Feather name="lock" size={20} color={color.text} />
                </View>
              </>
            )}
          </View>
        ))}
      </View>

      {!open && <T v="caption" c={color.textDim}>{hint}</T>}
    </View>
  );
}

const styles = StyleSheet.create({
  contact: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg },
  maskRow: { flexDirection: 'row', gap: 6, height: 26, alignItems: 'center' },
  mask: { height: 12, borderRadius: 3, backgroundColor: color.line },
  grid: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, aspectRatio: 3 / 4, borderRadius: radius.card, overflow: 'hidden', backgroundColor: color.surface },
  tileOpen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.sm },
  caption: { position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm, backgroundColor: 'rgba(10,10,12,0.72)', borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden' },
  scrim: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,10,12,0.35)' },
});
