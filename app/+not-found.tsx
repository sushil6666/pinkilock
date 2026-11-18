/** An address that is not a screen: a mistyped link, or one from an older version. */
import { router } from 'expo-router';
import { View } from 'react-native';
import { Loop } from '@/components/Loop';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { color, space } from '@/theme/tokens';
import { t } from '@/i18n';

export default function NotFound() {
  return (
    <Screen desk="form" scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
        <Loop name="padlock" style={{ maxWidth: 240 }} />
        <T v="display">{t('notFound.title')}</T>
        <T c={color.textDim}>{t('notFound.body')}</T>
        <Button label={t('notFound.start')} icon="arrow-right" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
