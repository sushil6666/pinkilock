/**
 * Fonts for scripts Inter Tight does not cover (D102). On a phone the system already carries a
 * Noto (or its own) font for every Indian script and falls back to it glyph by glyph, so the app
 * ships none: this file is the iOS and Android side and adds nothing. The browser side,
 * `scriptFonts.web.ts`, serves a Noto font from the site itself (the CSP allows fonts from 'self').
 */
import type { Script } from '../i18n/languages';

export type Weight = 400 | 500 | 700 | 800;

/** The font family names for a script, by weight, to put after Inter Tight. Null: the system's. */
export function scriptFamilies(_script: Script): Record<Weight, string> | null {
  return null;
}

/** The font files to load for a script, as `useFonts` takes them. */
export function scriptFontFiles(_script: Script): Record<string, number> {
  return {};
}

/** Loads one regular face per script, so the language picker can write each name in itself. */
export async function loadScriptNameFonts(): Promise<void> {}

/** The family to write a language's own name in, in the picker. Undefined: the usual one. */
export function nameFamily(_script: Script): string | undefined {
  return undefined;
}
