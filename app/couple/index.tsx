/**
 * Couple mode (D120): the shared corner for two people who matched. Before it is on: the matches
 * I could start it with, or an ask waiting on one of us. On: days together, this week's challenge
 * with both ticks and the streak, what is coming up (birthdays, the first date, day counts), and our
 * date list, where an idea becomes an ordinary pinky promise. Only the two of us see any of it.
 */
import { Fold } from '@/components/ui/Fold';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useCouple } from '@/components/Couple';
import { Portrait } from '@/components/Portrait';
import { dayTime } from '@/components/SelfLove';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Columns } from '@/components/ui/Columns';
import { ErrorText } from '@/components/ui/ErrorText';
import { HoldButton } from '@/components/ui/HoldButton';
import { inputStyle } from '@/components/ui/input';
import { Screen } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { T } from '@/components/ui/T';
import {
  CHALLENGE_EMOJI, COUPLE_IDEAS_MAX, COUPLE_STREAK_BADGE, DAY_EMOJI, DAY_KINDS, coupleStreak, daysTogether, parseDay, thisWeek, upcoming,
  type DayKind, type Upcoming,
} from '@/domain/couple';
import { ideaOf, ideasFor } from '@/domain/ideas';
import type { Profile } from '@/domain/types';
import { haptic } from '@/lib/haptics';
import { aria } from '@/lib/web';
import { backend } from '@/services';
import { usePerson, useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { fmtDayMonth, t } from '@/i18n';

const ROUTE = '/couple';
const IDEAS_SHOWN = 8;

const panel = { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md } as const;

export default function CouplePage() {
  const me = useStore((s) => s.me);
  const profiles = useStore((s) => s.profiles);
  const { state, loaded, error, busy, run } = useCouple(ROUTE);
  const [ending, setEnding] = useState(false);
  if (!me) return null;

  const partner = profiles.find((p) => p.id === state.partnerId);
  const header = (
    <View style={{ gap: space.sm }}>
      <T v="label" c={color.pink}>{t('couple.eyebrow')}</T>
      <T v="display">{state.status === 'on' && partner ? t('couple.youAnd', { name: partner.name }) : t('couple.title')}</T>
      <View style={styles.privateRow}>
        <Feather name="lock" size={14} color={color.textDim} style={{ marginTop: 2 }} />
        <T v="caption" c={color.textDim} style={{ flex: 1 }}>{t('couple.private')}</T>
      </View>
    </View>
  );

  if (!loaded) return <Screen back="back" title={t('couple.eyebrow')}>{header}<ErrorText text={error} /></Screen>;

  if (state.status !== 'on' || !partner) {
    return (
      <Screen back="back" title={t('couple.eyebrow')} desk="form">
        <View style={{ gap: space.xl }}>
          {header}
          <NotOnYet state={state.status} partner={partner} matches={state.matches.map((id) => profiles.find((p) => p.id === id)).filter((p): p is Profile => !!p)}
            busy={busy} run={run} />
          <ErrorText text={error} />
        </View>
      </Screen>
    );
  }

  const week = thisWeek(state);
  const streak = coupleStreak(state.weeks, state.today);
  const days = daysTogether(state);

  const left = (
    <>
      {header}
      <Animated.View entering={FadeInDown.duration(360)} style={styles.hero}>
        <View style={styles.pair}>
          <Portrait {...me} size={56} />
          <Portrait {...partner} size={56} style={{ marginLeft: -16 }} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="title">{t('couple.together', { count: days })}</T>
          {state.since ? <T v="caption" c={color.textDim}>{t('couple.sinceDate', { date: fmtDayMonth(state.since) })}</T> : null}
        </View>
      </Animated.View>

      {week ? (
        <View style={[panel, styles.challenge]}>
          <T v="label" c={color.gold}>{t('couple.weekLabel')}</T>
          <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
            <T style={{ fontSize: 30, lineHeight: 38 }} maxFontSizeMultiplier={1}>{CHALLENGE_EMOJI[week.challenge]}</T>
            <T v="heading" style={{ flex: 1 }}>{t(`couple.challenges.${week.challenge}`)}</T>
          </View>
          <T v="caption" c={color.textDim}>{t('couple.weekBody')}</T>
          <View style={styles.ticks}>
            <Tick label={t('couple.you')} done={week.me} />
            <Tick label={partner.name} done={week.them} />
          </View>
          <Button kind={week.me ? 'ghost' : 'primary'} icon={week.me ? 'check' : 'heart'} label={week.me ? t('couple.undo') : t('couple.weDidIt')} busy={busy === 'week'}
            onPress={() => { haptic.success(); run('week', () => backend.coupleChallenge(!week.me)); }} />
          <View style={styles.streak}>
            <View style={[styles.badge, streak >= COUPLE_STREAK_BADGE && styles.badgeOn]}>
              <Feather name="award" size={22} color={streak >= COUPLE_STREAK_BADGE ? color.onGold : color.textMute} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyBold" c={streak >= COUPLE_STREAK_BADGE ? color.gold : color.text}>{streak >= COUPLE_STREAK_BADGE ? t('couple.badgeTitle') : streak ? t('couple.streak', { count: streak }) : t('couple.streakNone')}</T>
              <T v="caption" c={color.textDim}>{streak >= COUPLE_STREAK_BADGE ? t('couple.badge') : t('couple.badgeNext', { count: COUPLE_STREAK_BADGE - streak })}</T>
            </View>
          </View>
        </View>
      ) : null}

      <ComingUp state={state} partner={partner} busy={busy} run={run} />
    </>
  );

  const right = (
    <>
      <DateList state={state} me={me} partner={partner} busy={busy} run={run} />
      <WithFriends partner={partner} />
      <ErrorText text={error} />
      <Button kind="quiet" label={t('couple.endTitle')} onPress={() => setEnding(true)} />
    </>
  );

  return (
    <Screen back="back" title={t('couple.eyebrow')}>
      <Columns gap={space.xl} left={left} right={right} />
      <Sheet visible={ending} onClose={() => setEnding(false)} eyebrow={t('couple.eyebrow')} title={t('couple.endTitle')} body={t('couple.endBody', { name: partner.name })}>
        <HoldButton tone="flare" label={t('couple.endHold')} busy={busy === 'end'} onComplete={() => run('end', () => backend.coupleEnd()).then(() => setEnding(false))} />
        <Button kind="ghost" label={t('couple.keep')} onPress={() => setEnding(false)} />
      </Sheet>
    </Screen>
  );
}

type Run = ReturnType<typeof useCouple>['run'];

function NotOnYet({ state, partner, matches, busy, run }: { state: string; partner?: Profile; matches: Profile[]; busy: string; run: Run }) {
  if (state === 'asked_by_me' && partner) {
    return (
      <View style={panel}>
        <PersonRow person={partner} />
        <T v="heading">{t('couple.askedTitle', { name: partner.name })}</T>
        <T c={color.textDim}>{t('couple.askedBody', { name: partner.name })}</T>
        <Button kind="quiet" label={t('couple.takeBack')} busy={busy === 'end'} onPress={() => run('end', () => backend.coupleEnd())} />
      </View>
    );
  }
  if (state === 'asked_me' && partner) {
    return (
      <View style={[panel, styles.ask]}>
        <PersonRow person={partner} />
        <T v="heading">{t('couple.askedMeTitle', { name: partner.name })}</T>
        <T c={color.textDim}>{t('couple.askedMeBody')}</T>
        <Button icon="heart" label={t('couple.yes')} busy={busy === 'yes'} onPress={() => { haptic.success(); run('yes', () => backend.coupleAnswer(true)); }} />
        <Button kind="ghost" label={t('couple.notNow')} busy={busy === 'no'} onPress={() => run('no', () => backend.coupleAnswer(false))} />
      </View>
    );
  }
  return (
    <View style={{ gap: space.lg }}>
      <T c={color.textDim}>{t('couple.pitch')}</T>
      {matches.length ? matches.map((p) => (
        <View key={p.id} style={panel}>
          <PersonRow person={p} sub={t('couple.matchedWith')} />
          <Button icon="heart" label={t('couple.startWith', { name: p.name })} busy={busy === `ask:${p.id}`} onPress={() => run(`ask:${p.id}`, () => backend.coupleAsk(p.id))} />
        </View>
      )) : (
        <View style={panel}>
          <T>{t('couple.noMatch')}</T>
          <Button kind="ghost" icon="calendar" label={t('couple.seePlans')} onPress={() => router.push('/(tabs)/plans')} />
        </View>
      )}
    </View>
  );
}

function PersonRow({ person, sub }: { person: Profile; sub?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <Portrait {...person} size={48} />
      <View style={{ flex: 1 }}>
        <T v="bodyBold">{person.name}</T>
        {sub ? <T v="caption" c={color.gold}>{sub}</T> : null}
      </View>
    </View>
  );
}

/** A small action under a list row: an icon and a word, a full 44-point target. */
function Mini({ icon, label, onPress, tone = color.textDim, disabled }: { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; tone?: string; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.mini, pressed && { backgroundColor: color.surface }, disabled && { opacity: 0.6 }]}>
      <Feather name={icon} size={16} color={tone} />
      <T v="caption" c={tone} numberOfLines={1}>{label}</T>
    </Pressable>
  );
}

