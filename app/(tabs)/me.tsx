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
import { Fold } from '@/components/ui/Fold';
import { Entry } from '@/components/ui/Entry';
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

      {me.tagline ? <T v="heading" style={{ marginTop: space.xl }}>{me.tagline}</T> : null}
      {lineReview ? (
        <T v="caption" c={lineReview.status === 'rejected' ? color.flare : color.textDim} style={{ marginTop: space.sm }}>
          {t(lineReview.status === 'rejected' ? 'me.lineRejected' : 'me.lineChecking', { line: lineReview.text })}
        </T>
      ) : null}

      <View style={{ marginTop: space.lg }} />
      <Fold icon="award" title={t('record.label')}>
        <YourRecord />
      </Fold>
      <Fold icon="map-pin" title={t('me.whereTitle')} value={me.area || me.city} open={!!move}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1 }}>
            <T v="bodyBold">{me.area ? t('profile.areaCity', { area: me.area, city: me.city }) : me.city}</T>
            {moved && !move ? <T v="caption" c={color.gold}>{moved}</T> : null}
          </View>
          <Tag label={t(move ? 'common.cancel' : 'me.move')} tone={move ? color.textDim : color.gold}
            onPress={() => { setMoved(''); setMoveError(''); setMove(move ? null : { city: me.city, area: me.area }); }} />
        </View>
        {move ? (
          <View style={{ gap: space.lg, marginTop: space.sm }}>
            <T v="caption" c={color.textDim}>{t('me.moveBody')}</T>
            <WherePicker early={!!me.pinkGold} city={move.city} area={move.area} onCity={(city) => setMove((m) => m && { ...m, city })} onArea={(area) => setMove((m) => m && { ...m, area })} />
            {moveError ? <ErrorText text={moveError} /> : null}
            <Button icon="map-pin" label={t('me.moveSave', { city: move.city })} onPress={saveMove} busy={busy === 'move'}
              disabled={(move.city === me.city && move.area === me.area) || !areaOk(move.city, move.area)} />
          </View>
        ) : null}
      </Fold>

      <Fold icon="tag" title={t('fold.tags')} value={me.vibes.join(', ') || undefined}>
        {VIBE_GROUPS.map((group) => (
          <View key={group.label} style={{ gap: space.sm, marginTop: space.md }}>
            <T v="label" c={color.textDim}>{group.label}</T>
            <View style={styles.wrap}>
              {group.vibes.map((v) => <Chip key={v} label={v} selected={me.vibes.includes(v)} onPress={() => toggleVibe(v)} />)}
            </View>
          </View>
        ))}
        {error ? <ErrorText text={error} /> : null}
      </Fold>

      <Fold icon="coffee" title={t('fold.upFor')} value={t('fold.picked', { count: me.ideaIds.length })}>
        {KIND_ORDER.map((kind) => (
          <View key={kind} style={{ gap: space.sm, marginTop: space.md }}>
            <T v="label" c={color.textMute}>{KIND_LABEL[kind]}</T>
            {pickerIdeas(IDEAS.filter((i) => offeredIn(i.id, me.country, me.city) || me.ideaIds.includes(i.id)), kind).map((i) => (
              <IdeaChip key={i.id} idea={i} localTo={me.city} selected={me.ideaIds.includes(i.id)} onPress={() => toggleIdea(i.id)} />
            ))}
          </View>
        ))}
        {error ? <ErrorText text={error} /> : null}
      </Fold>

      <Fold icon="clock" title={t('fold.free')} value={t('fold.picked', { count: (me.freeWindows ?? []).length })}>
        <View style={styles.wrap}>
          {FREE_WINDOWS.map((w) => {
            const on = (me.freeWindows ?? []).includes(w.id);
            return <Chip key={w.id} label={w.label} selected={on} onPress={() => saveAvailability(on ? (me.freeWindows ?? []).filter((x) => x !== w.id) : [...(me.freeWindows ?? []), w.id]).catch((e) => setError(shown(e, '/(tabs)/me')))} />;
          })}
        </View>
        <T v="caption" c={color.textDim}>{t('me.freeBody')}</T>
      </Fold>

      </>} right={<>
      <Entry tone="gold" icon={<Feather name="heart" size={20} color={color.gold} />} title={t('selfLove.meTitle')} spoken={t('selfLove.meOpen')} onPress={() => router.push('/self-love')} />
      <FriendsEntry />
      <TalkEntry />
      <ExpertsEntry />
      <WalletEntry />
      <PinkGoldEntry wallet={myWallet} />
      <SpicyEntry />

      <View style={{ marginTop: space.lg }} />
      <Fold icon="users" title={t('fold.duo')} value={duo ? duo.name : t('fold.none')}>
        {duo ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Portrait name={duo.name} palette={duo.palette} glyph={duo.glyph} faceUrl={duo.faceUrl} size={40} />
            <View style={{ flex: 1 }}>
              <T v="bodyBold">{t('me.youAnd', { name: duo.name })}</T>
              <T v="caption" c={color.textDim}>{t('me.duoBody')}</T>
            </View>
            <Tag label={t('me.leave')} tone={color.textDim} onPress={() => duoStep('leave_duo', () => leaveDuo())} />
          </View>
        ) : (
          <>
            <T c={color.textDim}>{t('me.duoPitch')}</T>
            <Button kind="ghost" icon="user-plus" label={t('me.makeDuo')} onPress={askDuo} busy={busy === 'duo'} />
          </>
        )}
        {duoError ? <ErrorText text={duoError} /> : null}
        {copied === 'duo' && !duo ? <T v="caption" c={color.gold}>{t('me.duoCopied')}</T> : null}
      </Fold>

      <Fold icon="award" title={t('fold.vouches')} value={me.vouchCount ? String(me.vouchCount) : t('fold.none')}>
        <Vouches person={me} />
        <Button kind="ghost" icon="users" label={t('me.askVouch')} onPress={askVouch} />
        {copied === 'vouch' ? <T v="caption" c={color.gold}>{t('me.vouchCopied')}</T> : null}
      </Fold>

      <Fold icon="unlock" title={t('fold.unlocks')}>
        <ContactPanel />
        <MyPhotos />
      </Fold>

      <Fold icon={keeps ? 'user-check' : 'user'} title={t('me.account')} value={keeps ? [account?.email && maskEmail(account.email), account?.phone && maskPhone(account.phone)].filter(Boolean).join(' · ') : t('me.noLink')} open={!!accountError && !sheet}>
        <T v="caption" c={color.textDim}>{t(keeps ? 'me.linkUse' : 'me.linkWhy')}</T>
        {!account?.email ? <Button kind="ghost" icon="mail" label={t('me.addEmail')} onPress={() => router.push({ pathname: '/account/sign-in', params: { mode: 'link', kind: 'email' } })} /> : null}
        {!account?.phone ? <Button kind="ghost" icon="phone" label={t('me.addPhone')} onPress={() => router.push({ pathname: '/account/sign-in', params: { mode: 'link', kind: 'phone' } })} /> : null}
        {keeps ? <Button kind="ghost" icon="log-out" label={t('me.signOut')} onPress={() => setSheet('sign_out')} /> : null}
        <Button kind="ghost" icon="slash" label={t('me.blocked')} onPress={() => router.push('/account/blocked')} />
        <Button kind="ghost" icon="download" label={t('me.download')} busy={busy === 'export'} onPress={exportData} />
        <Button kind="danger" icon="trash-2" label={t('me.delete')} onPress={() => setSheet('delete')} />
        {accountError && !sheet ? <ErrorText text={accountError} /> : null}
      </Fold>

      <Fold icon={push.state === 'on' ? 'bell' : 'bell-off'} title={t('me.notifications')} value={t(push.state === 'on' ? 'me.pushOn' : push.state === 'denied' ? 'me.pushOff' : push.state === 'error' ? 'me.pushBroken' : 'me.pushNone')}>
        <T v="caption" c={color.textDim}>{push.detail}</T>
        <T v="bodyBold" style={{ marginTop: space.sm }}>{t(live ? 'me.connected' : 'me.demoMode')}</T>
        <T v="caption" c={color.textDim}>{t(live ? 'me.connectedBody' : 'me.demoBody')}</T>
        <Reminders />
      </Fold>

      <View style={{ marginTop: space.md }}>
        <LanguagePicker look="row" state={openCities().find((c) => c.name === me.city)?.state} />
      </View>

      {/* Safety stays on screen, never behind an arrow. */}
      <View style={{ marginTop: space.md }}>
        <Button kind="ghost" icon="shield" label={t('me.safetyNumbers')} onPress={() => router.push('/safety')} />
      </View>

      <Fold icon="life-buoy" title={t('me.help')}>
        <T v="caption" c={color.textDim}>{t('me.helpBody')}</T>
        <Button kind="ghost" icon="message-square" label={t('me.contactUs')} onPress={() => router.push('/account/requests')} />
        {Platform.OS !== 'web' ? (
          <>
            <Button kind="ghost" icon="star" label={t('review.rate')} onPress={() => void openStorePage()} />
            <T v="caption" c={color.textMute}>{t('review.rateBody')}</T>
          </>
        ) : null}
        <Button kind="ghost" icon="file-text" label={t('me.shareDiagnostics')} busy={busy === 'diagnostics'} onPress={shareDiagnostics} />
        <View style={styles.wrap}>
          <Tag label={t('landing.terms')} onPress={() => router.push('/legal/terms')} />
          <Tag label={t('landing.privacy')} onPress={() => router.push('/legal/privacy')} />
        </View>
        <T v="caption" c={color.textMute} selectable>{t('me.version', { build: buildLabel })}</T>
      </Fold>

      {!live && (
        <Fold icon="tool" title={t('me.prototype')}>
          <T v="caption" c={color.textDim}>{t('me.prototypeBody')}</T>
          <HoldButton tone="flare" label={t('me.resetDemo')} onComplete={reset} busy={resetting} />
        </Fold>
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
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});
