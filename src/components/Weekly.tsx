/**
 * This week on Plans (D121): three fresh plan ideas, new each Monday, and what is on in my city.
 * "Ask" goes to the person I last kept a plan with (a match keeps going), or to Discover when there
 * is nobody yet. An event opens the ask with its idea and place already picked.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { festivalOn, festiveIdeas } from '../domain/festivals';
import { keptWith, isOn, weeklyIdeas, type CityEvent } from '../domain/weekly';
import type { MicroDateIdea } from '../domain/types';
import { quiet } from '../lib/log';
import { backend } from '../services';
import { useStore } from '../state/store';
import { color, radius, space } from '../theme/tokens';
import { Tag } from './ui/Chip';
import { Fold } from './ui/Fold';
import { T } from './ui/T';
import { fmtDay, fmtTime, t } from '../i18n';

export function ThisWeek() {
  const me = useStore((s) => s.me);
  const invites = useStore((s) => s.invites);
  const profiles = useStore((s) => s.profiles);
  const [events, setEvents] = useState<CityEvent[]>([]);
  const now = useMemo(() => Date.now(), []);

  useEffect(() => {
    let alive = true;
    // Events are a nice-to-have: if they do not load, the ideas still show.
    backend.cityEvents().then((e) => alive && setEvents(e), quiet('weekly.events'));
    return () => {
      alive = false;
    };
  }, []);

  if (!me) return null;
  const ideas = weeklyIdeas(me, now);
  const people = keptWith(invites, me.id).map((id) => profiles.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p);
  const partner = people[0];
  // An ask offers only the ideas the other person is up for, so an idea goes to someone who listed it.
  const forIdea = (ideaId: string) => people.find((p) => p.ideaIds.includes(ideaId));
  const ask = (to: (typeof people)[number] | undefined, ideaId: string | null, venueId?: string | null) =>
    to ? router.push({ pathname: '/invite/new', params: { to: to.id, ...(ideaId ? { idea: ideaId } : {}), ...(venueId ? { venue: venueId } : {}) } }) : router.push('/(tabs)');

  const row = (i: MicroDateIdea) => {
    const to = forIdea(i.id);
    return (
      <View key={i.id} style={styles.idea}>
        <T style={{ fontSize: 28, lineHeight: 34 }} maxFontSizeMultiplier={1}>{i.emoji}</T>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="bodyBold">{i.title}</T>
          <T v="caption" c={color.textDim}>{t('weekly.minutes', { minutes: i.minutes })}</T>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={to ? t('weekly.askSpoken', { name: to.name, idea: i.title }) : t('weekly.findSpoken', { idea: i.title })}
          onPress={() => ask(to, i.id)} style={({ pressed }) => [styles.go, pressed && { backgroundColor: color.goldDeep }]}>
          <Feather name={to ? 'send' : 'compass'} size={16} color={color.onGold} />
          <T v="caption" c={color.onGold} numberOfLines={1}>{to ? t('weekly.ask', { name: to.name }) : t('weekly.find')}</T>
        </Pressable>
      </View>
    );
  };
  const festival = festivalOn(now);
  const festive = festival ? festiveIdeas(festival, me.country, me.city) : [];

  return (
    <View style={{ marginTop: space.lg }}>
      {festival && festive.length ? (
        <Fold icon="gift" accent title={`${festival.emoji}  ${t(`festivals.${festival.id}.title`)}`} value={t('fold.ideas', { count: festive.length })}>
          <T v="caption" c={color.textDim}>{t(`festivals.${festival.id}.body`)}</T>
          {festive.map(row)}
        </Fold>
      ) : null}
      <Fold icon="calendar" accent title={t('weekly.title')} value={t('fold.ideas', { count: ideas.length })}>
        <T v="caption" c={color.textDim}>{t('weekly.body')}</T>
        {ideas.map(row)}
      </Fold>

      {events.length ? (
        <Fold icon="map" title={t('weekly.eventsTitle', { city: me.city })} value={String(events.length)}>
          <T v="caption" c={color.textDim}>{t('weekly.eventsBody')}</T>
          {events.map((e) => (
            <View key={e.id} style={styles.event}>
              <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
                <T style={{ fontSize: 26, lineHeight: 32 }} maxFontSizeMultiplier={1}>{e.emoji}</T>
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="bodyBold">{e.title}</T>
                  <T v="caption" c={isOn(e, now) ? color.gold : color.textDim}>
                    {isOn(e, now) ? `${t('weekly.now')} · ${t('weekly.until', { day: fmtDay(e.endsAt) })}` : t('weekly.when', { day: fmtDay(e.startsAt), time: fmtTime(e.startsAt) })}
                  </T>
                  <T v="caption" c={color.textMute}>{e.place}</T>
                </View>
                {e.free ? <Tag label={t('weekly.free')} tone={color.gold} /> : null}
              </View>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                <Pressable accessibilityRole="button" onPress={() => ask(partner, e.ideaId && partner?.ideaIds.includes(e.ideaId) ? e.ideaId : null, e.venueId)} style={({ pressed }) => [styles.mini, pressed && { backgroundColor: color.surface }]}>
                  <Feather name="send" size={16} color={color.gold} />
                  <T v="caption" c={color.gold}>{partner ? t('weekly.planIt', { name: partner.name }) : t('weekly.planFind')}</T>
                </Pressable>
                {e.url ? (
                  <Pressable accessibilityRole="link" accessibilityLabel={t('weekly.detailsSpoken', { title: e.title })} onPress={() => Linking.openURL(e.url!).catch(quiet('weekly.link'))}
                    style={({ pressed }) => [styles.mini, pressed && { backgroundColor: color.surface }]}>
                    <Feather name="external-link" size={16} color={color.textDim} />
                    <T v="caption" c={color.textDim}>{t('weekly.details')}</T>
                  </Pressable>
                ) : null}
              </View>
            </View>
          ))}
        </Fold>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  idea: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md },
  go: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, maxWidth: 140, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.gold },
  event: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surfaceHi, padding: space.md, gap: space.sm },
  mini: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.pill },
});
