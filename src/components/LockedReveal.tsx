/**
 * The accountable reveal. Locked: blurred tiles and a masked handle, with the line that says what
 * opens them. Open: the handle and the photos. The locked state holds no real data at all; the
 * server only returns it for a kept promise (ARCHITECTURE.md section 5).
 */
import { Feather } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as ScreenCapture from 'expo-screen-capture';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import type { Profile, Reveal } from '../domain/types';
import { quiet } from '../lib/log';
import { color, radius, space } from '../theme/tokens';
import { T } from './ui/T';
import { Button } from './ui/Button';
import { ErrorText } from './ui/ErrorText';
import { VerifiedTick } from './ContactCheck';
import { shown } from '../lib/report';
import { t } from '../i18n';

interface Props {
  person: Profile;
  reveal: Reveal | null;
  hint: string;
  /**
   * After a kept plan, within a week: "Handle did not work?" (D077). The screen passes the call
   * that flags it; the server decides whether it may.
   */
  onFlag?: () => Promise<void>;
}

export function LockedReveal({ person, reveal, hint, onFlag }: Props) {
  const open = !!reveal;
  const [flag, setFlag] = useState<'ask' | 'busy' | 'done' | null>(null);
  const [flagError, setFlagError] = useState('');
  const sendFlag = async () => {
    setFlag('busy');
    setFlagError('');
    try {
      await onFlag?.();
      setFlag('done');
    } catch (e) {
      setFlag('ask');
      setFlagError(shown(e, '/plan'));
    }
  };
  // While a contact is on screen, screenshots and screen recording are blocked on the phone (WP5).
  // A second phone's camera still works; this only stops the easy copy.
  useEffect(() => {
    if (!open || Platform.OS === 'web') return;
    ScreenCapture.preventScreenCaptureAsync('reveal').catch(quiet('reveal.capture'));
    return () => {
      ScreenCapture.allowScreenCaptureAsync('reveal').catch(quiet('reveal.capture'));
    };
  }, [open]);
  const tiles = open ? reveal.photos : Array.from({ length: Math.max(person.photoCount, 2) }, () => null);

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Feather name={open ? 'unlock' : 'lock'} size={14} color={open ? color.gold : color.pink} />
        <T v="label" c={open ? color.gold : color.pink}>{t(open ? 'reveal.unlocked' : 'reveal.locked')}</T>
      </View>

      <View style={styles.contact} accessible accessibilityLabel={open ? t('reveal.contactSpoken', { kind: reveal.contactKind, handle: reveal.contactHandle }) : t('reveal.contactLocked', { hint })}>
        <Feather name="at-sign" size={18} color={open ? color.gold : color.textMute} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <T v="label" c={color.textMute}>{open ? reveal.contactKind : t('reveal.contact')}</T>
            {open && reveal.contactVerified ? <VerifiedTick small /> : null}
          </View>
          {open ? (
            <Animated.View entering={FadeIn.duration(500)}><T v="heading" selectable>{reveal.contactHandle}</T></Animated.View>
          ) : (
            <View style={styles.maskRow}>{[38, 22, 54, 30].map((w, i) => <View key={i} style={[styles.mask, { width: w }]} />)}</View>
          )}
        </View>
      </View>

      <View style={styles.grid}>
        {tiles.map((photo, i) => (
          <View key={i} style={styles.tile} accessible accessibilityRole="image" accessibilityLabel={photo ? photo.caption : t('reveal.lockedPhoto')}>
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
                <View style={[StyleSheet.absoluteFill, styles.scrim, Platform.OS !== 'ios' && { backgroundColor: 'rgba(20,14,60,0.78)' }]}>
                  <Feather name="lock" size={20} color={color.text} />
                </View>
              </>
            )}
          </View>
        ))}
      </View>

      {!open && <T v="caption" c={color.textDim}>{hint}</T>}
      {/* A verified handle was proved from that account, so it cannot be flagged (D079). */}
      {open && onFlag && !reveal.contactVerified && (
        flag === 'done' ? <T v="caption" c={color.textDim}>{t('contact.flagged')}</T>
        : flag ? (
          <View style={{ gap: space.sm }}>
            <T v="caption" c={color.textDim}>{t('contact.flagConfirm', { name: person.name })}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Button kind="danger" icon="flag" label={t('contact.flagYes')} busy={flag === 'busy'} onPress={sendFlag} />
              <Button kind="quiet" label={t('common.cancel')} onPress={() => setFlag(null)} />
            </View>
            {flagError ? <ErrorText text={flagError} /> : null}
          </View>
        ) : (
          <Button kind="quiet" label={t('contact.didntWork')} onPress={() => setFlag('ask')} style={{ alignSelf: 'flex-start' }} />
        )
      )}
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
  caption: { position: 'absolute', left: space.sm, right: space.sm, bottom: space.sm, backgroundColor: 'rgba(20,14,60,0.72)', borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 3, overflow: 'hidden' },
  scrim: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(20,14,60,0.35)' },
});
