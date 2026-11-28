/**
 * Expert tips (D127): dating advice, pre-marital prep, resolving conflict and healing from a
 * breakup. General tips from the team, labelled so, until vetted experts add their own; each
 * expert tip names the expert and their checked credential and can be reported. A "watch out for"
 * panel warns about guaranteed-soulmate promises, manipulation tactics and paid mystical cures.
 */
import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Choice, WatchOut } from '@/components/Experts';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Columns } from '@/components/ui/Columns';
import { Entry } from '@/components/ui/Entry';
import { Fold } from '@/components/ui/Fold';
import { ErrorText } from '@/components/ui/ErrorText';
import { textAreaStyle } from '@/components/ui/input';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { EXPERT_KINDS, EXPERT_TOPICS, GENERAL_TIPS, REPORT_REASONS, TOPIC_EMOJI, isTopic, type ExpertReportReason, type ExpertTip, type ExpertTopic } from '@/domain/experts';
import { haptic } from '@/lib/haptics';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { color, radius, space } from '@/theme/tokens';
import { t } from '@/i18n';

const ROUTE = '/experts';
const panel = { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md } as const;

export default function ExpertsPage() {
  const params = useLocalSearchParams<{ topic?: string }>();
  const [topic, setTopic] = useState<ExpertTopic | null>(isTopic(params.topic) ? params.topic : null);
  const [tips, setTips] = useState<ExpertTip[]>([]);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setError('');
      backend.expertTips(topic).then((x) => { if (alive) setTips(x); }, (e) => { if (alive) setError(shown(e, ROUTE)); });
      return () => {
        alive = false;
      };
    }, [topic]),
  );

  const topics = topic ? [topic] : EXPERT_TOPICS;

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.gold}>{t('experts.eyebrow')}</T>
        <T v="display">{t('experts.title')}</T>
        <T c={color.textDim}>{t('experts.intro')}</T>
      </View>
      <View style={styles.chips} accessibilityRole="tablist">
        <Chip label={t('experts.allTopics')} selected={!topic} onPress={() => { haptic.tick(); setTopic(null); }} />
        {EXPERT_TOPICS.map((k) => (
          <Chip key={k} label={`${TOPIC_EMOJI[k]}  ${t(`experts.topics.${k}`)}`} selected={topic === k} onPress={() => { haptic.tick(); setTopic(k); }} />
        ))}
      </View>

      {topic === 'breakup' ? (
        <Entry tone="pink" icon={<Feather name="sunrise" size={20} color={color.pink} />} title={t('selfLove.bounceTitle')} spoken={t('selfLove.bounceOpen')} onPress={() => router.push('/self-love/bounce-back')} />
      ) : null}

      <View style={panel}>
        <T v="heading">{t('experts.expertsTitle')}</T>
        {tips.length ? tips.map((x) => <ExpertTipCard key={x.id} tip={x} />) : <T v="caption" c={color.textDim}>{t('experts.noExperts')}</T>}
        <ErrorText text={error} />
      </View>

      {topics.map((k) => (
        <Fold key={`${k}-${topic ?? 'all'}`} title={`${TOPIC_EMOJI[k]}  ${t(`experts.topics.${k}`)}`} open={topic === k}>
          <T v="caption" c={color.textMute}>{t('experts.teamLabel')}</T>
          {GENERAL_TIPS[k].map((g) => (
            <View key={g} style={styles.tip}>
              <T v="bodyBold">{t(`experts.tipTitles.${g}`)}</T>
              <T v="body" c={color.textDim}>{t(`experts.tips.${g}`)}</T>
            </View>
          ))}
        </Fold>
      ))}
      <T v="caption" c={color.textMute}>{t('experts.teamNote')}</T>
    </>
  );

  const right = (
    <>
      <WatchOut />
      <Fold icon="users" title={t('experts.kindsTitle')} value={String(EXPERT_KINDS.length)}>
        {EXPERT_KINDS.map((k) => (
          <View key={k} style={{ gap: 2 }}>
            <T v="bodyBold">{t(`experts.kinds.${k}`)}</T>
            <T v="caption" c={color.textDim}>{t(`experts.kindsBody.${k}`)}</T>
          </View>
        ))}
      </Fold>
      <View style={panel}>
        <View style={styles.row}>
          <Feather name="life-buoy" size={18} color={color.gold} />
          <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('experts.notTherapy')}</T>
        </View>
      </View>
      <Entry tone="gold" icon={<Feather name="award" size={20} color={color.gold} />} title={t('experts.joinTitle')} spoken={t('experts.joinOpen')} onPress={() => router.push('/experts/join')} />
    </>
  );

  return (
    <Screen back="back" title={t('experts.eyebrow')}>
      <Columns gap={space.xl} left={left} right={right} ratio={[3, 2]} />
    </Screen>
  );
}

function ExpertTipCard({ tip }: { tip: ExpertTip }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ExpertReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const e = tip.expert;

  const send = async () => {
    if (!reason) return;
    setBusy(true);
    setError('');
    try {
      await backend.reportExpert(e.id, reason, detail);
      haptic.success();
      setDone(true);
    } catch (err) {
      setError(shown(err, ROUTE));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.tip}>
      <T v="bodyBold">{tip.title}</T>
      <T v="body">{tip.body}</T>
      <View style={styles.by}>
        <Feather name="check-circle" size={14} color={color.gold} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <T v="caption">{`${e.name}, ${t(`experts.kinds.${e.kind}`)}`}</T>
          <T v="caption" c={color.textMute}>{`${e.credential}${e.city ? `  /  ${e.city}` : ''}  /  ${t('experts.verified')}`}</T>
        </View>
      </View>
      {done ? (
        <T v="caption" c={color.gold}>{t('experts.reported')}</T>
      ) : open ? (
        <View style={{ gap: space.sm }}>
          <T v="bodyBold">{t('experts.reportTitle')}</T>
          <View style={{ gap: space.xs }} accessibilityRole="radiogroup">
            {REPORT_REASONS.map((r) => <Choice key={r} label={t(`experts.reasons.${r}`)} selected={reason === r} onPress={() => setReason(r)} />)}
          </View>
          <TextInput value={detail} onChangeText={setDetail} placeholder={t('experts.reportDetail')} placeholderTextColor={color.textMute}
            accessibilityLabel={t('experts.reportDetail')} multiline maxLength={500} style={textAreaStyle} />
          <View style={styles.chips}>
            <Button icon="flag" label={t('experts.reportSend')} busy={busy} disabled={!reason} onPress={send} />
            <Button kind="quiet" label={t('common.cancel')} onPress={() => setOpen(false)} />
          </View>
          <ErrorText text={error} />
        </View>
      ) : (
        <Button kind="quiet" icon="flag" label={t('experts.report')} onPress={() => setOpen(true)} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  tip: { borderRadius: radius.card, backgroundColor: color.surfaceHi, padding: space.md, gap: space.xs },
  by: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start', marginTop: space.xs },
});
