/** Safety: how to meet well, how to report, and the emergency numbers for my country (WP8). */
import { Feather } from '@expo/vector-icons';
import { Linking, View } from 'react-native';
import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { countryOf } from '@/domain/countries';
import { quiet } from '@/lib/log';
import { useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';

const TIPS: [string, string][] = [
  ['Meet somewhere public and busy.', 'The suggested places are all public. Stay where other people are.'],
  ['Tell a friend.', 'Share the plan from the plan screen: who, where, when.'],
  ['Get there and home on your own.', 'You decide when it ends. Ten minutes is a whole micro-date.'],
  ['No contact until you both showed.', 'Anyone pushing for your number first is breaking the rules: report them.'],
  ['Trust the feeling.', 'If something is off, leave. Bailing for safety is never held against you by us.'],
];

export default function Safety() {
  const country = countryOf(useStore((s) => s.me?.country));
  const call = (n: string) => Linking.openURL(`tel:${n}`).catch(quiet('safety.call'));
  return (
    <Screen desk="read" back="back" title="Safety">
      <View style={{ gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <T v="label" c={color.flare}>In danger now</T>
          <Button kind="danger" icon="phone" label={`Call ${country.emergency} (${country.name} emergency)`} onPress={() => call(country.emergency)} />
          {country.womenHelpline ? <Button kind="ghost" icon="phone" label={`Women's helpline ${country.womenHelpline}`} onPress={() => call(country.womenHelpline!)} /> : null}
        </View>
        {TIPS.map(([head, sub]) => (
          <View key={head} style={{ flexDirection: 'row', gap: space.md }}>
            <Feather name="shield" size={18} color={color.gold} style={{ marginTop: 3 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyBold">{head}</T>
              <T c={color.textDim}>{sub}</T>
            </View>
          </View>
        ))}
        <T c={color.textDim}>To report someone, open their profile and choose Block or report. Reports are read by a person, and the person reported is never told who reported them.</T>
      </View>
    </Screen>
  );
}
