/**
 * The invitation as a ticket: status, the idea in display type, when and where, the one-line
 * note, then who it is with. Used in lists (compact) and on the invite screen (full).
 */
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { ideaOf, KIND_LABEL } from '../domain/ideas';
import { friendOn, isDouble, otherId } from '../domain/invites';
import { usePerson, useStore } from '../state/store';
import { shortCountdown, whenLabel, zoneNote } from '../domain/time';
import { zoneOfCity } from '../domain/countries';
import type { Invite, Profile } from '../domain/types';
import { elevation } from '../theme/elevation';
import { color, radius, space } from '../theme/tokens';
import { Portrait } from './Portrait';
import { TrustBadge } from './TrustBadge';
import { T } from './ui/T';
import { t } from '../i18n';

export function statusLine(i: Invite, meId: string, name: string, now: number): { text: string; tone: string } {
  const upper = name.toUpperCase();
  const left = shortCountdown(i.expiresAt, now);
  if (isDouble(i)) {
    const out = i.pinkies?.length ?? 0;
    switch (i.status) {
      case 'sent':
      case 'half_locked':
        if (i.fromId === meId) return out >= 3 ? { text: t('status.allPinkies'), tone: color.pink } : { text: t('status.doubleIn', { out }), tone: color.textDim };
        return i.pinkies?.includes(meId)
          ? { text: t('status.pinkyOutOf', { out }), tone: color.textDim }
          : { text: t('status.doubleLeft', { left }), tone: color.pink };
      case 'flaked':
        return { text: t(i.flakedBy === meId ? 'status.youFlaked' : 'status.fellThrough'), tone: color.flare };
      case 'declined':
        return { text: t(i.declinedBy === meId ? 'status.youPulledOut' : 'status.doubleOff'), tone: color.textMute };
      case 'kept':
        return i.checkIns.includes(meId) ? { text: t('status.kept'), tone: color.gold } : { text: t('status.youMissed'), tone: color.flare };
    }
  }
  switch (i.status) {
    case 'sent':
      return i.toId === meId
        ? { text: t('status.askedYou', { left }), tone: color.pink }
        : { text: t('status.waitingOn', { name: upper, left }), tone: color.textDim };
    case 'half_locked':
      return i.firstPinkyBy === meId ? { text: t('status.yourPinkyOut', { name: upper }), tone: color.textDim } : { text: t('status.theirPinkyOut', { name: upper }), tone: color.pink };
    case 'locked':
      return { text: t('status.locked'), tone: color.pink };
    case 'kept':
      return { text: t('status.kept'), tone: color.gold };
    case 'flaked':
      return { text: i.flakedBy === meId ? t('status.youFlaked') : t('status.theyFlaked', { name: upper }), tone: color.flare };
    case 'declined':
      return { text: i.declinedBy === meId ? t(i.fromId === meId ? 'status.youTookBack' : 'status.youPassed') : t('status.theyPassed', { name: upper }), tone: color.textMute };
    case 'expired':
      return { text: t('status.expired'), tone: color.textMute };
    case 'ended':
      return { text: t('status.ended'), tone: color.textMute };
  }
}

interface Props {
  invite: Invite;
  meId: string;
  other: Profile | undefined;
  now: number;
  onPress?: () => void;
  compact?: boolean;
}

export function InviteCard({ invite, meId, other, now, onPress, compact }: Props) {
  const idea = ideaOf(invite.ideaId);
  const name = other?.name ?? t('common.someone');
  const double = isDouble(invite);
  const myFriend = usePerson(double ? friendOn(invite, meId) ?? undefined : undefined);
  const theirFriend = usePerson(double ? friendOn(invite, otherId(invite, meId)) ?? undefined : undefined);
  const who = !double ? t(invite.fromId === meId ? 'ticket.youAsked' : 'ticket.theyAsked', { name })
    : t('ticket.doubleWho', { mine: myFriend?.name ?? t('ticket.yourDuo'), name, theirs: theirFriend?.name ?? t('ticket.theirDuo') });
  const status = statusLine(invite, meId, name, now);
  const myCity = useStore((st) => st.me?.city);
  const zoneLine = compact ? null : idea.kind === 'irl'
    ? zoneNote(invite.startsAt, zoneOfCity(myCity), { city: myCity ?? '' })
    : zoneNote(invite.startsAt, zoneOfCity(other?.city), { name });
  const closed = invite.status === 'declined' || invite.status === 'expired' || invite.status === 'ended';
  const hot = status.tone === color.pink;

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={t(double ? 'ticket.spokenDouble' : 'ticket.spoken', { idea: idea.title, who, name, when: whenLabel(invite.startsAt, now), status: status.text })}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.card, hot && styles.hot, !compact && elevation('raised'), closed && { opacity: 0.55 }, pressed && { backgroundColor: color.surfaceHi }]}
    >
      <View style={styles.top}>
        <T v="label" c={status.tone} style={{ flex: 1 }} numberOfLines={1}>{status.text}</T>
        <T v="label" c={color.textMute}>{compact ? t('ticket.minutes', { minutes: invite.minutes }) : t('ticket.kindMinutes', { kind: KIND_LABEL[idea.kind], minutes: invite.minutes })}</T>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.md }}>
        <T style={{ fontSize: compact ? 28 : 40, lineHeight: compact ? 36 : 50 }} maxFontSizeMultiplier={1}>{idea.emoji}</T>
        <View style={{ flex: 1, gap: 4 }}>
          <T v={compact ? 'heading' : 'title'}>{idea.title}</T>
          <View style={styles.meta}>
            <Feather name="clock" size={14} color={color.textDim} />
            <T v="caption" c={color.textDim}>{whenLabel(invite.startsAt, now)}</T>
          </View>
          {zoneLine ? (
            <View style={styles.meta}>
              <Feather name="globe" size={14} color={color.textDim} />
              <T v="caption" c={color.textDim}>{zoneLine}</T>
            </View>
          ) : null}
          {!compact && (
            <View style={styles.meta}>
              <Feather name={idea.kind === 'irl' ? 'map-pin' : 'smartphone'} size={14} color={color.textDim} />
              <T v="caption" c={color.textDim} style={{ flex: 1 }}>{invite.place}</T>
            </View>
          )}
        </View>
      </View>

      {/* Their own words, in a hand, not in the app's type. */}
      {!compact && invite.note ? <T v="hand" style={styles.note}>{invite.note}</T> : null}

      <View style={styles.perforation}>
        {Array.from({ length: 28 }, (_, k) => <View key={k} style={styles.dash} />)}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        {other && <Portrait name={other.name} palette={other.palette} glyph={other.glyph} size={compact ? 36 : 44} />}
        <View style={{ flex: 1 }}>
          <T v="bodyBold" numberOfLines={1}>{who}</T>
          {!compact && other && <T v="caption" c={color.textDim}>{t('common.ageArea', { age: other.age, area: other.area })}</T>}
        </View>
        {other && <TrustBadge person={other} brief />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, padding: space.lg, gap: space.md },
  hot: { borderColor: color.pink },
  top: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  note: { borderLeftWidth: 3, borderLeftColor: color.pink, paddingLeft: space.md },
  perforation: { flexDirection: 'row', justifyContent: 'space-between', overflow: 'hidden', marginHorizontal: -space.lg, paddingHorizontal: space.lg },
  dash: { width: 6, height: 1.5, backgroundColor: color.line },
});

export { otherId };
