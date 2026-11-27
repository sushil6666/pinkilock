/**
 * My face on my card, on Me (D095): add one, see where it is (being checked, on my card, not
 * approved), change it or take it down. The face itself shows in Me's portrait once approved.
 */
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { FACE_WEEK_MS } from '../domain/face';
import type { MyPhoto } from '../domain/types';
import { fmtDate, t } from '../i18n';
import { cameraModule } from '../lib/faceCamera';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { Tag } from './ui/Chip';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

const ROUTE = '/(tabs)/me';

export interface MyFaceState {
  rows: MyPhoto[];
  /** The face on my card now, if a person has approved one. */
  current: MyPhoto | null;
  reload: () => void;
  set: (rows: MyPhoto[]) => void;
  error: string;
  setError: (e: string) => void;
}

/** My face rows, asked again each time Me is opened (a person may have checked it since). */
export function useMyFace(): MyFaceState {
  const [rows, set] = useState<MyPhoto[]>([]);
  const [error, setError] = useState('');
  const reload = useCallback(() => {
    backend.myFace().then(set, (e) => setError(shown(e, ROUTE)));
  }, []);
  useFocusEffect(useCallback(() => {
    reload();
    // Once more a little later: the demo's stand-in moderator answers in seconds.
    const again = setTimeout(reload, 4000);
    return () => clearTimeout(again);
  }, [reload]));
  return { rows, current: rows.find((r) => r.status === 'approved' && r.url) ?? null, reload, set, error, setError };
}

export function MyFace({ face }: { face: MyFaceState }) {
  const [busy, setBusy] = useState(false);
  const pending = face.rows.find((r) => r.status === 'pending');
  const held = !pending && face.rows.length > 0 && face.rows[face.rows.length - 1].status === 'held';
  const can = cameraModule() !== null;
  // A week after the newest face was sent (the server's rule, src/domain/face.ts); the server
  // still decides, this only spares a photo that would be refused.
  const newest = face.rows.reduce((a, r) => Math.max(a, r.at ?? 0), 0);
  const nextAt = newest ? newest + FACE_WEEK_MS : 0;
  const waitWeek = !held && nextAt > Date.now();

  const open = () => {
    face.setError('');
    if (!can) face.setError(t('face.needsUpdate'));
    else router.push('/face');
  };
  const takeDown = async () => {
    if (!face.current) return;
    face.setError('');
    setBusy(true);
    try {
      face.set(await backend.removeFace(face.current.id));
    } catch (e) {
      face.setError(shown(e, ROUTE));
    } finally {
      setBusy(false);
    }
  };

  if (!face.current && !pending) {
    return (
      <View style={{ gap: space.sm, marginBottom: space.xl }}>
        <Pressable onPress={open} style={styles.add} accessibilityRole="button" accessibilityLabel={t('face.add')}>
          <View style={styles.icon}><Feather name="camera" size={18} color={color.onPink} /></View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="bodyBold" c={color.pink}>{t('face.add')}</T>
            {held ? <T v="caption" c={color.flare}>{t('face.state.held')}</T> : null}
          </View>
          <Feather name="chevron-right" size={18} color={color.pink} />
        </Pressable>
        <ErrorText text={face.error} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm, marginBottom: space.xl }}>
      {face.current ? (
        <View style={styles.line}>
          <Feather name="check" size={14} color={color.gold} />
          <T v="caption" c={color.gold}>{t('face.state.approved')}</T>
        </View>
      ) : null}
      {pending ? (
        <View style={{ gap: 2 }}>
          <View style={styles.line}>
            <Feather name="clock" size={14} color={color.text} />
            <T v="caption">{t('face.state.pending')}</T>
          </View>
          <T v="caption" c={color.textDim}>{t('face.pendingBody')}</T>
        </View>
      ) : (
        <T v="caption" c={color.textDim}>{waitWeek ? t('face.changeOn', { date: fmtDate(nextAt) }) : t('face.approvedBody')}</T>
      )}
      <View style={styles.line}>
        {pending || waitWeek ? null : <Tag label={t('face.change')} tone={color.pink} onPress={open} />}
        {face.current ? <Tag label={t('face.takeDown')} tone={color.textDim} onPress={busy ? () => undefined : takeDown} /> : null}
      </View>
      <ErrorText text={face.error} />
    </View>
  );
}

const styles = StyleSheet.create({
  add: {
    flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md,
    borderRadius: radius.card, borderWidth: 1.5, borderStyle: 'dashed', borderColor: color.pink,
  },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: color.pink, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
