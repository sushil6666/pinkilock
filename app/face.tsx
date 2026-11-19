/** Taking the face for my card (D095). The screen is src/components/FaceCamera.tsx. */
import { FaceCamera } from '@/components/FaceCamera';
import { Screen } from '@/components/ui/Screen';
import { t } from '@/i18n';

export default function Face() {
  return (
    <Screen back="close" title={t('face.title')}>
      <FaceCamera />
    </Screen>
  );
}
