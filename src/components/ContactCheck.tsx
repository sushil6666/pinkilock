/**
 * Contact handles in the app (D077, D078):
 * - `HandlePreview`: under a handle field, what others will get (the stored form) with a "Check it"
 *   link that opens the account, or why it is not a valid handle, before anything is saved.
 * - `ContactPanel`: my handle on the Me tab. Verified or not, "Check it", "Verify it is yours"
 *   (a code to send from that account to Pinkilock), flags from people it did not work for, and
 *   changing it.
 * - `VerifiedTick`: the tick beside a proved handle.
 */
import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { contactKindOf, contactKindsFor } from '../domain/contacts';
import { AppError } from '../domain/errors';
import { PROVABLE_KINDS, checkContact, contactLink, proofLink } from '../domain/profile';
import type { ContactCheck, ContactKind } from '../domain/types';
import { t, tMaybe } from '../i18n';
import { quiet } from '../lib/log';
import { shown } from '../lib/report';
import { backend } from '../services';
import { useStore } from '../state/store';
import { color, radius, space, type } from '../theme/tokens';
import { Button } from './ui/Button';
import { Chip } from './ui/Chip';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

const open = (url: string) => Linking.openURL(url).catch(quiet('contact.open'));

/** The stored form, or the error the server would give. */
function preview(kind: string, handle: string, country: string): { handle: string } | { error: string } {
  try {
    return { handle: checkContact(kind, handle, country) };
  } catch (e) {
    return { error: e instanceof AppError ? tMaybe(`errors.${e.code}`) ?? e.message : String(e) };
  }
}

function CheckItLink({ kind, handle }: { kind: string; handle: string }) {
  const url = contactLink(kind, handle);
  if (!url) return null;
  return (
    <Pressable accessibilityRole="link" accessibilityLabel={t('contact.checkIt')} accessibilityHint={t('contact.checkItHint', { kind })} hitSlop={10} onPress={() => open(url)} style={styles.link}>
      <T v="label" c={color.gold}>{t('contact.checkIt')}</T>
      <Feather name="external-link" size={13} color={color.gold} />
    </Pressable>
  );
}

export function HandlePreview({ kind, handle, country }: { kind: string; handle: string; country: string }) {
  if (handle.trim().length < 2) return null;
  const p = preview(kind, handle, country);
  if ('error' in p) return <T v="caption" c={color.flare}>{p.error}</T>;
  return (
    <View style={styles.previewRow}>
      <T v="caption" c={color.textDim} style={{ flexShrink: 1 }}>{t('contact.showsAs', { handle: p.handle })}</T>
      <CheckItLink kind={kind} handle={p.handle} />
    </View>
  );
}

export function VerifiedTick({ small }: { small?: boolean }) {
  return (
    <View style={styles.tick} accessible accessibilityLabel={t('contact.verified')} accessibilityHint={t('contact.verifiedHint')}>
      <Feather name="check-circle" size={small ? 12 : 14} color={color.gold} />
      <T v="caption" c={color.gold}>{t('contact.verified')}</T>
    </View>
  );
}

