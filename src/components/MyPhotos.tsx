/**
 * My photos behind the lock, on Me (ROADMAP Phase 4, D087). Up to three. Each is checked by a
 * person before anyone sees it, and then shown only to someone I kept a promise with, as my
 * handle is. The state of each one is mine to see: being checked, approved, or not approved.
 */
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import type { MyPhoto } from '../domain/types';
import { t } from '../i18n';
import { quiet } from '../lib/log';
import { photoPickAvailable, pickPhoto } from '../lib/photoPick';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

const MAX = 3;
const ROUTE = '/(tabs)/me';

export function MyPhotos() {
  const [photos, setPhotos] = useState<MyPhoto[]>([]);
  const [can, setCan] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    photoPickAvailable().then(setCan, quiet('photos.available'));
  }, []);
  // Asked again each time Me is opened: a person may have checked one since.
  useFocusEffect(useCallback(() => {
    backend.myPhotos().then(setPhotos, (e) => setError(shown(e, ROUTE)));
  }, []));

  const add = async () => {
    setError('');
    try {
      const picked = await pickPhoto();
      if (!picked) return;
      setBusy('add');
      setPhotos(await backend.addPhoto(picked));
    } catch (e) {
      setError(shown(e, ROUTE));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setError('');
    setBusy(id);
    try {
      setPhotos(await backend.removePhoto(id));
    } catch (e) {
      setError(shown(e, ROUTE));
    } finally {
      setBusy(null);
    }
  };

  const slots = Array.from({ length: MAX }, (_, i) => photos[i] ?? null);
  const firstEmpty = photos.length;

  return (
    <View style={{ gap: space.sm, marginTop: space.xl }}>
      <T v="label" c={color.textMute}>{t('photos.title')}</T>
      <View style={styles.row}>
        {slots.map((photo, i) =>
          photo ? (
            <View key={photo.id} style={styles.tile} accessible accessibilityRole="image" accessibilityLabel={t(`photos.state.${photo.status}`)}>
              {photo.url ? <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : null}
              <View style={styles.state}>
                <Feather name={photo.status === 'approved' ? 'check' : photo.status === 'held' ? 'x' : 'clock'} size={11}
                  color={photo.status === 'approved' ? color.gold : photo.status === 'held' ? color.flare : color.text} />
                <T v="caption" style={styles.stateText} numberOfLines={2}>{t(`photos.state.${photo.status}`)}</T>
              </View>
              <Pressable onPress={() => remove(photo.id)} disabled={!!busy} hitSlop={8} style={styles.remove}
                accessibilityRole="button" accessibilityLabel={t('photos.remove')}>
                <Feather name={busy === photo.id ? 'loader' : 'trash-2'} size={14} color={color.text} />
              </Pressable>
            </View>
          ) : can && i === firstEmpty ? (
            <Pressable key={`add-${i}`} onPress={add} disabled={!!busy} style={[styles.tile, styles.add]}
              accessibilityRole="button" accessibilityLabel={t('photos.add')}>
              <Feather name={busy === 'add' ? 'loader' : 'plus'} size={22} color={color.pink} />
              <T v="caption" c={color.pink}>{t(busy === 'add' ? 'photos.adding' : 'photos.add')}</T>
            </Pressable>
          ) : (
            <View key={`empty-${i}`} style={[styles.tile, styles.empty]} />
          ),
        )}
      </View>
      <T v="caption" c={color.textDim}>{t(can ? 'photos.body' : 'photos.needsUpdate')}</T>
      <ErrorText text={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm },
  tile: { flex: 1, aspectRatio: 3 / 4, borderRadius: radius.card, overflow: 'hidden', backgroundColor: color.surface },
  add: { alignItems: 'center', justifyContent: 'center', gap: space.xs, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.pink, backgroundColor: 'transparent' },
  empty: { borderWidth: 1, borderColor: color.line, backgroundColor: 'transparent' },
  state: {
    position: 'absolute', left: space.xs, right: space.xs, bottom: space.xs, flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: color.onPhoto, borderRadius: radius.chip, paddingHorizontal: 6, paddingVertical: 3,
  },
  stateText: { flexShrink: 1 },
  remove: {
    position: 'absolute', top: space.xs, right: space.xs, width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', backgroundColor: color.onPhoto,
  },
});
