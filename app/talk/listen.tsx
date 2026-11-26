/**
 * Becoming a listener (D108). A first name, who I take calls from, what I can talk about, and the
 * listener code, agreed in full. Then identity and bank, straight to Razorpay Route (only the last
 * four digits come back), then a person at Pinkilock checks the application. A verified listener
 * takes calls for two hours at a time, sees an incoming call here, and sees what was paid out.
 */
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { CallPanel, HelpLines, ListenerCode, panel, until, useCallTimer, useTalk } from '@/components/Talk';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Columns } from '@/components/ui/Columns';
import { ErrorText } from '@/components/ui/ErrorText';
import { Screen } from '@/components/ui/Screen';
import { T } from '@/components/ui/T';
import { inputStyle } from '@/components/ui/input';
import { ACCEPTS, MAX_TOPICS, SEXES, TOPICS, checkKyc, checkListener, type Accepts, type KycInput, type Sex, type Topic } from '@/domain/talk';
import { shown } from '@/lib/report';
import { backend } from '@/services';
import { color, radius, space } from '@/theme/tokens';
import { fmtNumber, t, type Key } from '@/i18n';

const ROUTE = '/talk/listen';
const rupees = (paise: number) => `₹${fmtNumber(Math.floor(paise / 100))}`;
const KYC_FIELDS: { k: keyof KycInput; label: Key; caps?: boolean; num?: boolean }[] = [
  { k: 'pan', label: 'talk.pan', caps: true },
  { k: 'holder', label: 'talk.holder' },
  { k: 'account', label: 'talk.account', num: true },
  { k: 'ifsc', label: 'talk.ifsc', caps: true },
  { k: 'street', label: 'talk.street' },
  { k: 'city', label: 'talk.city' },
  { k: 'state', label: 'talk.state' },
  { k: 'pin', label: 'talk.pin', num: true },
];

export default function TalkListen() {
  const { state, error, busy, run, setState } = useTalk(ROUTE);
  const me = state.listener;
  const available = !!me?.availableUntil && me.availableUntil > Date.now();
  // A call that rings or runs shows its own errors; otherwise they show by what was pressed.
  const onCall = !!state.call && state.call.status !== 'done';
  useCallTimer(state, setState, available);

  const left = (
    <>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.gold}>{t('talk.eyebrow')}</T>
        <T v="display">{t('talk.applyTitle')}</T>
        <T c={color.textDim}>{t('talk.applyBody')}</T>
      </View>
      {state.call ? <CallPanel talk={state} busy={busy} error={onCall ? error : ''} run={run} route={ROUTE} /> : null}
      {!me ? <Apply busy={busy === 'apply'} error={onCall ? '' : error} run={run} />
        : me.status === 'applied' ? <Kyc open={state.open.payouts} busy={busy === 'kyc'} error={onCall ? '' : error} run={run} />
        : <Status talk={state} available={available} busy={busy} error={onCall ? '' : error} run={run} />}
    </>
  );

  const right = (
    <>
      <View style={panel}><ListenerCode /></View>
      <HelpLines />
    </>
  );

  return (
    <Screen back="back" title={t('talk.listenTitle')}>
      <Columns gap={space.xl} left={left} right={right} />
    </Screen>
  );
}

type Run = ReturnType<typeof useTalk>['run'];

function Apply({ busy, error, run }: { busy: boolean; error: string; run: Run }) {
  const [firstName, setFirstName] = useState('');
  const [sex, setSex] = useState<Sex | null>(null);
  const [accepts, setAccepts] = useState<Accepts>('anyone');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [code, setCode] = useState(false);
  const [local, setLocal] = useState('');
  const toggle = (x: Topic) => setTopics(topics.includes(x) ? topics.filter((y) => y !== x) : topics.length < MAX_TOPICS ? [...topics, x] : topics);
  const send = () => {
    setLocal('');
    if (!sex) return;
    try {
      const input = checkListener({ firstName, sex, accepts, topics, code });
      void run('apply', () => backend.talkListenerApply(input));
    } catch (e) {
      setLocal(shown(e, ROUTE));
    }
  };
  return (
    <View style={panel}>
      <T v="label" c={color.textDim}>{t('talk.firstName')}</T>
      <TextInput value={firstName} onChangeText={setFirstName} maxLength={20} autoCapitalize="words" autoComplete="given-name"
        style={inputStyle} accessibilityLabel={t('talk.firstName')} />
      <T v="caption" c={color.textMute}>{t('talk.firstNameHint')}</T>
      <T v="label" c={color.textDim}>{t('talk.iAm')}</T>
      <View style={styles.chips}>
        {SEXES.map((x) => <Chip key={x} label={t(`talk.sex.${x}`)} selected={sex === x} onPress={() => setSex(x)} />)}
      </View>
      <T v="label" c={color.textDim}>{t('talk.iTake')}</T>
      <View style={styles.chips}>
        {ACCEPTS.map((x) => <Chip key={x} label={t(`talk.accepts.${x}`)} selected={accepts === x} onPress={() => setAccepts(x)} />)}
      </View>
      <T v="label" c={color.textDim}>{t('talk.canTalk', { n: MAX_TOPICS })}</T>
      <View style={styles.chips}>
        {TOPICS.map((x) => <Chip key={x} label={t(`talk.topics.${x}`)} selected={topics.includes(x)} onPress={() => toggle(x)} />)}
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: code }} onPress={() => setCode(!code)} style={styles.agree}>
        <View style={[styles.box, code && styles.boxOn]}>{code ? <Feather name="check" size={14} color={color.onGold} /> : null}</View>
        <T style={{ flex: 1 }}>{t('talk.agree')}</T>
      </Pressable>
      {local || error ? <ErrorText text={local || error} /> : null}
      <Button label={t('talk.apply')} busy={busy} disabled={!firstName.trim() || !sex || !topics.length || !code} onPress={send} />
    </View>
  );
}