export function ContactPanel() {
  const contact = useStore((s) => s.myContact);
  const me = useStore((s) => s.me);
  const updateMe = useStore((s) => s.updateMe);
  const refreshContact = useStore((s) => s.refreshContact);
  const [flags, setFlags] = useState(0);
  const [check, setCheck] = useState<ContactCheck | null>(null);
  const [editing, setEditing] = useState(false);
  const [kind, setKind] = useState<ContactKind>(contact?.kind ?? 'Instagram');
  const [handle, setHandle] = useState(contact?.handle ?? '');
  const [busy, setBusy] = useState<'verify' | 'save' | null>(null);
  const [error, setError] = useState('');
  const country = me?.country ?? 'IN';

  useEffect(() => {
    backend.myContactFlags().then(setFlags, quiet('contact.flags'));
  }, [contact?.handle]);

  // While a code is out, look for it every few seconds (the mock answers on its own).
  useEffect(() => {
    if (!check || contact?.verified) return;
    const started = Date.now();
    const timer: ReturnType<typeof setInterval> = setInterval(() => {
      if (Date.now() - started > 30 * 60_000) return clearInterval(timer);
      refreshContact().catch(quiet('contact.refresh'));
    }, 5000);
    return () => clearInterval(timer);
  }, [check, contact?.verified, refreshContact]);

  const verify = async () => {
    setBusy('verify');
    setError('');
    try {
      const c = await backend.startContactCheck();
      setCheck(c);
      if (c.kind === 'WhatsApp') open(proofLink(c.kind, c.to, c.code));
    } catch (e) {
      setError(shown(e, '/(tabs)/me'));
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    setBusy('save');
    setError('');
    try {
      await updateMe({ contactKind: kind, contactHandle: handle.trim() });
      setEditing(false);
      setCheck(null);
    } catch (e) {
      setError(shown(e, '/(tabs)/me'));
    } finally {
      setBusy(null);
    }
  };

  const phoneKind = !!contactKindOf(kind)?.phone;
  const provable = !!contact && PROVABLE_KINDS.includes(contact.kind);

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.panel}>
        <Feather name="lock" size={18} color={color.pink} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.previewRow}>
            <T v="label" c={color.textMute}>{contact?.kind ?? t('reveal.contact')}</T>
            {contact?.verified ? <VerifiedTick small /> : contact ? <T v="caption" c={color.textMute}>{t('contact.notVerified')}</T> : null}
          </View>
          <T v="heading" selectable>{contact?.handle ?? t('me.notSet')}</T>
          {contact && <CheckItLink kind={contact.kind} handle={contact.handle} />}
        </View>
        {!editing && (
          <Button kind="quiet" label={t('contact.change')} onPress={() => { setKind(contact?.kind ?? 'Instagram'); setHandle(contact?.handle ?? ''); setEditing(true); }} />
        )}
      </View>

      {flags > 0 && (
        <View style={[styles.note, { borderColor: color.flare }]}>
          <Feather name="alert-triangle" size={16} color={color.flare} />
          <T v="caption" c={color.text} style={{ flex: 1 }}>{t('contact.flags', { count: flags })}</T>
        </View>
      )}

      {editing && (
        <View style={[styles.note, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={styles.wrap}>
            {contactKindsFor(country).map((k) => <Chip key={k.kind} label={k.kind} selected={kind === k.kind} onPress={() => setKind(k.kind as ContactKind)} />)}
          </View>
          <TextInput value={handle} onChangeText={setHandle} maxLength={60} autoCapitalize="none" autoCorrect={false} keyboardType={phoneKind ? 'phone-pad' : 'default'}
            style={styles.input} placeholderTextColor={color.textMute} placeholder={t(phoneKind ? 'onboarding.phonePlaceholder' : 'onboarding.handlePlaceholder', { dial: '91' })}
            accessibilityLabel={t('onboarding.handleLabel', { kind })} />
          <HandlePreview kind={kind} handle={handle} country={country} />
          <View style={styles.wrap}>
            <Button label={t('contact.save')} icon="check" busy={busy === 'save'} disabled={'error' in preview(kind, handle, country)} onPress={save} />
            <Button kind="quiet" label={t('common.cancel')} onPress={() => setEditing(false)} />
          </View>
        </View>
      )}

      {!editing && contact && !contact.verified && (
        provable ? (
          check ? (
            <View style={[styles.note, { flexDirection: 'column', alignItems: 'stretch' }]}>
              <T v="caption" c={color.textDim}>
                {check.kind === 'WhatsApp' ? t('contact.codeHint', { handle: contact.handle }) : t('contact.codeHintInstagram', { handle: contact.handle, to: check.to })}
              </T>
              <T v="display" c={color.gold} selectable center accessibilityLabel={check.code.split('').join(' ')}>{check.code}</T>
              <Button kind="ghost" icon="send" label={t('contact.open', { kind: check.kind })} onPress={() => open(proofLink(check.kind, check.to, check.code))} />
              <T v="caption" c={color.textMute} center>{t('contact.waiting')}</T>
            </View>
          ) : (
            <View style={{ gap: space.xs }}>
              <Button kind="ghost" icon="shield" label={t('contact.verify')} busy={busy === 'verify'} onPress={verify} />
              <T v="caption" c={color.textDim}>{t('contact.verifyWhy')}</T>
            </View>
          )
        ) : (
          <T v="caption" c={color.textMute}>{t('contact.cantVerify')}</T>
        )
      )}
      {error ? <ErrorText text={error} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg },
  note: { flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md },
  previewRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', paddingVertical: 2 },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  input: { ...type.body, color: color.text, borderWidth: 1, borderColor: color.line, borderRadius: radius.chip, backgroundColor: color.surfaceHi, paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 48 },
});
