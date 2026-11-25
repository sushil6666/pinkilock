/**
 * The language picker (D102): a small button with the language in use, written in itself, that
 * opens a list of every language. The phone's language and the languages of the person's state
 * come first. On the welcome screen, the website's front page and Me.
 */
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { deviceLocale, language, t } from '../i18n';
import { LANGUAGES, languageInfo, suggestedLanguages, type LanguageInfo } from '../i18n/languages';
import { haptic } from '../lib/haptics';
import { chooseLanguage } from '../lib/language';
import { aria } from '../lib/web';
import { loadScriptNameFonts, nameFamily } from '../theme/scriptFonts';
import { color, radius, space } from '../theme/tokens';
import { quiet } from '../lib/log';
import { Sheet } from './ui/Sheet';
import { T } from './ui/T';

interface Props {
  /** The person's state, for the suggestions. */
  state?: string;
  /** `row` is a full-width panel (Me); `chip` a small button (welcome, the website's header). */
  look?: 'chip' | 'row';
}

export function LanguagePicker({ state, look = 'chip' }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const { height } = useWindowDimensions();
  const current = languageInfo(language()) ?? LANGUAGES[0];
  const suggested = suggestedLanguages(language(), deviceLocale(), state);
  const rest = LANGUAGES.filter((l) => !suggested.includes(l));
  const label = t('language.current', { name: current.native });
  // Each name is written in its own script: in a browser that needs each script's font first.
  const [named, setNamed] = useState(false);
  useEffect(() => {
    if (open && !named) loadScriptNameFonts().then(() => setNamed(true), quiet('language.fonts'));
  }, [open, named]);

  const pick = (l: LanguageInfo) => {
    if (l.tag === current.tag) return setOpen(false);
    haptic.tick();
    setBusy(l.tag);
    chooseLanguage(l.tag);
  };

  const row = (l: LanguageInfo) => {
    const on = l.tag === current.tag;
    return (
      <Pressable key={l.tag} accessibilityRole="radio" accessibilityState={{ checked: on }} {...aria({ checked: on })} accessibilityLabel={`${l.native}, ${l.english}`} onPress={() => pick(l)} style={[styles.option, on && styles.optionOn]}>
        <View style={{ flex: 1 }}>
          <T v="bodyBold" c={on ? color.onPink : color.text} style={named && l.script !== 'Latn' && l.tag !== current.tag ? { fontFamily: nameFamily(l.script) } : undefined}>{l.native}</T>
          {busy === l.tag || l.english !== l.native ? <T v="caption" c={on ? color.onPink : color.textDim}>{busy === l.tag ? t('language.switching') : l.english}</T> : null}
        </View>
        {on ? <Feather name="check" size={18} color={color.onPink} /> : null}
      </Pressable>
    );
  };

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={8} onPress={() => setOpen(true)} style={look === 'row' ? styles.panel : styles.chip}>
        <Feather name="globe" size={look === 'row' ? 18 : 14} color={color.gold} />
        {look === 'row' ? (
          <View style={{ flex: 1 }}>
            <T v="bodyBold">{current.native}</T>
            <T v="caption" c={color.textDim}>{t('language.pick')}</T>
          </View>
        ) : (
          <T v="caption" c={color.text}>{current.native}</T>
        )}
        {look === 'row' ? <Feather name="chevron-right" size={18} color={color.textDim} /> : null}
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} eyebrow={t('language.title')} title={t('language.pick')} body={current.tag === 'en' ? undefined : t('language.draft')}>
        <ScrollView style={{ maxHeight: Math.max(240, height * 0.55) }} contentContainerStyle={{ gap: space.sm }}>
          <T v="label" c={color.gold}>{t('language.suggested')}</T>
          {suggested.map(row)}
          <T v="label" c={color.gold} style={{ marginTop: space.md }}>{t('language.all')}</T>
          {rest.map(row)}
        </ScrollView>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: space.xs, alignSelf: 'flex-start', minHeight: 32, paddingHorizontal: space.md, borderRadius: radius.pill, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface },
  panel: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.card, borderWidth: 1, borderColor: color.line, backgroundColor: color.surface },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.chip, borderWidth: 1, borderColor: color.line, backgroundColor: color.surfaceHi },
  optionOn: { backgroundColor: color.pink, borderColor: color.pink },
});
