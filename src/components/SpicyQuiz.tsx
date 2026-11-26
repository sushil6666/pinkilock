/**
 * The Spicy terms and quiz (D107), on the Spicy page before it can turn on. Three steps: read the
 * terms and agree, answer the questions one at a time (the options in a new order each try), then
 * the result. A miss shows which questions to look at again and sends the person back to the terms
 * to agree once more before a retry. The server marks the answers and keeps the pass
 * (pass_spicy_quiz); this file never decides that someone passed.
 */
import { Feather } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SPICY_QUIZ, SPICY_TERMS, SPICY_TERMS_VERSION, shuffled, type QuizOption, type QuizQuestion, type SpicyTerms, type SpicyTermsSection } from '../domain/spicyQuiz';
import { haptic } from '../lib/haptics';
import { shown } from '../lib/report';
import { aria } from '../lib/web';
import { backend } from '../services';
import { color, radius, space } from '../theme/tokens';
import { t, type Key } from '../i18n';
import { Button } from './ui/Button';
import { ErrorText } from './ui/ErrorText';
import { T } from './ui/T';

const ICONS: Record<SpicyTermsSection, keyof typeof Feather.glyphMap> = {
  adults: 'user-check',
  role: 'send',
  private: 'eye-off',
  voice: 'video-off',
  photos: 'image',
  consent: 'pause-circle',
  threats: 'alert-triangle',
  never: 'slash',
  calls: 'clock',
  credits: 'star',
  changes: 'refresh-cw',
};
/** The sections that say "never": drawn in the warning colour. */
const WARN: readonly SpicyTermsSection[] = ['private', 'voice', 'photos', 'threats', 'never'];

/** The terms, each section with its icon. Also shown on their own once passed. */
export function SpicyTermsList() {
  return (
    <View style={{ gap: space.md }}>
      {SPICY_TERMS.map((k) => (
        <View key={k} style={styles.section}>
          <Feather name={ICONS[k]} size={18} color={WARN.includes(k) ? color.flare : color.gold} style={{ marginTop: 3 }} />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="bodyBold">{t(`spicyQuiz.terms.${k}.title` as Key)}</T>
            <T c={color.textDim}>{t(`spicyQuiz.terms.${k}.body` as Key)}</T>
          </View>
        </View>
      ))}
    </View>
  );
}

type Step = 'terms' | 'quiz' | 'result';

