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
import { t } from '../i18n';

const RULES = [
  ['landing.rule1', 'landing.rule1Body'],
  ['landing.rule2', 'landing.rule2Body'],
  ['landing.rule3', 'landing.rule3Body'],
  ['landing.rule4', 'landing.rule4Body'],
] as const;

const FAQ = [
  ['landing.q1', 'landing.a1'],
  ['landing.q2', 'landing.a2'],
  ['landing.q3', 'landing.a3'],
  ['landing.q4', 'landing.a4'],
] as const;

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
function rows<X>(list: readonly X[], n: number): X[][] {
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
          <Button kind="quiet" icon="log-in" label={t('landing.signIn')} onPress={signIn} />
          <Button kind="ghost" label={t('landing.start')} icon="arrow-right" onPress={onStart} />
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
            <T v="mega" style={roomy ? styles.headline : styles.headlineTight} accessibilityRole="header">{t('welcome.headline')}</T>
            <T v="heading" c={color.textDim}>{t('welcome.sub')}</T>
            <View style={styles.ctaRow}>
              <Button label={t('landing.start')} icon="arrow-right" onPress={onStart} style={{ minWidth: 200 }} />
              <Button kind="quiet" icon="log-in" label={t('welcome.haveAccount')} onPress={signIn} />
            </View>
          </View>
        </View>
      </NightSky>

      <View style={[styles.inner, { gap: space.x5 * 2 }]}>

        <Section eyebrow={t('landing.howEyebrow')} title={t('landing.howTitle')}>
          <View style={styles.cols}>
            <View style={{ flex: 1 }}><Notes /></View>
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <T c={color.textDim} style={{ maxWidth: 420 }}>{t('landing.howBody')}</T>
            </View>
          </View>
        </Section>

        <Section eyebrow={t('landing.rulesEyebrow')} title={t('landing.rulesTitle')}>
          <View style={styles.cols}>
            <View style={{ flex: 1.4, gap: space.lg }}>
              {rows(RULES, 2).map((row, r) => (
                <View key={r} style={styles.gridRow}>
                  {row.map(([head, body]) => (
                    <View key={head} style={styles.card}>
                      <T v="heading">{t(head)}</T>
                      <T c={color.textDim}>{t(body)}</T>
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

        <Section eyebrow={t('landing.ideasEyebrow')} title={t('landing.ideasTitle')}>
          <View style={{ gap: space.lg }}>
            {rows(ideas, ideaCols).map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((idea) => (
                  <View key={idea.id} style={styles.card}>
                    <T style={styles.emoji} {...webOnly({ 'aria-hidden': true })}>{idea.emoji}</T>
                    <T v="bodyBold">{idea.title}</T>
                    <T v="caption" c={color.textMute}>{t('ticket.minutes', { minutes: idea.minutes })}</T>
                    <T v="caption" c={color.textDim}>{idea.blurb}</T>
                  </View>
                ))}
              </View>
            ))}
            <T v="hand" c={color.pink}>{t('landing.pickThree')}</T>
            {IDEAS.length > ideas.length && <T v="caption" c={color.textMute}>{t('landing.more', { count: IDEAS.length - ideas.length })}</T>}
          </View>
        </Section>

        <Section eyebrow={t('landing.placesEyebrow')} title={t('landing.placesTitle')}>
          <View style={{ gap: space.lg }}>
            <T c={color.textDim} style={{ maxWidth: 560 }}>{t('landing.placesBody')}</T>
            {rows(PLACES, 4).map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((v) => (
                  <View key={v.id} style={styles.place}>
                    <T v="label" c={color.pink}>{t(`venueKinds.${v.kind}`)}</T>
                    <T v="bodyBold">{v.name}</T>
                    <T v="caption" c={color.textMute}>{v.area}</T>
                  </View>
                ))}
                {Array.from({ length: 4 - row.length }, (_, i) => <View key={`gap${i}`} style={{ flex: 1 }} />)}
              </View>
            ))}
            <T v="caption" c={color.textMute}>{t('landing.citiesNow', { cities: CITIES.join(', '), count: VENUES.length })}</T>
          </View>
        </Section>

        <Section eyebrow={t('landing.faqEyebrow')} title={t('landing.faqTitle')}>
          <View style={{ gap: space.x4 }}>
            {rows(FAQ, 2).map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map(([q, a]) => (
                  <View key={q} style={{ flex: 1, gap: space.sm }}>
                    <T v="heading">{t(q)}</T>
                    <T c={color.textDim}>{t(a)}</T>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </Section>

        <View style={styles.final}>
          <T v="mega" style={styles.headline} center accessibilityRole="header">{t('landing.finalTitle')}</T>
          <T v="heading" c={color.textDim} center>{t('landing.finalBody')}</T>
          <Button label={t('landing.start')} icon="arrow-right" onPress={onStart} style={{ minWidth: 260, alignSelf: 'center' }} />
        </View>

        <View style={styles.footer} {...webOnly({ role: 'contentinfo' as const })}>
          <Logo size={14} />
          <View style={styles.navRight}>
            <Button kind="quiet" label={t('landing.terms')} onPress={() => router.push('/legal/terms')} />
            <Button kind="quiet" label={t('landing.privacy')} onPress={() => router.push('/legal/privacy')} />
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
