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
import { textAreaStyle } from '@/components/ui/input';
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
import { t } from '@/i18n';

export default function Report() {
  const { id, invite } = useLocalSearchParams<{ id: string; invite?: string }>();
  const person = usePerson(id);
  const report = useStore((s) => s.report);
  const [name] = useState(person?.name ?? t('report.them'));
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
      <Screen desk="form" scroll={false} footer={<Button label={t('ask.backToDiscover')} icon="arrow-right" onPress={() => backToDiscover()} />}>
        <Animated.View entering={FadeInDown.duration(360)} style={{ flex: 1, justifyContent: 'center', gap: space.lg }}>
          <T v="label" c={color.gold}>{t('report.done')}</T>
          <T v="display">{t('report.doneTitle')}</T>
          <T c={color.textDim}>{t('report.doneBody', { name })}</T>
        </Animated.View>
      </Screen>
    );
  }

  return (
    <Screen
      desk="form"
      back="close"
      title={t('report.title')}
      footer={<>
        {error ? <ErrorText text={error} /> : null}
        <HoldButton tone="flare" label={t('report.hold')} busy={busy} disabled={!reason} onComplete={send} />
      </>}
    >
      <View style={{ gap: space.xl }}>
        <View style={{ gap: space.sm }}>
          <T v="display">{t('report.what')}</T>
          <T c={color.textDim}>{t('report.notTold', { name })}</T>
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
                accessibilityLabel={t('report.reasonSpoken', { label: r.label, hint: r.hint })}
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
          <T v="label" c={color.textDim}>{t('report.detail')}</T>
          <TextInput
            value={detail}
            onChangeText={setDetail}
            maxLength={REPORT_DETAIL_MAX}
            multiline
            placeholder={t('report.placeholder')}
            placeholderTextColor={color.textMute}
            style={[textAreaStyle, { minHeight: 120 }]}
            accessibilityLabel={t('report.detailLabel')}
          />
          <T v="caption" c={color.textMute} style={{ textAlign: 'right' }}>{t('report.count', { n: detail.length, max: REPORT_DETAIL_MAX })}</T>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  reason: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md, minHeight: 64 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: color.textMute },
});
