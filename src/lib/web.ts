/**
 * The few places where a browser needs something a phone does not. Screens and components never
 * branch on the platform themselves: they call these, and on iOS and Android each one does nothing.
 */
import { Platform } from 'react-native';
import { color } from '../theme/tokens';

export const isWeb = Platform.OS === 'web';

/**
 * The browser's own focus ring, in pale lavender so that it reads on the night sky. Spread into the
 * style of anything focusable that is not a text input (those get theirs in `ui/input.ts`).
 */
export const focusRing: object = isWeb ? { outlineColor: color.textDim } : {};

/**
 * One rule for every control, present and future: whatever the keyboard lands on gets the same
 * lavender ring, clear of its own edge so that it reads around a gold button too. Added through
 * the style sheet's own interface, so it needs no inline style. Runs once, when this file loads.
 */
function startFocusRing(): void {
  if (!isWeb || typeof document === 'undefined' || document.getElementById('focus-ring')) return;
  const el = document.createElement('style');
  el.id = 'focus-ring';
  document.head.appendChild(el);
  el.sheet?.insertRule(`:focus-visible { outline: 2px solid ${color.textDim}; outline-offset: 2px; }`);
}
startFocusRing();

/**
 * What a control is right now, said the way a browser hears it. `accessibilityState` tells
 * VoiceOver and TalkBack, but the web renderer drops it, so a screen reader in a browser could
 * not tell the chosen chip, tab or reason from the rest. Spread next to `accessibilityState`:
 * `pressed` for a toggle button, `selected` for a tab, `checked` for a radio.
 */
export function aria(state: { pressed?: boolean; selected?: boolean; checked?: boolean; expanded?: boolean }): object {
  if (!isWeb) return {};
  const out: Record<string, boolean> = {};
  if (state.pressed !== undefined) out['aria-pressed'] = state.pressed;
  if (state.selected !== undefined) out['aria-selected'] = state.selected;
  if (state.checked !== undefined) out['aria-checked'] = state.checked;
  if (state.expanded !== undefined) out['aria-expanded'] = state.expanded;
  return out;
}

/**
 * Props that only exist in a browser (tabIndex, onKeyDown with a DOM keyboard event). Empty on a
 * phone. Typed as an opaque object: React Native 0.88 has an onKeyDown of its own with a different
 * event, and these never reach it.
 */
export function webOnly<P extends object>(props: P): object {
  return isWeb ? props : {};
}

/**
 * A hold that finishes while the finger is still down often changes the screen under it. When the
 * finger then lifts, the browser taps whatever is there now (a tab, a button on the next screen).
 * Call this at the moment the hold completes: it eats that one click and nothing else.
 *
 * It lets go on the first release, on any key going down or coming up, or after ten seconds,
 * whichever comes first, so a hold finished from the keyboard never costs the person their next
 * real click.
 */
export function swallowReleaseClick(): void {
  if (!isWeb || typeof document === 'undefined') return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let at: { x: number; y: number } | null = null;
  // Only the click the release itself produces: same spot, same burst of events. A person's
  // next real click lands somewhere else, or later.
  const eat = (e: MouseEvent) => {
    if (!at || Math.abs(e.clientX - at.x) > 4 || Math.abs(e.clientY - at.y) > 4) return;
    e.preventDefault();
    e.stopPropagation();
    stop();
  };
  const released = (e: PointerEvent) => {
    at = { x: e.clientX, y: e.clientY };
    clearTimeout(timer);
    timer = setTimeout(stop, 400);
  };
  function stop() {
    clearTimeout(timer);
    document.removeEventListener('click', eat, true);
    document.removeEventListener('pointerup', released, true);
    document.removeEventListener('pointercancel', stop, true);
    document.removeEventListener('keydown', stop, true);
    document.removeEventListener('keyup', stop, true);
  }
  document.addEventListener('click', eat, true);
  document.addEventListener('pointerup', released, true);
  document.addEventListener('pointercancel', stop, true);
  document.addEventListener('keydown', stop, true);
  document.addEventListener('keyup', stop, true);
  timer = setTimeout(stop, 10_000);
}

/** The browser tab's title. A phone has none. */
export function setPageTitle(title: string): void {
  if (isWeb && typeof document !== 'undefined' && document.title !== title) document.title = title;
}
