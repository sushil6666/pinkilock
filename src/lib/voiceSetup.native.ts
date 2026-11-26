/**
 * Voice calls on a phone (D111): WebRTC from @livekit/react-native, set up once, and the phone's
 * audio session for the length of a call. Loaded on demand: a build without the native module
 * throws here, and joinVoice says calls need the new version (PL179).
 */
type LiveKitNative = typeof import('@livekit/react-native');

let lk: LiveKitNative | null = null;

function native(): LiveKitNative {
  if (lk) return lk;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('@livekit/react-native') as LiveKitNative;
  mod.registerGlobals();
  lk = mod;
  return mod;
}

export async function startAudio(): Promise<void> {
  await native().AudioSession.startAudioSession();
}

export async function endAudio(): Promise<void> {
  if (lk) await lk.AudioSession.stopAudioSession();
}