function Kyc({ open, busy, error, run }: { open: boolean; busy: boolean; error: string; run: Run }) {
  const [kyc, setKyc] = useState<KycInput>({ pan: '', account: '', ifsc: '', holder: '', street: '', city: '', state: '', pin: '' });
  const [local, setLocal] = useState('');
  const send = () => {
    setLocal('');
    try {
      const input = checkKyc(kyc);
      void run('kyc', () => backend.talkListenerKyc(input));
    } catch (e) {
      setLocal(shown(e, ROUTE));
    }
  };
  return (
    <View style={panel}>
      <T c={color.gold}>{t('talk.applied')}</T>
      <T v="heading">{t('talk.kycTitle')}</T>
      <T v="caption" c={color.textDim}>{t('talk.kycBody')}</T>
      {open ? (
        <>
          {KYC_FIELDS.map((f) => (
            <View key={f.k} style={{ gap: space.xs }}>
              <T v="label" c={color.textDim}>{t(f.label)}</T>
              <TextInput value={kyc[f.k]} onChangeText={(v) => setKyc({ ...kyc, [f.k]: v })} autoCapitalize={f.caps ? 'characters' : 'words'} autoCorrect={false}
                keyboardType={f.num ? 'number-pad' : 'default'} style={inputStyle} accessibilityLabel={t(f.label)} />
            </View>
          ))}
          {local || error ? <ErrorText text={local || error} /> : null}
          <Button icon="shield" label={t('talk.kycSend')} busy={busy} disabled={Object.values(kyc).some((v) => !v.trim())} onPress={send} />
        </>
      ) : <T c={color.textDim}>{t('talk.kycOff')}</T>}
    </View>
  );
}

function Status({ talk, available, busy, error, run }: { talk: ReturnType<typeof useTalk>['state']; available: boolean; busy: string; error: string; run: Run }) {
  const me = talk.listener!;
  const words: Record<string, Key> = { checking: 'talk.checking', verified: 'talk.verified', paused: 'talk.paused', removed: 'talk.removed' };
  const onCall = !!talk.call && talk.call.status !== 'done';
  return (
    <View style={[panel, me.status === 'verified' && styles.verified]}>
      <View style={styles.row}>
        <Feather name={me.status === 'verified' ? 'check-circle' : me.status === 'checking' ? 'clock' : 'pause-circle'} size={20} color={me.status === 'verified' ? color.gold : color.textDim} />
        <T v="heading" style={{ flex: 1 }}>{me.firstName}</T>
      </View>
      <T c={me.status === 'verified' ? color.gold : color.textDim}>{t(words[me.status])}</T>
      {me.bankLast4 ? <T v="caption" c={color.textDim}>{t('talk.bank', { last4: me.bankLast4 })}</T> : null}
      <T v="caption" c={color.textDim}>{me.topics.map((x) => t(`talk.topics.${x}`)).join(' · ')} · {t(`talk.accepts.${me.accepts}`)}</T>
      {me.status === 'verified' && !onCall ? (
        available ? (
          <>
            <T c={color.gold}>{t('talk.availableOn', { time: until(me.availableUntil!) })}</T>
            <T v="caption" c={color.textDim}>{t('talk.waiting')}</T>
            <Button kind="ghost" icon="pause" label={t('talk.stop')} busy={busy === 'stop'} onPress={() => run('stop', () => backend.talkListenerAvailable(false))} />
          </>
        ) : (
          <Button icon="headphones" label={t('talk.available')} busy={busy === 'start'} onPress={() => run('start', () => backend.talkListenerAvailable(true))} />
        )
      ) : null}
      <View style={styles.rule} />
      <T v="caption" c={color.textDim}>{t('talk.callsTaken', { count: me.calls })}</T>
      <T v="caption" c={color.textDim}>{t('talk.earnings', { paid: rupees(me.paidOut), pending: rupees(me.pending) })}</T>
      {error ? <ErrorText text={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  agree: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: radius.chip, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.gold, borderColor: color.gold },
  verified: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
  rule: { height: 1, backgroundColor: color.line, marginVertical: space.xs },
});
