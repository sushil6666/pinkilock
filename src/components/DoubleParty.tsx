/**
 * The four people on a double (docs/build-plan.md F3), as two sides: mine first, theirs second.
 * Each person shows whether their pinky is out (before the lock) or whether they checked in
 * (after it). Names and portraits only: what anyone else chose is never shown.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { friendOn, onAskersSide, otherSide } from '../domain/invites';
import type { Invite } from '../domain/types';
import { usePerson } from '../state/store';
import { color, radius, space } from '../theme/tokens';
import { Portrait } from './Portrait';
import { T } from './ui/T';

interface Props {
  invite: Invite;
  meId: string;
  /** What the marks mean: pinkies before the lock, check-ins after it, nothing for history. */
  show: 'pinkies' | 'checkins' | 'none';
}

export function DoubleParty({ invite, meId, show }: Props) {
  const mine = [meId, friendOn(invite, meId)!];
  const theirs = otherSide(invite, meId);
  const askers = onAskersSide(invite, meId);
  return (
    <View style={styles.box}>
      <Side label={askers ? 'Your side, asking' : 'Your side'} ids={mine} invite={invite} meId={meId} show={show} />
      <View style={styles.cross}><T v="label" c={color.pink}>×</T></View>
      <Side label={askers ? 'Asked' : 'Asking'} ids={theirs} invite={invite} meId={meId} show={show} />
    </View>
  );
}

function Side({ label, ids, invite, meId, show }: { label: string; ids: string[]; invite: Invite; meId: string; show: Props['show'] }) {
  return (
    <View style={{ flex: 1, gap: space.sm }}>
      <T v="label" c={color.textDim} numberOfLines={1}>{label}</T>
      {ids.map((id) => <Person key={id} id={id} invite={invite} meId={meId} show={show} />)}
    </View>
  );
}

function Person({ id, invite, meId, show }: { id: string; invite: Invite; meId: string; show: Props['show'] }) {
  const person = usePerson(id);
  const me = id === meId;
  const name = me ? 'You' : person?.name ?? 'Someone';
  // The asker's pinky is the seal: it is out exactly when the plan is locked.
  const pinky = (invite.pinkies ?? []).includes(id) || (id === invite.fromId && invite.status !== 'sent' && invite.status !== 'half_locked');
  const done = show === 'pinkies' ? pinky : show === 'checkins' ? invite.checkIns.includes(id) : false;
  // Short, to fit half a phone's width; the full words go to screen readers.
  const what = show === 'pinkies' ? (done ? 'pinky out' : id === invite.fromId ? 'seals last' : 'not yet')
    : show === 'checkins' ? (done ? 'checked in' : 'not yet') : '';
  const said = show === 'pinkies' ? (done ? 'pinky out' : id === invite.fromId ? 'seals it last' : 'pinky not out yet')
    : show === 'checkins' ? (done ? 'checked in' : 'not checked in yet') : '';
  return (
    <Pressable
      accessibilityRole={!me && person ? 'button' : undefined}
      accessibilityLabel={said ? `${name}: ${said}` : name}
      disabled={me || !person}
      onPress={() => router.push(`/profile/${id}`)}
      style={styles.person}
    >
      {person ? <Portrait name={person.name} palette={person.palette} glyph={person.glyph} size={32} /> : <View style={styles.blank} />}
      <View style={{ flex: 1 }}>
        <T v="bodyBold" numberOfLines={1}>{name}</T>
        {what ? <T v="caption" c={done ? color.gold : color.textDim} numberOfLines={1}>{what}</T> : null}
      </View>
      {show !== 'none' && <Feather name={done ? 'check-circle' : 'circle'} size={16} color={done ? color.gold : color.textMute} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: space.sm, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.md },
  cross: { justifyContent: 'center', paddingTop: space.lg },
  person: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  blank: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.line },
});
