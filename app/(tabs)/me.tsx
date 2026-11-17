/**
 * Me: my card as others see it, my trust score and how it is worked out, my account (phone,
 * blocked people, export, delete) and the prototype tools.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';
import { Portrait } from '@/components/Portrait';
import { TrustBadge } from '@/components/TrustBadge';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Chip';
import { HoldButton } from '@/components/ui/HoldButton';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { IDEAS, KIND_LABEL, KIND_ORDER, VIBE_GROUPS } from '@/domain/ideas';
import { maskEmail } from '@/domain/email';
import { maskPhone } from '@/domain/phone';
import { trustScore } from '@/domain/trust';
import { pushStatus, watchPush } from '@/lib/push';
import { backend } from '@/services';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';
import { quiet } from '@/lib/log';
import { buildLabel } from '@/lib/build';
import { diagnostics } from '@/lib/report';

export default function Me() {
  const me = useStore((s) => s.me);
  const contact = useStore((s) => s.myContact);
  const updateMe = useStore((s) => s.updateMe);
  const demoReset = useStore((s) => s.demoReset);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [push, setPush] = useState(pushStatus);
  const account = useStore((s) => s.account);
  /** Whether this account can be got back on another phone. */
  const keeps = !!(account?.email || account?.phone);
  const loadAccount = useStore((s) => s.loadAccount);
  const deleteAccount = useStore((s) => s.deleteAccount);
  const signOut = useStore((s) => s.signOut);
  const [sheet, setSheet] = useState<'delete' | 'sign_out' | null>(null);
  const [editVibes, setEditVibes] = useState(false);
  // A new profile line may be waiting for review (or was not accepted): say so, since the card
  // keeps showing the last approved one.
  const [lineReview, setLineReview] = useState<{ text: string; status: 'pending' | 'held' | 'rejected' } | null>(null);
  useEffect(() => {
    if (me) backend.myLineReview().then(setLineReview, quiet('me.line_review'));
  }, [me?.tagline, me]);
  const [busy, setBusy] = useState('');
  const [accountError, setAccountError] = useState('');
  useEffect(() => watchPush(setPush), []);
  useEffect(() => {
    if (me) loadAccount().catch(quiet('/me'));
  }, [me?.id, loadAccount]);
  if (!me) return null;

  const run = async (what: string, work: () => Promise<void>) => {
    setBusy(what);
    setAccountError('');
    try {
      await work();
    } catch (e) {
      setAccountError(shown(e, '/me'));
    }
    setBusy('');
  };

  const exportData = () => run('export', async () => {
    const json = await backend.exportMyData();
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      a.download = 'pinkilock-my-data.json';
      a.click();
    } else {
      await Share.share({ title: 'My Pinkilock data', message: json });
    }
  });

  const shareDiagnostics = () => run('diagnostics', async () => {
    const text = diagnostics(me.id);
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = 'pinkilock-diagnostics.txt';
      a.click();
    } else {
      await Share.share({ title: 'Pinkilock diagnostics', message: text });
    }
  });

  const leave = (what: 'delete' | 'sign_out') => run(what, async () => {
    await (what === 'delete' ? deleteAccount() : signOut());
    setSheet(null);
    router.replace('/onboarding');
  });

  const toggleIdea = async (id: string) => {
    const has = me.ideaIds.includes(id);
    if (has && me.ideaIds.length <= 3) return setError('Keep at least three. They are how people ask you out.');
    if (!has && me.ideaIds.length >= 6) return setError('Six is the cap. Drop one first.');
    setError('');
    try {
      await updateMe({ ideaIds: has ? me.ideaIds.filter((x) => x !== id) : [...me.ideaIds, id] });
    } catch (e) {
      setError(shown(e, '/me'));
    }
  };

  const toggleVibe = async (v: string) => {
    const has = me.vibes.includes(v);
    if (!has && me.vibes.length >= 3) return setError('Three tags is the cap. Drop one first.');
    setError('');
    try {
      await updateMe({ vibes: has ? me.vibes.filter((x) => x !== v) : [...me.vibes, v] });
    } catch (e) {
      setError(shown(e, '/me'));
    }
  };

  const reset = async () => {
    setResetting(true);
    await demoReset();
    router.replace('/onboarding');
  };

  const live = backend.kind === 'supabase';

  return (
    <Screen inTabs>
      <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center', marginBottom: space.xl }}>
        <Portrait name={me.name} palette={me.palette} glyph={me.glyph} size={84} />
        <View style={{ flex: 1 }}>
          <T v="display" numberOfLines={1} adjustsFontSizeToFit>{me.name}</T>
          <T v="caption" c={color.textDim}>{me.age}  /  {me.area}{me.pronouns ? `  /  ${me.pronouns}` : ''}</T>
        </View>
      </View>

      <TrustBadge person={me} size="lg" />
      <T v="caption" c={color.textDim} style={{ marginTop: space.sm }}>
        {live
          ? 'Worked out from your kept promises, bails and no-shows. Refreshes every few minutes.'
          : `Kept promises push it up, flakes pull it down. One flake from here would make it ${trustScore(me.kept, me.flaked + 1)}.`}
      </T>

      {me.tagline ? <T v="heading" style={{ marginTop: space.xl }}>{me.tagline}</T> : null}
      {lineReview ? (
        <T v="caption" c={lineReview.status === 'rejected' ? color.flare : color.textDim} style={{ marginTop: space.sm }}>
          {lineReview.status === 'rejected'
            ? `"${lineReview.text}" was not accepted: it reads like a way to reach you outside the app.`
            : `"${lineReview.text}" is being checked before others see it.`}
        </T>
      ) : null}
      <View style={[styles.wrap, { marginTop: space.md, alignItems: 'center' }]}>
        {me.vibes.map((v) => <Chip key={v} label={v} />)}
        <Tag label={editVibes ? 'Done' : 'Change tags'} tone={editVibes ? color.volt : color.textDim} onPress={() => setEditVibes(!editVibes)} />
      </View>
      {editVibes && VIBE_GROUPS.map((group) => (
        <View key={group.label} style={{ gap: space.sm, marginTop: space.lg }}>
          <T v="label" c={color.textDim}>{group.label}</T>
          <View style={styles.wrap}>
            {group.vibes.map((v) => <Chip key={v} label={v} selected={me.vibes.includes(v)} onPress={() => toggleVibe(v)} />)}
          </View>
        </View>
      ))}
      {editVibes && error ? <ErrorText text={error} style={{ marginTop: space.sm }} /> : null}

      <T v="label" c={color.textDim} style={styles.section}>I am up for  /  tap to change</T>
      {KIND_ORDER.map((kind) => (
        <View key={kind} style={{ gap: space.sm, marginBottom: space.lg }}>
          <T v="label" c={color.textMute}>{KIND_LABEL[kind]}</T>
          <View style={styles.wrap}>
            {IDEAS.filter((i) => i.kind === kind).map((i) => <Chip key={i.id} label={`${i.emoji} ${i.title}`} selected={me.ideaIds.includes(i.id)} onPress={() => toggleIdea(i.id)} />)}
          </View>
        </View>
      ))}
      {error ? <ErrorText text={error} style={{ marginTop: space.sm }} /> : null}

      <T v="label" c={color.textDim} style={styles.section}>Unlocks when a promise is kept</T>
      <View style={styles.panel}>
        <Feather name="lock" size={18} color={color.pink} />
        <View style={{ flex: 1 }}>
          <T v="label" c={color.textMute}>{contact?.kind ?? 'Contact'}</T>
          <T v="heading">{contact?.handle ?? 'Not set'}</T>
        </View>
      </View>

      <T v="label" c={color.textDim} style={styles.section}>Account</T>
      <View style={styles.panel}>
        <Feather name={account?.email && !account.phone ? 'mail' : 'phone'} size={18} color={keeps ? color.volt : color.textDim} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{keeps ? [account?.email && maskEmail(account.email), account?.phone && maskPhone(account.phone)].filter(Boolean).join(' · ') : 'No email or phone number yet'}</T>
          <T v="caption" c={color.textDim}>{keeps ? 'You can sign in with it on any phone.' : 'Add one to keep this account if you change phones. Without it, losing this phone loses your record.'}</T>
        </View>
      </View>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {!account?.email ? <Button kind="ghost" icon="mail" label="Add your email" onPress={() => router.push({ pathname: '/account/sign-in', params: { mode: 'link', kind: 'email' } })} /> : null}
        {!account?.phone ? <Button kind="ghost" icon="phone" label="Add your phone number" onPress={() => router.push({ pathname: '/account/sign-in', params: { mode: 'link', kind: 'phone' } })} /> : null}
        {keeps ? <Button kind="ghost" icon="log-out" label="Sign out" onPress={() => setSheet('sign_out')} /> : null}
        <Button kind="ghost" icon="slash" label="Blocked people" onPress={() => router.push('/account/blocked')} />
        <Button kind="ghost" icon="download" label="Download my data" busy={busy === 'export'} onPress={exportData} />
        <Button kind="danger" icon="trash-2" label="Delete my account" onPress={() => setSheet('delete')} />
      </View>
      {accountError && !sheet ? <ErrorText text={accountError} style={{ marginTop: space.sm }} /> : null}

      <T v="label" c={color.textDim} style={styles.section}>Data</T>
      <View style={styles.panel}>
        <Feather name={live ? 'cloud' : 'smartphone'} size={18} color={live ? color.volt : color.textDim} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{live ? 'Live: Supabase' : 'Mock data on this phone'}</T>
          <T v="caption" c={color.textDim}>{live ? 'Postgres with row-level security and realtime.' : 'Ten made-up people who answer by themselves. Add Supabase keys to go live.'}</T>
        </View>
      </View>

      <T v="label" c={color.textDim} style={styles.section}>Notifications</T>
      <View style={styles.panel}>
        <Feather name={push.state === 'on' ? 'bell' : 'bell-off'} size={18} color={push.state === 'on' ? color.volt : push.state === 'unavailable' ? color.textDim : color.flare} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{push.state === 'on' ? 'On for this phone' : push.state === 'denied' ? 'Turned off' : push.state === 'error' ? 'Not working' : 'Not available here'}</T>
          <T v="caption" c={color.textDim}>{push.detail}</T>
        </View>
      </View>

      <T v="label" c={color.textDim} style={styles.section}>Help</T>
      <T v="caption" c={color.textDim} style={{ marginBottom: space.md }}>If something went wrong, send us this. It holds the app version, your account id, and the codes of recent errors. No names, messages, places or contacts.</T>
      <Button kind="ghost" icon="life-buoy" label="Share diagnostics" busy={busy === 'diagnostics'} onPress={shareDiagnostics} />
      <T v="caption" c={color.textMute} selectable style={{ marginTop: space.md }}>Pinkilock {buildLabel}</T>

      {!live && (
        <>
          <T v="label" c={color.textDim} style={styles.section}>Prototype tools</T>
          <T v="caption" c={color.textDim} style={{ marginBottom: space.md }}>Wipes this phone's mock data and starts again from onboarding.</T>
          <HoldButton tone="flare" label="Hold to reset the demo" onComplete={reset} busy={resetting} />
        </>
      )}

      <Sheet
        visible={sheet === 'delete'}
        onClose={() => setSheet(null)}
        eyebrow="Delete account"
        title="Gone for good?"
        body="Your card, contact, plans and record are deleted, and any plan you have open ends without counting against anyone. This cannot be undone. Download your data first if you want a copy."
      >
        {accountError ? <ErrorText text={accountError} /> : null}
        <HoldButton tone="flare" label="Hold to delete everything" busy={busy === 'delete'} onComplete={() => leave('delete')} />
        <Button kind="ghost" label="Keep my account" onPress={() => setSheet(null)} />
      </Sheet>

      <Sheet
        visible={sheet === 'sign_out'}
        onClose={() => setSheet(null)}
        eyebrow="Sign out"
        title="Sign out of this phone?"
        body={`Your account stays. Sign back in any time with ${account?.email ? maskEmail(account.email) : account?.phone ? maskPhone(account.phone) : 'your email or number'}. This phone stops getting your notifications.`}
      >
        {accountError ? <ErrorText text={accountError} /> : null}
        <Button kind="danger" label="Sign out" busy={busy === 'sign_out'} onPress={() => leave('sign_out')} />
        <Button kind="ghost" label="Stay signed in" onPress={() => setSheet(null)} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  section: { marginTop: space.x3, marginBottom: space.md },
  panel: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg },
});
