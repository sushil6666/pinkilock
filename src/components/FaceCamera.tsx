/**
 * Taking the face for my card (D095): the front camera with an oval to fit into, then the shot to
 * keep or retake, with the line that says who will see it. Sending it is the consent: the server
 * records it with the photo. Nothing is picked from the gallery.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { Image, Linking, Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { PickedPhoto } from '../domain/types';
import { t } from '../i18n';
import { cameraModule } from '../lib/faceCamera';
import { quiet } from '../lib/log';
import { toJpeg } from '../lib/photoPick';
import { shown } from '../lib/report';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { Button } from './ui/Button';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

const ROUTE = '/face';

export function FaceCamera() {
  const cam = cameraModule();
  if (!cam) return <T v="body" c={color.textDim}>{t('face.needsUpdate')}</T>;
  return <Camera cam={cam} />;
}

function Camera({ cam }: { cam: NonNullable<ReturnType<typeof cameraModule>> }) {
  const { CameraView, useCameraPermissions } = cam;
  const [permission, ask] = useCameraPermissions();
  const ref = useRef<ComponentRef<typeof CameraView>>(null);
  const [ready, setReady] = useState(false);
  const [shot, setShot] = useState<PickedPhoto | null>(null);
  const [busy, setBusy] = useState<'take' | 'send' | null>(null);
  const [error, setError] = useState('');

  const take = async () => {
    if (!ref.current) return;
    setError('');
    setBusy('take');
    try {
      const pic = await ref.current.takePictureAsync({ quality: 0.9, exif: false, shutterSound: false });
      setShot(pic ? await toJpeg(pic.uri, pic.width, pic.height) : null);
    } catch (e) {
      setError(shown(e, ROUTE));
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!shot) return;
    setError('');
    setBusy('send');
    try {
      await backend.addFace(shot);
      router.back();
    } catch (e) {
      setError(shown(e, ROUTE));
      setBusy(null);
    }
  };

  if (!permission) return null;
  if (!permission.granted) {
    const blocked = !permission.canAskAgain && Platform.OS !== 'web';
    return (
      <View style={{ gap: space.lg }}>
        <T v="body" c={color.textDim}>{t(blocked ? 'face.denied' : 'face.allowBody')}</T>
        <Button label={t(blocked ? 'face.settings' : 'face.allow')} icon="camera"
          onPress={() => (blocked ? Linking.openSettings().catch(quiet('face.settings')) : ask().catch(quiet('face.ask')))} />
      </View>
    );
  }

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.frame}>
        {shot ? (
          <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} resizeMode="cover"
            accessible accessibilityRole="image" accessibilityLabel={t('face.previewLabel')} />
        ) : (
          <>
            <CameraView ref={ref} facing="front" mode="picture" style={StyleSheet.absoluteFill}
              onCameraReady={() => setReady(true)} onMountError={() => setError(t('face.noCamera'))}
              accessibilityLabel={t('face.cameraLabel')} />
            <Oval />
          </>
        )}
      </View>
      <T v="caption" c={color.textDim}>{t(shot ? 'face.consent' : 'face.guide')}</T>
      <ErrorText text={error} />
      {shot ? (
        <View style={{ gap: space.sm }}>
          <Button label={t(busy === 'send' ? 'face.sending' : 'face.use')} icon="check" busy={busy === 'send'} disabled={!!busy} onPress={send} />
          <Button label={t('face.retake')} kind="ghost" icon="rotate-ccw" disabled={!!busy} onPress={() => setShot(null)} />
        </View>
      ) : (
        <Button label={t('face.take')} icon="camera" busy={busy === 'take'} disabled={!ready || !!busy} onPress={take} />
      )}
    </View>
  );
}

/** The oval to fit a face into, with the rest of the frame dimmed. Drawn at 3:4 like the frame. */
function Oval() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 300 400" preserveAspectRatio="none">
        <Path fillRule="evenodd" fill={color.scrim}
          d="M0 0H300V400H0Z M150 62 C 214 62 246 118 246 190 C 246 266 204 330 150 330 C 96 330 54 266 54 190 C 54 118 86 62 150 62 Z" />
        <Path fill="none" stroke={color.pink} strokeWidth={2.5} strokeDasharray="10 8"
          d="M150 62 C 214 62 246 118 246 190 C 246 266 204 330 150 330 C 96 330 54 266 54 190 C 54 118 86 62 150 62 Z" />
      </Svg>
      <View style={styles.hint}>
        <Feather name="smile" size={14} color={color.text} />
        <T v="caption">{t('face.fit')}</T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4, borderRadius: radius.card, overflow: 'hidden', backgroundColor: color.surface },
  hint: {
    position: 'absolute', bottom: space.md, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.xs,
    backgroundColor: color.onPhoto, borderRadius: radius.chip, paddingHorizontal: space.sm, paddingVertical: 4,
  },
});
