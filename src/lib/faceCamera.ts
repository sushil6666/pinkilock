/**
 * The camera for the face on a card (D095). Front camera only, no gallery: an ordinary person
 * cannot send a screenshot of a handle as their face. (A modified app could send any picture,
 * so a person still checks every one.) On the web it is the browser's camera.
 *
 * A phone build from before expo-camera was added (0.2.x) has no native module: it says so, and
 * Me shows that the face needs the new version.
 */
type Camera = typeof import('expo-camera');

let cached: Camera | null | undefined;

export function cameraModule(): Camera | null {
  if (cached !== undefined) return cached;
  try {
    // Loaded here, not at the top: an older binary has no native module to load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-camera') as Camera;
  } catch {
    // An older phone build: the face is not offered there.
    cached = null;
  }
  return cached;
}
