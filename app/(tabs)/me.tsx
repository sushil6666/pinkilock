/**
 * Me: my card as others see it, my trust score and how it is worked out, my account (phone,
 * blocked people, export, delete) and the prototype tools.
 */
import { Feather } from '@expo/vector-icons';
import { ContactPanel } from '@/components/ContactCheck';
import { IdeaChip } from '@/components/IdeaChip';
import { MyFace, useMyFace } from '@/components/MyFace';
import { MyPhotos } from '@/components/MyPhotos';
import { SpicyEntry } from '@/components/Spicy';
import { ExpertsEntry } from '@/components/Experts';
import { TalkEntry } from '@/components/Talk';
import { WalletEntry } from '@/components/Wallet';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, Share, StyleSheet, View } from 'react-native';
import { Portrait } from '@/components/Portrait';
import { TrustBadge } from '@/components/TrustBadge';
import { PinkGold, PinkGoldEntry } from '@/components/PinkGold';
import { Button } from '@/components/ui/Button';
import { Chip, Tag } from '@/components/ui/Chip';
import { HoldButton } from '@/components/ui/HoldButton';
import { Columns } from '@/components/ui/Columns';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import { IDEAS, KIND_LABEL, KIND_ORDER, VIBE_GROUPS, offeredIn, pickerIdeas } from '@/domain/ideas';
import { maskEmail } from '@/domain/email';
import { maskPhone } from '@/domain/phone';
import { trustScore } from '@/domain/trust';
import { pushStatus, watchPush } from '@/lib/push';
import { backend } from '@/services';
import { usePerson, useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { ErrorText } from '@/components/ui/ErrorText';
import { shown } from '@/lib/report';
import { quiet } from '@/lib/log';
import { buildLabel } from '@/lib/build';
import { diagnostics } from '@/lib/report';
import { FREE_WINDOWS } from '@/domain/freeWindows';
import { Vouches } from '@/components/Vouches';
import { WherePicker, areaOk } from '@/components/WherePicker';
import { shareOrCopy } from '@/lib/shareOrCopy';
import { FriendsEntry } from '@/components/Friends';
import { YourRecord } from '@/components/Record';
import { Reminders } from '@/components/Reminders';
import { openStorePage } from '@/lib/review';
import * as Linking from 'expo-linking';
import { t } from '@/i18n';
import { LanguagePicker } from '@/components/LanguagePicker';
import { openCities } from '@/domain/countries';

export default function Me() {
  const me = useStore((s) => s.me);
  const myWallet = useStore((s) => s.wallet);
  const updateMe = useStore((s) => s.updateMe);
  const saveAvailability = useStore((s) => s.saveAvailability);
  const duo = usePerson(useStore((s) => s.duoId) ?? undefined);
  const leaveDuo = useStore((s) => s.leaveDuo);
  const [duoError, setDuoError] = useState('');
  /** Set when a link was copied rather than shared (a browser with no share sheet). */
  const [copied, setCopied] = useState<'duo' | 'vouch' | null>(null);
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
  // Moving city (D083): the new city and area wait here until saved together.
  const [move, setMove] = useState<{ city: string; area: string } | null>(null);
  const [moveError, setMoveError] = useState('');
  const [moved, setMoved] = useState('');
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
      await Share.share({ title: t('me.dataTitle'), message: json });
    }
  });

  // A duo (docs/build-plan.md F3): a friend opens the link in the app and joins.
  const duoStep = async (what: string, work: () => Promise<void>) => {
    setBusy(what);
    setDuoError('');
    try {
      await work();
    } catch (e) {
      setDuoError(shown(e, '/me'));
    }
    setBusy('');
  };
  const askDuo = () => duoStep('duo', async () => {
    const token = await backend.createDuoLink();
    const link = Platform.OS === 'web' ? `${window.location.origin}/duo/${token}` : Linking.createURL(`/duo/${token}`);
    setCopied((await shareOrCopy(t('me.duoShare', { link }))) === 'copied' ? 'duo' : null);
  });

  const askVouch = () => run('vouch', async () => {
    const token = await backend.createVouchLink();
    const link = Platform.OS === 'web' ? `${window.location.origin}/vouch/${token}` : Linking.createURL(`/vouch/${token}`);
    setCopied((await shareOrCopy(t('me.vouchShare', { link }))) === 'copied' ? 'vouch' : null);
  });

  const shareDiagnostics = () => run('diagnostics', async () => {
    const text = diagnostics(me.id);
    if (Platform.OS === 'web') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
      a.download = 'pinkilock-diagnostics.txt';
      a.click();
    } else {
      await Share.share({ title: t('me.diagnosticsTitle'), message: text });
    }
  });

  const leave = (what: 'delete' | 'sign_out') => run(what, async () => {
    await (what === 'delete' ? deleteAccount() : signOut());
    setSheet(null);
    router.replace('/onboarding');
  });

  const saveMove = async () => {
    if (!move) return;
    setBusy('move');
    setMoveError('');
    try {
      await updateMe({ city: move.city, area: move.area });
      setMoved(t('me.moved', { city: move.city }));
      setMove(null);
    } catch (e) {
      setMoveError(shown(e, '/me'));
    }
    setBusy('');
  };

  const toggleIdea = async (id: string) => {
    const has = me.ideaIds.includes(id);
    if (has && me.ideaIds.length <= 3) return setError(t('me.keepThree'));
    if (!has && me.ideaIds.length >= 6) return setError(t('me.upToSix'));
    setError('');
    try {
      await updateMe({ ideaIds: has ? me.ideaIds.filter((x) => x !== id) : [...me.ideaIds, id] });
    } catch (e) {
      setError(shown(e, '/me'));
    }
  };

  const toggleVibe = async (v: string) => {
    const has = me.vibes.includes(v);
    if (!has && me.vibes.length >= 3) return setError(t('me.upToThreeTags'));
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
  const face = useMyFace();

  return (
    <Screen inTabs>
      <Columns gap={0} left={<>
      <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center', marginBottom: space.xl }}>
        <Portrait name={me.name} palette={me.palette} glyph={me.glyph} faceUrl={face.current?.url} size={84} />
        <View style={{ flex: 1 }}>
          <T v="display" numberOfLines={1} adjustsFontSizeToFit>{me.name}</T>
          <T v="caption" c={color.textDim}>{[me.age, me.area ? t('profile.areaCity', { area: me.area, city: me.city }) : me.city, me.pronouns].filter(Boolean).join('  /  ')}</T>
          {me.pinkGold ? <View style={{ marginTop: space.sm }}><PinkGold person={me} mine /></View> : null}
        </View>
      </View>

      <MyFace face={face} />

      <TrustBadge person={me} size="lg" />
      <T v="caption" c={color.textDim} style={{ marginTop: space.sm }}>
        {live ? t('me.scoreLive') : t('me.scoreDemo', { score: trustScore(me.kept, me.flaked + 1) })}
      </T>
      <YourRecord />

      {me.tagline ? <T v="heading" style={{ marginTop: space.xl }}>{me.tagline}</T> : null}
      {lineReview ? (
        <T v="caption" c={lineReview.status === 'rejected' ? color.flare : color.textDim} style={{ marginTop: space.sm }}>
          {t(lineReview.status === 'rejected' ? 'me.lineRejected' : 'me.lineChecking', { line: lineReview.text })}
        </T>
      ) : null}
      <View style={[styles.wrap, { marginTop: space.md, alignItems: 'center' }]}>
        {me.vibes.map((v) => <Chip key={v} label={v} />)}
        <Tag label={t(editVibes ? 'common.done' : 'me.changeTags')} tone={editVibes ? color.gold : color.textDim} onPress={() => setEditVibes(!editVibes)} />
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

      <T v="label" c={color.textDim} style={styles.section}>{t('me.upFor')}</T>
      {KIND_ORDER.map((kind) => (
        <View key={kind} style={{ gap: space.sm, marginBottom: space.lg }}>
          <T v="label" c={color.textMute}>{KIND_LABEL[kind]}</T>
          {pickerIdeas(IDEAS.filter((i) => offeredIn(i.id, me.country, me.city) || me.ideaIds.includes(i.id)), kind).map((i) => (
            <IdeaChip key={i.id} idea={i} localTo={me.city} selected={me.ideaIds.includes(i.id)} onPress={() => toggleIdea(i.id)} />
          ))}
        </View>
      ))}
      {error ? <ErrorText text={error} style={{ marginTop: space.sm }} /> : null}

      <T v="label" c={color.textDim} style={styles.section}>{t('me.whereTitle')}</T>
      <View style={styles.panel}>
        <Feather name="map-pin" size={18} color={color.gold} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{me.area ? t('profile.areaCity', { area: me.area, city: me.city }) : me.city}</T>
          {moved && !move ? <T v="caption" c={color.gold}>{moved}</T> : null}
        </View>
        <Tag label={t(move ? 'common.cancel' : 'me.move')} tone={move ? color.textDim : color.gold}
          onPress={() => { setMoved(''); setMoveError(''); setMove(move ? null : { city: me.city, area: me.area }); }} />
      </View>
      {move ? (
        <View style={{ gap: space.lg, marginTop: space.lg }}>
          <T v="caption" c={color.textDim}>{t('me.moveBody')}</T>
          <WherePicker early={!!me.pinkGold} city={move.city} area={move.area} onCity={(city) => setMove((m) => m && { ...m, city })} onArea={(area) => setMove((m) => m && { ...m, area })} />
          {moveError ? <ErrorText text={moveError} /> : null}
          <Button icon="map-pin" label={t('me.moveSave', { city: move.city })} onPress={saveMove} busy={busy === 'move'}
            disabled={(move.city === me.city && move.area === me.area) || !areaOk(move.city, move.area)} />
        </View>
      ) : null}

      </>} right={<>
      <Pressable accessibilityRole="button" accessibilityLabel={t('selfLove.meOpen')} onPress={() => router.push('/self-love')} style={({ pressed }) => [styles.selfLove, pressed && { opacity: 0.85 }]}>
        <Feather name="heart" size={22} color={color.gold} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="label" c={color.gold}>{t('selfLove.eyebrow')}</T>
          <T v="heading">{t('selfLove.meTitle')}</T>
          <T v="caption" c={color.textDim}>{t('selfLove.meBody')}</T>
        </View>
        <Feather name="chevron-right" size={20} color={color.textDim} />
      </Pressable>
      <FriendsEntry />
      <TalkEntry />
      <ExpertsEntry />
      <WalletEntry />
      <PinkGoldEntry wallet={myWallet} />
      <SpicyEntry />
      <View style={{ marginTop: space.lg, gap: space.sm }}>
        <Vouches person={me} />
        <Button kind="ghost" icon="users" label={t('me.askVouch')} onPress={askVouch} />
        {copied === 'vouch' ? <T v="caption" c={color.gold}>{t('me.vouchCopied')}</T> : null}
      </View>

      <T v="label" c={color.textDim} style={styles.section}>{t('me.duoTitle')}</T>
      {duo ? (
        <View style={styles.duo}>
          <Portrait name={duo.name} palette={duo.palette} glyph={duo.glyph} faceUrl={duo.faceUrl} size={40} />
          <View style={{ flex: 1 }}>
            <T v="bodyBold">{t('me.youAnd', { name: duo.name })}</T>
            <T v="caption" c={color.textDim}>{t('me.duoBody')}</T>
          </View>
          <Tag label={t('me.leave')} tone={color.textDim} onPress={() => duoStep('leave_duo', () => leaveDuo())} />
        </View>
      ) : (
        <View style={{ gap: space.sm }}>
          <T c={color.textDim}>{t('me.duoPitch')}</T>
          <Button kind="ghost" icon="user-plus" label={t('me.makeDuo')} onPress={askDuo} busy={busy === 'duo'} />
        </View>
      )}
      {duoError ? <ErrorText text={duoError} style={{ marginTop: space.sm }} /> : null}
      {copied === 'duo' && !duo ? <T v="caption" c={color.gold} style={{ marginTop: space.sm }}>{t('me.duoCopied')}</T> : null}

      <T v="label" c={color.textDim} style={styles.section}>{t('me.freeTitle')}</T>
      <View style={styles.wrap}>
        {FREE_WINDOWS.map((w) => {
          const on = (me.freeWindows ?? []).includes(w.id);
          return <Chip key={w.id} label={w.label} selected={on} onPress={() => saveAvailability(on ? (me.freeWindows ?? []).filter((x) => x !== w.id) : [...(me.freeWindows ?? []), w.id]).catch((e) => setError(shown(e, '/(tabs)/me')))} />;
        })}
      </View>
      <T v="caption" c={color.textDim} style={{ marginTop: space.sm }}>{t('me.freeBody')}</T>

      <T v="label" c={color.textDim} style={styles.section}>{t('me.unlocksTitle')}</T>
      <ContactPanel />
      <MyPhotos />

      <T v="label" c={color.textDim} style={styles.section}>{t('language.title')}</T>
      <LanguagePicker look="row" state={openCities().find((c) => c.name === me.city)?.state} />

      <T v="label" c={color.textDim} style={styles.section}>{t('me.account')}</T>
      <View style={styles.panel}>
        <Feather name={account?.email && !account.phone ? 'mail' : 'phone'} size={18} color={keeps ? color.gold : color.textDim} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{keeps ? [account?.email && maskEmail(account.email), account?.phone && maskPhone(account.phone)].filter(Boolean).join(' · ') : t('me.noLink')}</T>
          <T v="caption" c={color.textDim}>{t(keeps ? 'me.linkUse' : 'me.linkWhy')}</T>
        </View>
      </View>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {!account?.email ? <Button kind="ghost" icon="mail" label={t('me.addEmail')} onPress={() => router.push({ pathname: '/account/sign-in', params: { mode: 'link', kind: 'email' } })} /> : null}
        {!account?.phone ? <Button kind="ghost" icon="phone" label={t('me.addPhone')} onPress={() => router.push({ pathname: '/account/sign-in', params: { mode: 'link', kind: 'phone' } })} /> : null}
        {keeps ? <Button kind="ghost" icon="log-out" label={t('me.signOut')} onPress={() => setSheet('sign_out')} /> : null}
        <Button kind="ghost" icon="slash" label={t('me.blocked')} onPress={() => router.push('/account/blocked')} />
        <Button kind="ghost" icon="download" label={t('me.download')} busy={busy === 'export'} onPress={exportData} />
        <Button kind="danger" icon="trash-2" label={t('me.delete')} onPress={() => setSheet('delete')} />
      </View>
      {accountError && !sheet ? <ErrorText text={accountError} style={{ marginTop: space.sm }} /> : null}

      <T v="label" c={color.textDim} style={styles.section}>{t('me.data')}</T>
      <View style={styles.panel}>
        <Feather name={live ? 'cloud' : 'smartphone'} size={18} color={live ? color.gold : color.textDim} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{t(live ? 'me.connected' : 'me.demoMode')}</T>
          <T v="caption" c={color.textDim}>{t(live ? 'me.connectedBody' : 'me.demoBody')}</T>
        </View>
      </View>

      <T v="label" c={color.textDim} style={styles.section}>{t('me.notifications')}</T>
      <View style={styles.panel}>
        <Feather name={push.state === 'on' ? 'bell' : 'bell-off'} size={18} color={push.state === 'on' ? color.gold : push.state === 'unavailable' ? color.textDim : color.flare} />
        <View style={{ flex: 1 }}>
          <T v="bodyBold">{t(push.state === 'on' ? 'me.pushOn' : push.state === 'denied' ? 'me.pushOff' : push.state === 'error' ? 'me.pushBroken' : 'me.pushNone')}</T>
          <T v="caption" c={color.textDim}>{push.detail}</T>
        </View>
      </View>
      <View style={{ marginTop: space.sm }}><Reminders /></View>

      <T v="label" c={color.textDim} style={styles.section}>{t('me.safety')}</T>
      <View style={{ gap: space.sm }}>
        <Button kind="ghost" icon="shield" label={t('me.safetyNumbers')} onPress={() => router.push('/safety')} />
        <Button kind="ghost" icon="message-square" label={t('me.contactUs')} onPress={() => router.push('/account/requests')} />
        <View style={styles.wrap}>
          <Tag label={t('landing.terms')} onPress={() => router.push('/legal/terms')} />
          <Tag label={t('landing.privacy')} onPress={() => router.push('/legal/privacy')} />
        </View>
      </View>

      <T v="label" c={color.textDim} style={styles.section}>{t('me.help')}</T>
      <T v="caption" c={color.textDim} style={{ marginBottom: space.md }}>{t('me.helpBody')}</T>
      {Platform.OS !== 'web' ? (
        <View style={{ gap: space.xs }}>
          <Button kind="ghost" icon="star" label={t('review.rate')} onPress={() => void openStorePage()} />
          <T v="caption" c={color.textMute}>{t('review.rateBody')}</T>
        </View>
      ) : null}
      <Button kind="ghost" icon="life-buoy" label={t('me.shareDiagnostics')} busy={busy === 'diagnostics'} onPress={shareDiagnostics} />
      <T v="caption" c={color.textMute} selectable style={{ marginTop: space.md }}>{t('me.version', { build: buildLabel })}</T>

      {!live && (
        <>
          <T v="label" c={color.textDim} style={styles.section}>{t('me.prototype')}</T>
          <T v="caption" c={color.textDim} style={{ marginBottom: space.md }}>{t('me.prototypeBody')}</T>
          <HoldButton tone="flare" label={t('me.resetDemo')} onComplete={reset} busy={resetting} />
        </>
      )}

      <Sheet
        visible={sheet === 'delete'}
        onClose={() => setSheet(null)}
        eyebrow={t('me.deleteEyebrow')}
        title={t('me.deleteTitle')}
        body={t('me.deleteBody')}
      >
        {accountError ? <ErrorText text={accountError} /> : null}
        <HoldButton tone="flare" label={t('me.deleteHold')} busy={busy === 'delete'} onComplete={() => leave('delete')} />
        <Button kind="ghost" label={t('me.keepAccount')} onPress={() => setSheet(null)} />
      </Sheet>

      <Sheet
        visible={sheet === 'sign_out'}
        onClose={() => setSheet(null)}
        eyebrow={t('me.signOut')}
        title={t('me.signOutTitle')}
        body={t('me.signOutBody', { how: account?.email ? maskEmail(account.email) : account?.phone ? maskPhone(account.phone) : t('me.yourEmailOrNumber') })}
      >
        {accountError ? <ErrorText text={accountError} /> : null}
        <Button kind="danger" label={t('me.signOut')} busy={busy === 'sign_out'} onPress={() => leave('sign_out')} />
        <Button kind="ghost" label={t('me.staySignedIn')} onPress={() => setSheet(null)} />
      </Sheet>
      </>} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  duo: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  section: { marginTop: space.x3, marginBottom: space.md },
  panel: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg },
  selfLove: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.goldDeep, borderRadius: radius.card, backgroundColor: color.goldWash, padding: space.lg },
});
