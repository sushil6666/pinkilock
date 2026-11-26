/**
 * In-app voice calls (D111, shared with Talk mode, D108). Audio only: this file never asks for the
 * camera, never publishes or plays video, and nothing is recorded. The server enforces the same:
 * the LiveKit token may publish the microphone and nothing else (supabase/functions/_shared/livekit.ts).
 *
 *   const call = await joinVoice({ url, token }, { onState, onOther });
 *   call.mute(true); ... call.leave();
 *
 * The same code runs on the web (livekit-client in the browser) and on phones (livekit-client over
 * @livekit/react-native's WebRTC; ./voiceSetup.native.ts). A phone build from before 0.4.0 has no
 * WebRTC module: joinVoice then fails with PL179 and the screen says calls need the new version.
 * The mock backend answers MOCK_VOICE_URL, which joins nothing and plays silence.
 */
import { Platform } from 'react-native';
import { MOCK_VOICE_URL } from '../domain/calls';
import { AppError } from '../domain/errors';
import { quiet } from './log';
import { endAudio, startAudio } from './voiceSetup';

export type VoiceState = 'connecting' | 'connected' | 'reconnecting' | 'ended';

export interface VoiceEvents {
  /** The connection to the room. 'ended' once it closed, for any reason. */
  onState?: (state: VoiceState) => void;
  /** Whether the other person is in the room. */
  onOther?: (present: boolean) => void;
}

export interface VoiceCall {
  mute(on: boolean): Promise<void>;
  leave(): Promise<void>;
}

export async function joinVoice(room: { url: string; token: string }, events: VoiceEvents = {}): Promise<VoiceCall> {
  if (room.url === MOCK_VOICE_URL) return mockCall(events);
  let lk: typeof import('livekit-client');
  try {
    await startAudio();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    lk = require('livekit-client') as typeof import('livekit-client');
  } catch {
    throw new AppError('PL179');
  }
  const { Room, RoomEvent, Track } = lk;
  const r = new Room({ adaptiveStream: false, dynacast: false, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const played = new Set<HTMLMediaElement>();
  const others = () => r.remoteParticipants.size > 0;
  r.on(RoomEvent.ParticipantConnected, () => events.onOther?.(others()));
  r.on(RoomEvent.ParticipantDisconnected, () => events.onOther?.(others()));
  r.on(RoomEvent.Reconnecting, () => events.onState?.('reconnecting'));
  r.on(RoomEvent.Reconnected, () => events.onState?.('connected'));
  r.on(RoomEvent.Disconnected, () => {
    for (const el of played) el.remove();
    played.clear();
    endAudio().catch(quiet('voice.end'));
    events.onState?.('ended');
  });
  r.on(RoomEvent.TrackSubscribed, (track) => {
    // Only sound. A video track cannot be published with our token, and is never shown anyway.
    if (track.kind !== Track.Kind.Audio) {
      track.stop();
      return;
    }
    if (Platform.OS === 'web') {
      const el = track.attach();
      el.style.display = 'none';
      document.body.appendChild(el);
      played.add(el);
    }
  });
  r.on(RoomEvent.TrackUnsubscribed, (track) => {
    if (Platform.OS === 'web') for (const el of track.detach()) { played.delete(el); el.remove(); }
  });
  events.onState?.('connecting');
  try {
    await r.connect(room.url, room.token, { autoSubscribe: true });
    await r.localParticipant.setMicrophoneEnabled(true);
  } catch (e) {
    await r.disconnect().catch(quiet('voice.connect'));
    // The microphone was refused (PL180), or the room could not be reached.
    if (e instanceof AppError) throw e;
    const name = e instanceof Error ? e.name : '';
    throw new AppError(name === 'NotAllowedError' || name === 'PermissionDeniedError' || /permission/i.test(e instanceof Error ? e.message : '') ? 'PL180' : 'PC001');
  }
  events.onState?.('connected');
  events.onOther?.(others());
  return {
    mute: async (on) => { await r.localParticipant.setMicrophoneEnabled(!on); },
    leave: async () => { await r.disconnect(); },
  };
}

/** The mock's room: nobody to hear, and the made-up person is "there" at once. */
function mockCall(events: VoiceEvents): VoiceCall {
  events.onState?.('connecting');
  const t = setTimeout(() => {
    events.onState?.('connected');
    events.onOther?.(true);
  }, 300);
  return {
    mute: async () => undefined,
    leave: async () => {
      clearTimeout(t);
      events.onState?.('ended');
    },
  };
}
