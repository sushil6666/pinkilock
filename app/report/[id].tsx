/**
 * Report someone. A report always blocks too, and it goes to a table no client can read
 * (ARCHITECTURE.md section 5): the reporter never sees it again, and neither does the person.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button } from '@/components/ui/Button';
import { HoldButton } from '@/components/ui/HoldButton';
import { inputStyle } from '@/components/ui/input';
import { Screen, backToDiscover } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { REPORT_DETAIL_MAX, REPORT_REASONS } from '@/domain/safety';
import type { ReportReason } from '@/domain/types';
import { haptic } from '@/lib/haptics';
import { usePerson, useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';
import { aria } from '@/lib/web';

export default function Report() {
  const { id, invite } = useLocalSearchParams<{ id: string; invite?: string }>();
  const person = usePerson(id);
  const report = useStore((s) => s.report);
  const [name] = useState(person?.name ?? 'them');
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError('');
    try {
      await report({ profileId: id, reason, detail: detail.trim(), inviteId: invite || undefined });
      haptic.success();
      setDone(true);
    } catch (e) {
      setError(shown(e, '/report/[id]'));
    }
    setBusy(false);
  };

  if (done) {
    return (
      <Screen desk="form" scroll={false} footer={<Button label="Back to Discover" icon="arrow-right" onPress={() => backToDiscover()} />}>
        <Animated.View entering={FadeInDown.duration(360)} style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
          <T v="label" c={color.gold}>Reported</T>
          <T v="display">Thanks.{'\n'}That's{'\n'}handled.</T>
          <T c={color.textDim}>{name} is blocked: you will not see each other again, and any plan between you has ended without a mark on your record. A person reads every report.</T>
        </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen
      desk="form"
      back="close"
      title="Report"
      footer={<>
        {error ? <ErrorText text={error} /> : null}
        <HoldButton tone="flare" label="Hold to report and block" busy={busy} disabled={!reason} onComplete={send} />
      </>}
    >
      <View style={{ gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <T v="display">What{'\n'}happened?</T>
          <T c={color.textDim}>{name} is not told who reported them. Reporting also blocks them.</T>
        </View>

        <View style={{ gap: space.sm }} accessibilityRole="radiogroup">
          {REPORT_REASONS.map((r) => {
            const on = reason === r.id;
            return (
              <Pressable
                key={r.id}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                {...aria({ checked: on })}
                accessibilityLabel={`${r.label}. ${r.hint}`}
                onPress={() => setReason(r.id)}
                style={[styles.reason, on && { borderColor: color.flare, backgroundColor: color.flareWash }]}
              >
                <View style={[styles.dot, on && { borderColor: color.flare, backgroundColor: color.flare }]} />
                <View style={{ flex: 1 }}>
                  <T v="bodyBold">{r.label}</T>
                  <T v="caption" c={color.textDim}>{r.hint}</T>
                </View>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: space.sm }}>
          <T v="label" c={color.textDim}>Anything we should know (optional)</T>
          <TextInput
            value={detail}
            onChangeText={setDetail}
            maxLength={REPORT_DETAIL_MAX}
            multiline
            placeholder="What they said or did, and when."
            placeholderTextColor={color.textMute}
            style={[inputStyle, { minHeight: 120, paddingTop: space.md, textAlignVertical: 'top' }]}
            accessibilityLabel="Details"
          />
          <T v="caption" c={color.textMute} style={{ textAlign: 'right' }}>{detail.length} / {REPORT_DETAIL_MAX}</T>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  reason: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md, minHeight: 64 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: color.textMute },
});
