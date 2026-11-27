/**
 * This week on Plans (D121): three fresh plan ideas, new each Monday, and what is on in my city.
 * "Ask" goes to the person I last kept a plan with (a match keeps going), or to Discover when there
 * is nobody yet. An event opens the ask with its idea and place already picked.
 */
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { keptWith, isOn, weeklyIdeas, type CityEvent } from '../domain/weekly';
import { quiet } from '../lib/log';
import { backend } from '../services';
import { useStore } from '../state/store';
import { color, radius, space } from '../theme/tokens';
import { Tag } from './ui/Chip';
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

  return (
    <View style={{ gap: space.lg, marginTop: space.x3 }}>
      <View style={styles.panel}>
        <T v="label" c={color.gold}>{t('weekly.label')}</T>
        <T v="title">{t('weekly.title')}</T>
        <T v="caption" c={color.textDim}>{t('weekly.body')}</T>
        {ideas.map((i) => {
          const to = forIdea(i.id);
          return (
          <View key={i.id} style={styles.idea}>
            <T style={{ fontSize: 28, lineHeight: 34 }} maxFontSizeMultiplier={1}>{i.emoji}</T>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyBold">{i.title}</T>
              <T v="caption" c={color.textDim}>{i.blurb}</T>
              <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap', marginTop: space.xs }}>
                <Tag label={t('weekly.minutes', { minutes: i.minutes })} />
                {i.cities ? <Tag label={t('weekly.local', { city: me.city })} tone={color.gold} /> : null}
              </View>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={to ? t('weekly.askSpoken', { name: to.name, idea: i.title }) : t('weekly.findSpoken', { idea: i.title })}
              onPress={() => ask(to, i.id)} style={({ pressed }) => [styles.go, pressed && { backgroundColor: color.goldDeep }]}>
              <Feather name={to ? 'send' : 'compass'} size={16} color={color.onGold} />
              <T v="caption" c={color.onGold} numberOfLines={1}>{to ? t('weekly.ask', { name: to.name }) : t('weekly.find')}</T>
            </Pressable>
          </View>
          );
        })}
      </View>

      {events.length ? (
        <View style={styles.panel}>
          <T v="title">{t('weekly.eventsTitle', { city: me.city })}</T>
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
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md },
  idea: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md },
  go: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, maxWidth: 140, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: color.gold },
  event: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surfaceHi, padding: space.md, gap: space.sm },
  mini: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minHeight: 44, paddingHorizontal: space.sm, borderRadius: radius.pill },
});
