/**
 * The browser side of `scriptFonts.ts` (D102): a Noto font for each non-Latin script, served from
 * the site itself. Only the current language's script is loaded (app/_layout.tsx), so a visitor
 * reading English downloads none of them. Ol Chiki and Naskh Arabic stop at Bold, so their
 * ExtraBold is the Bold. Urdu, Kashmiri and Sindhi use Naskh, which stays readable at the app's
 * line heights (Nastaliq needs far taller lines).
 */
import type { Script } from '../i18n/languages';

export type Weight = 400 | 500 | 700 | 800;

interface Entry {
  families: Record<Weight, string>;
  files: () => Record<string, number>;
}

const SCRIPTS: Partial<Record<Script, Entry>> = {
  Deva: {
    families: { 400: 'NotoSansDevanagari_400Regular', 500: 'NotoSansDevanagari_500Medium', 700: 'NotoSansDevanagari_700Bold', 800: 'NotoSansDevanagari_800ExtraBold' },
    files: () => ({
      NotoSansDevanagari_400Regular: require('@expo-google-fonts/noto-sans-devanagari/400Regular/NotoSansDevanagari_400Regular.ttf'),
      NotoSansDevanagari_500Medium: require('@expo-google-fonts/noto-sans-devanagari/500Medium/NotoSansDevanagari_500Medium.ttf'),
      NotoSansDevanagari_700Bold: require('@expo-google-fonts/noto-sans-devanagari/700Bold/NotoSansDevanagari_700Bold.ttf'),
      NotoSansDevanagari_800ExtraBold: require('@expo-google-fonts/noto-sans-devanagari/800ExtraBold/NotoSansDevanagari_800ExtraBold.ttf'),
    }),
  },
  Beng: {
    families: { 400: 'NotoSansBengali_400Regular', 500: 'NotoSansBengali_500Medium', 700: 'NotoSansBengali_700Bold', 800: 'NotoSansBengali_800ExtraBold' },
    files: () => ({
      NotoSansBengali_400Regular: require('@expo-google-fonts/noto-sans-bengali/400Regular/NotoSansBengali_400Regular.ttf'),
      NotoSansBengali_500Medium: require('@expo-google-fonts/noto-sans-bengali/500Medium/NotoSansBengali_500Medium.ttf'),
      NotoSansBengali_700Bold: require('@expo-google-fonts/noto-sans-bengali/700Bold/NotoSansBengali_700Bold.ttf'),
      NotoSansBengali_800ExtraBold: require('@expo-google-fonts/noto-sans-bengali/800ExtraBold/NotoSansBengali_800ExtraBold.ttf'),
    }),
  },
  Gujr: {
    families: { 400: 'NotoSansGujarati_400Regular', 500: 'NotoSansGujarati_500Medium', 700: 'NotoSansGujarati_700Bold', 800: 'NotoSansGujarati_800ExtraBold' },
    files: () => ({
      NotoSansGujarati_400Regular: require('@expo-google-fonts/noto-sans-gujarati/400Regular/NotoSansGujarati_400Regular.ttf'),
      NotoSansGujarati_500Medium: require('@expo-google-fonts/noto-sans-gujarati/500Medium/NotoSansGujarati_500Medium.ttf'),
      NotoSansGujarati_700Bold: require('@expo-google-fonts/noto-sans-gujarati/700Bold/NotoSansGujarati_700Bold.ttf'),
      NotoSansGujarati_800ExtraBold: require('@expo-google-fonts/noto-sans-gujarati/800ExtraBold/NotoSansGujarati_800ExtraBold.ttf'),
    }),
  },
  Guru: {
    families: { 400: 'NotoSansGurmukhi_400Regular', 500: 'NotoSansGurmukhi_500Medium', 700: 'NotoSansGurmukhi_700Bold', 800: 'NotoSansGurmukhi_800ExtraBold' },
    files: () => ({
      NotoSansGurmukhi_400Regular: require('@expo-google-fonts/noto-sans-gurmukhi/400Regular/NotoSansGurmukhi_400Regular.ttf'),
      NotoSansGurmukhi_500Medium: require('@expo-google-fonts/noto-sans-gurmukhi/500Medium/NotoSansGurmukhi_500Medium.ttf'),
      NotoSansGurmukhi_700Bold: require('@expo-google-fonts/noto-sans-gurmukhi/700Bold/NotoSansGurmukhi_700Bold.ttf'),
      NotoSansGurmukhi_800ExtraBold: require('@expo-google-fonts/noto-sans-gurmukhi/800ExtraBold/NotoSansGurmukhi_800ExtraBold.ttf'),
    }),
  },
  Knda: {
    families: { 400: 'NotoSansKannada_400Regular', 500: 'NotoSansKannada_500Medium', 700: 'NotoSansKannada_700Bold', 800: 'NotoSansKannada_800ExtraBold' },
    files: () => ({
      NotoSansKannada_400Regular: require('@expo-google-fonts/noto-sans-kannada/400Regular/NotoSansKannada_400Regular.ttf'),
      NotoSansKannada_500Medium: require('@expo-google-fonts/noto-sans-kannada/500Medium/NotoSansKannada_500Medium.ttf'),
      NotoSansKannada_700Bold: require('@expo-google-fonts/noto-sans-kannada/700Bold/NotoSansKannada_700Bold.ttf'),
      NotoSansKannada_800ExtraBold: require('@expo-google-fonts/noto-sans-kannada/800ExtraBold/NotoSansKannada_800ExtraBold.ttf'),
    }),
  },
  Mlym: {
    families: { 400: 'NotoSansMalayalam_400Regular', 500: 'NotoSansMalayalam_500Medium', 700: 'NotoSansMalayalam_700Bold', 800: 'NotoSansMalayalam_800ExtraBold' },
    files: () => ({
      NotoSansMalayalam_400Regular: require('@expo-google-fonts/noto-sans-malayalam/400Regular/NotoSansMalayalam_400Regular.ttf'),
      NotoSansMalayalam_500Medium: require('@expo-google-fonts/noto-sans-malayalam/500Medium/NotoSansMalayalam_500Medium.ttf'),
      NotoSansMalayalam_700Bold: require('@expo-google-fonts/noto-sans-malayalam/700Bold/NotoSansMalayalam_700Bold.ttf'),
      NotoSansMalayalam_800ExtraBold: require('@expo-google-fonts/noto-sans-malayalam/800ExtraBold/NotoSansMalayalam_800ExtraBold.ttf'),
    }),
  },
  Orya: {
    families: { 400: 'NotoSansOriya_400Regular', 500: 'NotoSansOriya_500Medium', 700: 'NotoSansOriya_700Bold', 800: 'NotoSansOriya_800ExtraBold' },
    files: () => ({
      NotoSansOriya_400Regular: require('@expo-google-fonts/noto-sans-oriya/400Regular/NotoSansOriya_400Regular.ttf'),
      NotoSansOriya_500Medium: require('@expo-google-fonts/noto-sans-oriya/500Medium/NotoSansOriya_500Medium.ttf'),
      NotoSansOriya_700Bold: require('@expo-google-fonts/noto-sans-oriya/700Bold/NotoSansOriya_700Bold.ttf'),
      NotoSansOriya_800ExtraBold: require('@expo-google-fonts/noto-sans-oriya/800ExtraBold/NotoSansOriya_800ExtraBold.ttf'),
    }),
  },
  Taml: {
    families: { 400: 'NotoSansTamil_400Regular', 500: 'NotoSansTamil_500Medium', 700: 'NotoSansTamil_700Bold', 800: 'NotoSansTamil_800ExtraBold' },
    files: () => ({
      NotoSansTamil_400Regular: require('@expo-google-fonts/noto-sans-tamil/400Regular/NotoSansTamil_400Regular.ttf'),
      NotoSansTamil_500Medium: require('@expo-google-fonts/noto-sans-tamil/500Medium/NotoSansTamil_500Medium.ttf'),
      NotoSansTamil_700Bold: require('@expo-google-fonts/noto-sans-tamil/700Bold/NotoSansTamil_700Bold.ttf'),
      NotoSansTamil_800ExtraBold: require('@expo-google-fonts/noto-sans-tamil/800ExtraBold/NotoSansTamil_800ExtraBold.ttf'),
    }),
  },
  Telu: {
    families: { 400: 'NotoSansTelugu_400Regular', 500: 'NotoSansTelugu_500Medium', 700: 'NotoSansTelugu_700Bold', 800: 'NotoSansTelugu_800ExtraBold' },
    files: () => ({
      NotoSansTelugu_400Regular: require('@expo-google-fonts/noto-sans-telugu/400Regular/NotoSansTelugu_400Regular.ttf'),
      NotoSansTelugu_500Medium: require('@expo-google-fonts/noto-sans-telugu/500Medium/NotoSansTelugu_500Medium.ttf'),
      NotoSansTelugu_700Bold: require('@expo-google-fonts/noto-sans-telugu/700Bold/NotoSansTelugu_700Bold.ttf'),
      NotoSansTelugu_800ExtraBold: require('@expo-google-fonts/noto-sans-telugu/800ExtraBold/NotoSansTelugu_800ExtraBold.ttf'),
    }),
  },
  Mtei: {
    families: { 400: 'NotoSansMeeteiMayek_400Regular', 500: 'NotoSansMeeteiMayek_500Medium', 700: 'NotoSansMeeteiMayek_700Bold', 800: 'NotoSansMeeteiMayek_800ExtraBold' },
    files: () => ({
      NotoSansMeeteiMayek_400Regular: require('@expo-google-fonts/noto-sans-meetei-mayek/400Regular/NotoSansMeeteiMayek_400Regular.ttf'),
      NotoSansMeeteiMayek_500Medium: require('@expo-google-fonts/noto-sans-meetei-mayek/500Medium/NotoSansMeeteiMayek_500Medium.ttf'),
      NotoSansMeeteiMayek_700Bold: require('@expo-google-fonts/noto-sans-meetei-mayek/700Bold/NotoSansMeeteiMayek_700Bold.ttf'),
      NotoSansMeeteiMayek_800ExtraBold: require('@expo-google-fonts/noto-sans-meetei-mayek/800ExtraBold/NotoSansMeeteiMayek_800ExtraBold.ttf'),
    }),
  },
  Olck: {
    families: { 400: 'NotoSansOlChiki_400Regular', 500: 'NotoSansOlChiki_500Medium', 700: 'NotoSansOlChiki_700Bold', 800: 'NotoSansOlChiki_700Bold' },
    files: () => ({
      NotoSansOlChiki_400Regular: require('@expo-google-fonts/noto-sans-ol-chiki/400Regular/NotoSansOlChiki_400Regular.ttf'),
      NotoSansOlChiki_500Medium: require('@expo-google-fonts/noto-sans-ol-chiki/500Medium/NotoSansOlChiki_500Medium.ttf'),
      NotoSansOlChiki_700Bold: require('@expo-google-fonts/noto-sans-ol-chiki/700Bold/NotoSansOlChiki_700Bold.ttf'),
    }),
  },
  Arab: {
    families: { 400: 'NotoNaskhArabic_400Regular', 500: 'NotoNaskhArabic_500Medium', 700: 'NotoNaskhArabic_700Bold', 800: 'NotoNaskhArabic_700Bold' },
    files: () => ({
      NotoNaskhArabic_400Regular: require('@expo-google-fonts/noto-naskh-arabic/400Regular/NotoNaskhArabic_400Regular.ttf'),
      NotoNaskhArabic_500Medium: require('@expo-google-fonts/noto-naskh-arabic/500Medium/NotoNaskhArabic_500Medium.ttf'),
      NotoNaskhArabic_700Bold: require('@expo-google-fonts/noto-naskh-arabic/700Bold/NotoNaskhArabic_700Bold.ttf'),
    }),
  },
};

export function scriptFamilies(script: Script): Record<Weight, string> | null {
  return SCRIPTS[script]?.families ?? null;
}

export function scriptFontFiles(script: Script): Record<string, number> {
  return SCRIPTS[script]?.files() ?? {};
}

/**
 * The picker lists every language in its own script, but a browser has only the current one's
 * font. When the picker opens, the regular face of each script is fetched (a few hundred KB each).
 */
export async function loadScriptNameFonts(): Promise<void> {
  const Font = await import('expo-font');
  const files: Record<string, number> = {};
  for (const entry of Object.values(SCRIPTS)) {
    const all = entry!.files();
    const regular = entry!.families[400];
    files[regular] = all[regular];
  }
  await Font.loadAsync(files);
}

export function nameFamily(script: Script): string | undefined {
  return SCRIPTS[script]?.families[400];
}
