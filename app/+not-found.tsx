/** An address that is not a screen: a mistyped link, or one from an older version. */
import { router } from 'expo-router';
import { View } from 'react-native';
import { Loop } from '@/components/Loop';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { color, space } from '@/theme/tokens';

export default function NotFound() {
  return (
    <Screen scroll={false}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
        <Loop name="padlock" style={{ maxWidth: 240 }} />
        <T v="label" c={color.pink}>Pinkilock</T>
        <T v="display">Nothing{'\n'}here.</T>
        <T c={color.textDim}>That link does not lead anywhere. Nothing was promised, so nothing is lost.</T>
        <Button label="Go to the start" icon="arrow-right" onPress={() => router.replace('/')} />
      </View>
    </Screen>
  );
}