function Tick({ label, done }: { label: string; done: boolean }) {
  return (
    <View style={styles.tick} accessible accessibilityLabel={t(done ? 'couple.tickDone' : 'couple.tickNot', { name: label })}>
      <View style={[styles.tickDot, done && styles.tickOn]}>
        <Feather name={done ? 'check' : 'circle'} size={16} color={done ? color.onGold : color.textMute} />
      </View>
      <T v="caption" c={done ? color.gold : color.textDim} numberOfLines={1}>{label}</T>
    </View>
  );
}

function upcomingLabel(u: Upcoming, partner: Profile): string {
  if (u.kind === 'birthday') return u.mine ? t('couple.upcoming.myBirthday') : t('couple.upcoming.theirBirthday', { name: partner.name });
  if (u.kind === 'first_date') return t('couple.upcoming.firstDate', { count: u.years ?? 1 });
  if (u.kind === 'together') return u.count ? t('couple.upcoming.together', { count: u.count }) : t('couple.upcoming.togetherYears', { count: u.years ?? 1 });
  const kind = t(`couple.kinds.${u.kind}`);
  return u.years ? t('couple.upcoming.yearly', { kind, count: u.years }) : kind;
}

function ComingUp({ state, partner, busy, run }: { state: ReturnType<typeof useCouple>['state']; partner: Profile; busy: string; run: Run }) {
  const [kind, setKind] = useState<DayKind | null>(null);
  const [text, setText] = useState('');
  const [bad, setBad] = useState(false);
  const list = upcoming(state).slice(0, 6);
  const idOf = (u: Upcoming) => state.days.find((d) => d.kind === u.kind && d.mine === !!u.mine && (d.day === u.day || d.day.slice(5) === u.day.slice(5)))?.id;
  const add = async () => {
    const day = parseDay(text);
    setBad(!day);
    if (!day || !kind) return;
    if (await run('day', () => backend.coupleAddDay(kind, day))) {
      setKind(null);
      setText('');
    }
  };
  return (
    <Fold icon="calendar" title={t('couple.daysTitle')} value={list.length ? String(list.length) : undefined}>
      {list.length ? list.map((u) => {
        const label = upcomingLabel(u, partner);
        const mineId = u.mine ? idOf(u) : undefined;
        return (
          <View key={`${u.kind}${u.day}${u.mine ? 'm' : ''}`} style={styles.dayRow}>
            <T style={{ fontSize: 22, lineHeight: 28 }} maxFontSizeMultiplier={1}>{DAY_EMOJI[u.kind]}</T>
            <View style={{ flex: 1 }}>
              <T v="bodyBold">{label}</T>
              <T v="caption" c={u.inDays === 0 ? color.gold : color.textDim}>
                {`${fmtDayMonth(dayTime(u.day))}  ·  ${u.inDays === 0 ? t('couple.today') : t('couple.inDays', { count: u.inDays })}`}
              </T>
            </View>
            {mineId ? (
              <Pressable accessibilityRole="button" accessibilityLabel={t('couple.removeDay', { what: label })} hitSlop={12} disabled={!!busy}
                onPress={() => run('day', () => backend.coupleRemoveDay(mineId))} style={styles.iconBtn}>
                <Feather name="x" size={18} color={color.textMute} />
              </Pressable>
            ) : null}
          </View>
        );
      }) : <T v="caption" c={color.textDim}>{t('couple.daysEmpty')}</T>}

      <T v="label" c={color.textDim} style={{ marginTop: space.sm }}>{t('couple.addDay')}</T>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel={t('couple.dayKind')}>
        {DAY_KINDS.map((k) => <Chip key={k} label={`${DAY_EMOJI[k]} ${t(`couple.kinds.${k}`)}`} selected={kind === k} onPress={() => setKind(k)} />)}
      </View>
      {kind ? (
        <View style={{ gap: space.sm }}>
          <TextInput value={text} onChangeText={(v) => { setText(v); setBad(false); }} placeholder={t('couple.dayPlaceholder')} placeholderTextColor={color.textMute}
            accessibilityLabel={t('couple.dayDate')} keyboardType="numbers-and-punctuation" maxLength={10} style={inputStyle} onSubmitEditing={add} />
          {bad ? <T v="caption" c={color.flare}>{t('couple.dayBad')}</T> : null}
          <Button kind="ghost" icon="plus" label={t('couple.addDay')} busy={busy === 'day'} disabled={!text.trim()} onPress={add} />
        </View>
      ) : null}
    </Fold>
  );
}

