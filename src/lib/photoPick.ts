/**
 * Picks a photo on this phone or in this browser and makes it into a plain JPEG, at most 1280 px
 * on its longer side (D088). Re-encoding bakes in the rotation and drops the file's metadata; the
 * server strips it again in any case (supabase/functions/photo/jpeg.ts), since a modified app
 * could skip this step.
 *
 * A phone build from before expo-image-picker and expo-image-manipulator were added has neither
 * native module: it says so, and Me shows that photos need the new version.
 */
import type { PickedPhoto } from '../domain/types';

type Picker = typeof import('expo-image-picker');
type Manipulator = typeof import('expo-image-manipulator');

const LONG_SIDE = 1280;

function modules(): { picker: Picker; manipulator: Manipulator } | null {
  try {
    // Loaded here, not at the top: an older binary has no native module to load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return { picker: require('expo-image-picker') as Picker, manipulator: require('expo-image-manipulator') as Manipulator };
  } catch {
    // An older phone build: photos are not offered there.
    return null;
  }
}

/** True when this phone or browser can pick and prepare a photo. */
export async function photoPickAvailable(): Promise<boolean> {
  return modules() !== null;
}

/** The person's pick as a JPEG, or null when they cancelled. */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const m = modules();
  if (!m) return null;
  const res = await m.picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: false, exif: false, quality: 1 });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  const long = Math.max(asset.width || 0, asset.height || 0);
  const resize = long > LONG_SIDE
    ? [{ resize: asset.width >= asset.height ? { width: LONG_SIDE } : { height: LONG_SIDE } }]
    : [];
  const out = await m.manipulator.manipulateAsync(asset.uri, resize, { compress: 0.82, format: m.manipulator.SaveFormat.JPEG });
  return { uri: out.uri };
}
