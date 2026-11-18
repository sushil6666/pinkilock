/**
 * The website's front page: what a visitor in a wide browser window sees at pinkilock.com before
 * they have a profile. It is the first onboarding step drawn up to `wideMax`, so "Start" goes
 * straight into sign-up, and sign-up itself and the app stay in the column.
 *
 * Every claim on it is something the app really does (see `src/domain`): contacts locked until a
 * kept promise, both people checking in, the kept and flaked counts beside the score, block and
 * report, adults only. Do not add one it does not do.
 */
import { router } from 'expo-router';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { IDEAS } from '@/domain/ideas';
import { VENUES, type Venue } from '@/domain/venues';
import { webOnly } from '@/lib/web';
import { color, radius, space, wideMax } from '@/theme/tokens';
import { Logo } from './Logo';
import { Loop } from './Loop';
import { NightSky } from './NightSky';
import { Notes, Scribble } from './Welcome';
import { Button } from './ui/Button';
import { T } from './ui/T';

const RULES: [string, string][] = [
  ['One person at a time.', 'No feed to swipe. You ask one person to one small plan, and they say yes or no.'],
  ['A real plan, with a time.', 'Ten minutes of coffee on video, a boba run, a bookstore lap. Something you can actually turn up to.'],
  ['Contacts stay locked.', 'Instagram, Snapchat or WhatsApp opens only after you both check in. Until then nobody has a way to pester you.'],
  ['Your record is real.', 'Kept and flaked promises are counted and shown beside your score, so people who show up get seen.'],
];

const FAQ: [string, string][] = [
  ['What is a micro-date?', 'A plan short enough to say yes to: ten to thirty minutes, one thing to do, a set time. If it goes well, you plan the next one.'],
  ['When do I get their handle?', 'When you both check in at the plan. The app keeps it locked until then, for both of you.'],
  ['What if someone flakes?', 'It goes on their record. Plans that end for a good reason, like a safety bail, are not counted against anyone.'],
  ['Is it safe?', 'It is adults only. The suggested places are public. Anyone can be blocked or reported from their profile, and asking for a contact early is reportable.'],
];

/** One place per area, so the list shows how far the city reaches rather than one street. */
const PLACES: Venue[] = VENUES.filter((v, i) => VENUES.findIndex((w) => w.area === v.area) === i).slice(0, 12);
const CITIES = [...new Set(VENUES.map((v) => v.city))];

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} {...webOnly({ role: 'region' as const, 'aria-label': eyebrow })}>
      <View style={{ gap: space.sm }}>
        <T v="label" c={color.pink}>{eyebrow}</T>
        <T v="display" accessibilityRole="header">{title}</T>
      </View>
      {children}
    </View>
  );
}

