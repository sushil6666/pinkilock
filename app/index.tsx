import { Redirect } from 'expo-router';
import { View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { T } from '@/components/ui/T';
import { useStore } from '@/state/store';
import { color, gutter, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';

/** The gate: no profile yet goes to onboarding, everyone else to the tabs. */
export default function Gate() {
  const me = useStore((s) => s.me);
  const bootError = useStore((s) => s.bootError);
  const boot = useStore((s) => s.boot);

  if (bootError) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg, justifyContent: 'center', padding: gutter, gap: space.lg }}>
        <T v="label" c={color.flare}>Could not connect</T>
        <T v="display">No signal, no promises.</T>
        <ErrorText text={bootError} tone={color.textDim} />
        <Button label="Try again" icon="refresh-cw" onPress={boot} />
      </View>
    );
  }
  return <Redirect href={me ? '/(tabs)' : '/onboarding'} />;
}