function DateList({ state, me, partner, busy, run }: { state: ReturnType<typeof useCouple>['state']; me: Profile; partner: Profile; busy: string; run: Run }) {
  const [more, setMore] = useState(false);
  const open = state.ideas.filter((i) => !i.done);
  const both = open.filter((i) => i.heartMe && i.heartThem);
  const rest = open.filter((i) => !(i.heartMe && i.heartThem));
  const done = state.ideas.filter((i) => i.done);
  const onList = new Set(state.ideas.map((i) => i.ideaId));
  const offered = ideasFor(me.country, me.city).filter((i) => !onList.has(i.id));
  // Ideas either of us put on our cards come first: we already said we are up for them.
  const liked = new Set([...me.ideaIds, ...partner.ideaIds]);
  const ordered = [...offered.filter((i) => liked.has(i.id)), ...offered.filter((i) => !liked.has(i.id))];
  const shown = more ? ordered : ordered.slice(0, IDEAS_SHOWN);
  const full = state.ideas.length >= COUPLE_IDEAS_MAX;

  const row = (i: (typeof state.ideas)[number]) => {
    const idea = ideaOf(i.ideaId);
    const hearts = i.heartMe && i.heartThem ? t('couple.hearts.both') : i.heartMe ? t('couple.hearts.me') : i.heartThem ? t('couple.hearts.them', { name: partner.name }) : t('couple.hearts.none');
    return (
      <View key={i.id} style={[styles.idea, i.heartMe && i.heartThem && !i.done && styles.ideaBoth]}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <T style={{ fontSize: 26, lineHeight: 32 }} maxFontSizeMultiplier={1}>{idea.emoji}</T>
          <View style={{ flex: 1 }}>
            <T v="bodyBold">{idea.title}</T>
            <T v="caption" c={i.heartMe && i.heartThem ? color.pink : color.textDim}>{hearts}</T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={i.heartMe ? t('couple.unheart') : t('couple.heart')} {...aria({ pressed: i.heartMe })} hitSlop={8} disabled={!!busy || i.done}
            onPress={() => { haptic.tick(); run(`idea:${i.id}`, () => backend.coupleIdea(i.id, 'heart')); }} style={styles.iconBtn}>
            <Feather name="heart" size={20} color={i.heartMe ? color.pink : color.textMute} />
          </Pressable>
        </View>
        <View style={styles.ideaActions}>
          {!i.done ? <Mini icon="send" label={t('couple.planIt')} tone={color.gold} onPress={() => router.push({ pathname: '/invite/new', params: { to: partner.id, idea: i.ideaId } })} /> : null}
          <Mini icon={i.done ? 'rotate-ccw' : 'check'} label={i.done ? t('couple.notDone') : t('couple.markDone')} disabled={!!busy}
            onPress={() => run(`done:${i.id}`, () => backend.coupleIdea(i.id, 'done'))} />
          <Mini icon="x" label={t('couple.remove')} disabled={!!busy} onPress={() => run(`rm:${i.id}`, () => backend.coupleIdea(i.id, 'remove'))} />
        </View>
      </View>
    );
  };

  return (
    <Fold icon="heart" accent title={t('couple.listTitle')} value={String(open.length)} open={both.length > 0}>
      <T v="caption" c={color.textDim}>{t('couple.listBody')}</T>
      {both.length ? <T v="label" c={color.pink}>{t('couple.bothWant')}</T> : null}
      {both.map(row)}
      {rest.map(row)}
      {!open.length ? <T v="caption" c={color.textMute}>{t('couple.listEmpty')}</T> : null}

      <T v="label" c={color.textDim} style={{ marginTop: space.sm }}>{t('couple.add')}</T>
      {full ? <T v="caption" c={color.textDim}>{t('couple.listFull')}</T> : (
        <>
          <View style={styles.chips}>
            {shown.map((i) => (
              <Chip key={i.id} label={`${i.emoji} ${i.title}`} disabled={!!busy} onPress={() => { haptic.tick(); run('add', () => backend.coupleAddIdea(i.id)); }} />
            ))}
          </View>
          {!more && ordered.length > IDEAS_SHOWN ? <Button kind="quiet" icon="chevron-down" label={t('couple.more')} onPress={() => setMore(true)} /> : null}
        </>
      )}

      {done.length ? (
        <>
          <T v="label" c={color.gold} style={{ marginTop: space.sm }}>{t('couple.doneTitle', { count: done.length })}</T>
          {done.map(row)}
        </>
      ) : null}
    </Fold>
  );
}