/** Splits a list into rows of `n`, so a grid keeps equal columns without percentage maths. */
function rows<X>(list: X[], n: number): X[][] {
  const out: X[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

export function Landing({ onStart }: { onStart: () => void }) {
  const { width } = useWindowDimensions();
  const ideaCols = width >= 1100 ? 4 : 3;
  // Below this the hero's right column is too narrow for the big headline on three lines.
  const roomy = width >= 1200;
  const ideas = IDEAS.slice(0, ideaCols * 2);
  const signIn = () => router.push({ pathname: '/account/sign-in', params: { mode: 'sign_in' } });

  return (
    <View style={{ gap: space.x5 * 2 }}>
      <View style={styles.nav} {...webOnly({ role: 'navigation' as const })}>
        {/* The logo sits in the middle, as on every app screen: a side on each hand, equal width. */}
        <View style={styles.navSide} />
        <Logo size={22} />
        <View style={[styles.navSide, styles.navRight]}>
          <Button kind="quiet" icon="log-in" label="Sign in" onPress={signIn} />
          <Button kind="ghost" label="Start" icon="arrow-right" onPress={onStart} />
        </View>
      </View>

      {/* The night sky runs the full width of the window, the skyline edge to edge; the hero's
          two columns sit in the middle of it. */}
      <NightSky moon={styles.moon} wide>
        <View style={[styles.inner, styles.hero]}>
          <View style={styles.heroArt}>
            <Loop name="pinkyLock" />
            <Scribble wide />
          </View>
          <View style={styles.heroWords}>
            <T v="mega" style={roomy ? styles.headline : styles.headlineTight} accessibilityRole="header">No ghosting.{'\n'}No endless{'\n'}swiping.</T>
            <T v="heading" c={color.textDim}>One person. One tiny plan. One pinky promise that you both show up.</T>
            <View style={styles.ctaRow}>
              <Button label="Start" icon="arrow-right" onPress={onStart} style={{ minWidth: 200 }} />
              <Button kind="quiet" icon="log-in" label="I already have an account" onPress={signIn} />
            </View>
          </View>
        </View>
      </NightSky>

      <View style={[styles.inner, { gap: space.x5 * 2 }]}>

        <Section eyebrow="How it works" title="Three steps. That is the whole app.">
          <View style={styles.cols}>
            <View style={{ flex: 1 }}><Notes /></View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <T c={color.textDim} style={{ maxWidth: 420 }}>
                Everyone on Pinkilock is here for the same reason: to meet someone, briefly, for real. You
                pick the plan and the time. They lock pinkies or pass. Then you both turn up, check in, and
                the app unlocks how to reach each other.
              </T>
            </View>
          </View>
        </Section>

        <Section eyebrow="The rules" title="Built so showing up is the easy part.">
          <View style={styles.cols}>
            <View style={{ flex: 1.4, gap: space.lg }}>
              {rows(RULES, 2).map((row, r) => (
                <View key={r} style={styles.gridRow}>
                  {row.map(([head, body]) => (
                    <View key={head} style={styles.card}>
                      <T v="heading">{head}</T>
                      <T c={color.textDim}>{body}</T>
                    </View>
                  ))}
                </View>
              ))}
            </View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Loop name="padlock" />
            </View>
          </View>
        </Section>

        <Section eyebrow="Micro-dates" title="Small enough to say yes to.">
          <View style={{ gap: space.lg }}>
            {rows(ideas, ideaCols).map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((idea) => (
                  <View key={idea.id} style={styles.card}>
                    <T style={styles.emoji} {...webOnly({ 'aria-hidden': true })}>{idea.emoji}</T>
                    <T v="bodyBold">{idea.title}</T>
                    <T v="caption" c={color.textMute}>{idea.minutes} min</T>
                    <T v="caption" c={color.textDim}>{idea.blurb}</T>
                  </View>
                ))}
              </View>
            ))}
            <T v="hand" c={color.pink}>pick three. that is your bio.</T>
            {IDEAS.length > ideas.length && <T v="caption" c={color.textMute}>And {IDEAS.length - ideas.length} more in the app.</T>}
          </View>
        </Section>

        <Section eyebrow="Places" title="Meet somewhere busy and public.">
          <View style={{ gap: space.lg }}>
            <T c={color.textDim} style={{ maxWidth: 560 }}>
              In-person plans are picked from a list of well-known spots: promenades, parks, markets and
              landmarks. Nobody has to suggest their place, and nobody can.
            </T>
            {rows(PLACES, 4).map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((v) => (
                  <View key={v.id} style={styles.place}>
                    <T v="label" c={color.pink}>{v.kind}</T>
                    <T v="bodyBold">{v.name}</T>
                    <T v="caption" c={color.textMute}>{v.area}</T>
                  </View>
                ))}
                {Array.from({ length: 4 - row.length }, (_, i) => <View key={`gap${i}`} style={{ flex: 1 }} />)}
              </View>
            ))}
            <T v="caption" c={color.textMute}>{CITIES.join(', ')} for now, {VENUES.length} places and growing.</T>
          </View>
        </Section>

        <Section eyebrow="Questions" title="Fair questions.">
          <View style={{ gap: space.x4 }}>
            {rows(FAQ, 2).map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map(([q, a]) => (
                  <View key={q} style={{ flex: 1, gap: space.sm }}>
                    <T v="heading">{q}</T>
                    <T c={color.textDim}>{a}</T>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Section>

        <View style={styles.final}>
          <T v="mega" style={styles.headline} center accessibilityRole="header">Pinky promise?</T>
          <T v="heading" c={color.textDim} center>Make a profile, pick three plans, send your first vibe check. Adults only, 18 and over.</T>
          <Button label="Start" icon="arrow-right" onPress={onStart} style={{ minWidth: 260, alignSelf: 'center' }} />
        </View>

        <View style={styles.footer} {...webOnly({ role: 'contentinfo' as const })}>
          <Logo size={14} />
          <View style={styles.navRight}>
            <Button kind="quiet" label="Terms" onPress={() => router.push('/legal/terms')} />
            <Button kind="quiet" label="Privacy" onPress={() => router.push('/legal/privacy')} />
            <Button kind="quiet" label="Safety" onPress={() => router.push('/safety')} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.md },
  navSide: { flex: 1 },
  navRight: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.md },
  // The text columns stop at `wideMax` so lines stay readable; the sky and the skyline do not.
  inner: { width: '100%', maxWidth: wideMax, alignSelf: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: space.x5, marginTop: -space.x4 },
  moon: { right: undefined, left: '40%', top: 0 },
  heroArt: { flex: 1.1 },
  heroWords: { flex: 1, gap: space.xl },
  headline: { fontSize: 64, lineHeight: 64 },
  headlineTight: { fontSize: 48, lineHeight: 50 },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.lg, marginTop: space.md },
  section: { gap: space.x4 },
  cols: { flexDirection: 'row', gap: space.x5, alignItems: 'stretch' },
  gridRow: { flexDirection: 'row', gap: space.lg },
  card: { flex: 1, gap: space.sm, backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, padding: space.xl },
  place: { flex: 1, gap: space.xs, borderLeftWidth: 3, borderLeftColor: color.pink, paddingLeft: space.md, paddingVertical: space.sm },
  emoji: { fontSize: 28, lineHeight: 34 },
  final: { gap: space.xl, alignItems: 'center', paddingVertical: space.x4, borderTopWidth: 1, borderTopColor: color.line },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line, paddingTop: space.md, paddingBottom: space.x4 },
});