export function SpicyQuizGate({ terms, onPassed, route }: { terms: SpicyTerms; onPassed: (terms: SpicyTerms) => void; route: string }) {
  const [step, setStep] = useState<Step>('terms');
  const [agree, setAgree] = useState(false);
  const [seed, setSeed] = useState(() => Date.now() % 100000);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<(QuizOption | null)[]>(() => SPICY_QUIZ.map(() => null));
  const [wrong, setWrong] = useState<QuizQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const total = SPICY_QUIZ.length;

  const start = () => {
    haptic.tick();
    setAnswers(SPICY_QUIZ.map(() => null));
    setAt(0);
    setError('');
    setStep('quiz');
  };
  const again = () => {
    setAgree(false);
    setSeed((s) => s + 1);
    setWrong([]);
    setStep('terms');
  };
  const pick = (o: QuizOption) => {
    haptic.tick();
    setAnswers((list) => list.map((a, i) => (i === at ? o : a)));
  };
  const check = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await backend.passSpicyQuiz(SPICY_TERMS_VERSION, agree, answers.map((a) => a ?? ''));
      setWrong(r.wrong);
      setStep('result');
      if (r.passed) {
        haptic.success();
        onPassed(await backend.spicyTerms());
      } else {
        haptic.warning();
      }
    } catch (e) {
      haptic.warning();
      setError(shown(e, route));
    }
    setBusy(false);
  };

  if (step === 'terms') {
    return (
      <Animated.View entering={FadeIn.duration(240)} style={[styles.panel, styles.gate]}>
        {terms.outdated ? (
          <View style={styles.notice}>
            <T v="bodyBold" c={color.flare}>{t('spicyQuiz.outdatedTitle')}</T>
            <T v="caption" c={color.textDim}>{t('spicyQuiz.outdatedBody')}</T>
          </View>
        ) : null}
        <T v="label" c={color.pink}>{t('spicyQuiz.gateTitle')}</T>
        <T c={color.textDim}>{t('spicyQuiz.gateBody', { n: total })}</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          <T v="title" style={{ flex: 1 }}>{t('spicyQuiz.termsTitle')}</T>
          <T v="caption" c={color.textMute}>{t('spicyQuiz.termsVersion', { v: SPICY_TERMS_VERSION })}</T>
        </View>
        <SpicyTermsList />
        <Tick on={agree} label={t('spicyQuiz.agree')} onPress={() => setAgree((v) => !v)} />
        <Button icon="check-square" label={t('spicyQuiz.start')} disabled={!agree} onPress={start} />
      </Animated.View>
    );
  }

  if (step === 'quiz') {
    const q = SPICY_QUIZ[at];
    const last = at === total - 1;
    return (
      <View style={[styles.panel, styles.gate]}>
        <T v="label" c={color.pink}>{t('spicyQuiz.progress', { n: at + 1, total })}</T>
        <View style={styles.dots}>
          {SPICY_QUIZ.map((x, i) => <View key={x.id} style={[styles.dot, i <= at && styles.dotOn]} />)}
        </View>
        <Animated.View key={q.id} entering={FadeInDown.duration(240)} style={{ gap: space.md }}>
          <T v="heading" accessibilityRole="header">{t(`spicyQuiz.q.${q.id}.ask` as Key)}</T>
          <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
            {shuffled(seed, at).map((o) => {
              const on = answers[at] === o;
              return (
                <Pressable key={o} accessibilityRole="radio" accessibilityState={{ checked: on }} {...aria({ checked: on })} onPress={() => pick(o)}
                  style={({ pressed }) => [styles.option, on && styles.optionOn, pressed && { opacity: 0.85 }]}>
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  <T style={{ flex: 1 }}>{t(`spicyQuiz.q.${q.id}.${o}` as Key)}</T>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
        {error ? <ErrorText text={error} /> : null}
        <View style={styles.row}>
          <Button kind="ghost" icon="arrow-left" label={t('spicyQuiz.back')} onPress={() => (at === 0 ? setStep('terms') : setAt(at - 1))} style={{ flex: 1 }} />
          {last
            ? <Button icon="check" label={t('spicyQuiz.check')} busy={busy} disabled={answers.some((a) => !a)} onPress={check} style={{ flex: 1 }} />
            : <Button icon="arrow-right" label={t('spicyQuiz.next')} disabled={!answers[at]} onPress={() => setAt(at + 1)} style={{ flex: 1 }} />}
        </View>
      </View>
    );
  }

  // A pass leaves the gate at once (onPassed); the page shows QuizPassed above the form.
  const passed = wrong.length === 0;
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.panel, passed ? styles.pass : styles.gate]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Feather name={passed ? 'check-circle' : 'rotate-ccw'} size={22} color={passed ? color.gold : color.flare} />
        <T v="title" style={{ flex: 1 }}>{passed ? t('spicyQuiz.passTitle') : t('spicyQuiz.failTitle', { right: total - wrong.length, total })}</T>
      </View>
      <T c={color.textDim}>{passed ? t('spicyQuiz.passBody', { n: total }) : t('spicyQuiz.failBody', { total })}</T>
      {passed ? null : (
        <>
          <T v="label" c={color.textDim}>{t('spicyQuiz.yourMiss')}</T>
          {wrong.map((id) => (
            <View key={id} style={styles.miss}>
              <T v="bodyBold">{t(`spicyQuiz.q.${id}.ask` as Key)}</T>
              <View style={styles.section}>
                <Feather name="shield" size={16} color={color.gold} style={{ marginTop: 3 }} />
                <T c={color.textDim} style={{ flex: 1 }}>{t(`spicyQuiz.q.${id}.why` as Key)}</T>
              </View>
            </View>
          ))}
          <Button icon="book-open" label={t('spicyQuiz.again')} onPress={again} />
        </>
      )}
    </Animated.View>
  );
}

/** Shown above the form right after a pass (the gate itself is gone by then). */
export function QuizPassed() {
  return (
    <Animated.View entering={FadeInDown.duration(300)} style={[styles.panel, styles.pass]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Feather name="check-circle" size={22} color={color.gold} />
        <T v="title" style={{ flex: 1 }}>{t('spicyQuiz.passTitle')}</T>
      </View>
      <T c={color.textDim}>{t('spicyQuiz.passBody', { n: SPICY_QUIZ.length })}</T>
    </Animated.View>
  );
}

function Tick({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} {...aria({ checked: on })} accessibilityLabel={label} onPress={() => { haptic.tick(); onPress(); }} style={styles.tick}>
      <View style={[styles.box, on && styles.boxOn]}>{on ? <Feather name="check" size={16} color={color.onGold} /> : null}</View>
      <T style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.surface, padding: space.lg, gap: space.md },
  gate: { borderColor: color.pinkDeep },
  pass: { borderColor: color.goldDeep, backgroundColor: color.goldWash },
  notice: { borderWidth: 1, borderColor: color.flare, borderRadius: radius.card, backgroundColor: color.flareWash, padding: space.md, gap: 4 },
  section: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  miss: { borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.bg, padding: space.md, gap: space.sm },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: color.line },
  dotOn: { backgroundColor: color.pink },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderWidth: 1, borderColor: color.line, borderRadius: radius.card, backgroundColor: color.bg, padding: space.md, minHeight: 56 },
  optionOn: { borderColor: color.gold, backgroundColor: color.goldWash },
  radio: { width: 22, height: 22, borderRadius: radius.pill, borderWidth: 2, borderColor: color.textMute, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: color.gold },
  radioDot: { width: 10, height: 10, borderRadius: radius.pill, backgroundColor: color.gold },
  row: { flexDirection: 'row', gap: space.sm },
  tick: { flexDirection: 'row', gap: space.md, alignItems: 'center', minHeight: 44 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: color.textMute, alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: color.gold, borderColor: color.gold },
});