/**
 * Friends, after a match (D123): a double date with both duos (the usual Doubles ask, so every rule
 * still applies), and a nudge to bring a single friend in with my referral link (D118). The friend
 * gift is the referral screen's: the reward comes when the friend joins and counts, never before.
 */
function WithFriends({ partner }: { partner: Profile }) {
  const duo = usePerson(useStore((s) => s.duoId) ?? undefined);
  const canDouble = !!duo && !!partner.hasDuo;
  return (
    <Fold icon="users" title={t('couple.friendsLabel')}>
      <View style={styles.friendRow}>
        <Feather name="users" size={20} color={color.gold} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyBold">{t('couple.doubleTitle')}</T>
          <T v="caption" c={color.textDim}>
            {canDouble ? t('couple.doubleBody', { friend: duo!.name, name: partner.name }) : !duo ? t('couple.doubleNoDuo', { name: partner.name }) : t('couple.doubleTheirDuo', { name: partner.name })}
          </T>
        </View>
      </View>
      {canDouble ? (
        <Button icon="users" label={t('couple.doublePlan')} onPress={() => router.push({ pathname: '/invite/new', params: { to: partner.id, double: '1' } })} />
      ) : !duo ? (
        <Button kind="ghost" icon="user-plus" label={t('couple.doublePick')} onPress={() => router.push('/(tabs)/me')} />
      ) : null}
      <View style={[styles.friendRow, styles.friendSplit]}>
        <Feather name="gift" size={20} color={color.pink} />
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyBold">{t('couple.giftTitle')}</T>
          <T v="caption" c={color.textDim}>{t('couple.giftBody')}</T>
        </View>
      </View>
      <Button kind="ghost" icon="gift" label={t('couple.giftOpen')} onPress={() => router.push('/friends')} />
    </Fold>
  );
}

const styles = StyleSheet.create({
  friendRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  friendSplit: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md, marginTop: space.xs },
  privateRow: { flexDirection: 'row', gap: space.sm },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.lg, borderWidth: 1, borderColor: color.pinkDeep, backgroundColor: color.pinkWash, borderRadius: radius.card, padding: space.lg },
  pair: { flexDirection: 'row' },
  challenge: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
  ask: { borderColor: color.pinkDeep, backgroundColor: color.pinkWash },
  ticks: { flexDirection: 'row', gap: space.xl },
  tick: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexShrink: 1 },
  tickDot: { width: 28, height: 28, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: color.gold, borderColor: color.goldDeep },
  streak: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md },
  badge: { width: 44, height: 44, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, alignItems: 'center', justifyContent: 'center' },
  badgeOn: { backgroundColor: color.gold, borderColor: color.goldDeep },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  idea: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surfaceHi, padding: space.md, gap: space.sm },
  ideaBoth: { borderColor: color.pink },
  ideaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center', marginLeft: 38 },
  mini: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.pill },
});
