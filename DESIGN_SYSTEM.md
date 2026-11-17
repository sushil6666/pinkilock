# Pinkilock design system

Streetwear editorial, not dating-app pastel. Obsidian ground, one loud colour, heavy type, hard
edges. All values below are in `src/theme/tokens.ts`; screens never hard-code a colour or a size.

## 1. Colour

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | `#0A0A0C` | Every screen background (obsidian) |
| `surface` | `#131316` | Cards |
| `surfaceHi` | `#1C1C21` | Pressed cards, inputs, chips |
| `line` | `#2B2B33` | 1px borders, dividers |
| `text` | `#F6F6F1` | Primary text (17.9:1 on `bg`) |
| `textDim` | `#A3A3AE` | Secondary text (7.6:1 on `bg`) |
| `textMute` | `#6E6E7A` | Captions on large sizes only, never body |
| `pink` | `#FF2E93` | The one accent: primary actions, their pinky, the lock (5.9:1 on `bg`) |
| `pinkDeep` | `#B3115F` | Pressed pink, gradients |
| `pinkWash` | `rgba(255,46,147,0.14)` | Tinted fills behind pink text |
| `volt` | `#D7FF3E` | Kept promises and high trust only |
| `flare` | `#FF5A36` | Flakes and destructive actions only |
| `onPink` | `#0A0A0C` | Text on pink (black on pink is 5.9:1; white on pink fails) |

Rules: pink is for what you can do or what is locked; volt and flare are status, never decoration.
No gradients on text. No pastel tints. State is never shown by colour alone: every status also has
a word or an icon.

## 2. Type

Two families, loaded with `expo-font`:

- **Archivo Black** for display: always uppercase, tight leading, letter spacing -0.5.
- **Space Grotesk** (400, 500, 700) for everything else. Numbers use tabular figures.

| Style | Family | Size / line | Use |
| --- | --- | --- | --- |
| `mega` | Archivo Black | 56 / 58 | Countdown digits, LOCKED |
| `display` | Archivo Black | 40 / 42 | Screen titles, names on cards |
| `title` | Archivo Black | 26 / 29 | Card titles |
| `heading` | Space Grotesk 700 | 20 / 26 | Section heads |
| `body` | Space Grotesk 400 | 16 / 23 | Body |
| `bodyBold` | Space Grotesk 700 | 16 / 23 | Emphasis, buttons |
| `label` | Space Grotesk 700 | 12 / 16, +1.4 tracking, uppercase | Eyebrows, tags, tab labels |
| `caption` | Space Grotesk 500 | 13 / 18 | Meta lines |

Font scaling is allowed up to 1.3x (`maxFontSizeMultiplier`) so layouts hold on large-text phones.

## 3. Space, shape, elevation

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 56. Screen gutter is 20.
- Radius: 6 (chips), 14 (cards, buttons), 28 (sheets), 999 (pills, badges). Cards are squared
  off, never bubbly.
- Borders do most of the separation work (1px `line`). Shadows are used for two things only:
  `raised` (cards over content: iOS y8 blur 24 black 45%, Android elevation 8) and `glow` (the
  primary action and the lock: iOS pink shadow blur 22 at 55%, Android elevation 10 with pink
  `shadowColor`). `src/theme/elevation.ts` returns the right props per platform.
- Touch targets are at least 48 by 48.

## 4. Components

- **Button**: 56 high, radius 14. `primary` pink fill with black label and glow; `ghost` 1px line
  with white label; `danger` flare outline. Press: scale 0.97 in 90 ms, back with a spring; light
  haptic on press in.
- **HoldButton**: press and hold 900 ms to commit (send an ask, swear the promise, bail). A fill
  sweeps left to right; haptic ticks at 33% and 66%, medium impact on completion; letting go early
  drains the fill in 180 ms. Used wherever a tap would be too cheap.
- **Chip**: 40 high, radius 6, uppercase label. Selected is pink fill, black text.
- **InviteCard**: a ticket. Eyebrow with status, the idea in display type, time row, note in quotes,
  a perforated divider, then who it is with and their trust badge.
- **TrustBadge**: pill with a shield icon, score in tabular figures and the tier name. Volt at 90+,
  white 75 to 89, flare under 55. `size="lg"` adds the kept and flaked counts.
- **Portrait**: people are shown as a two-colour gradient block with a large glyph and initial, so
  the prototype ships no stock photos of real people.
- **LockedReveal**: blurred tiles and a masked handle with a lock and the line that says what
  unlocks it.
- **Sheet**: bottom sheet for confirmations (pass, bail). Rises 280 ms with `easeOutCubic` over a
  60% black scrim. There are no system alerts anywhere in the app.
- **Tab bar**: 4 tabs, icon over label, active is pink with a 3px bar above the icon; counts sit in
  a pink pill.

## 5. Motion

| Token | Value | Use |
| --- | --- | --- |
| `fast` | 120 ms | Press states |
| `base` | 240 ms, `Easing.out(Easing.cubic)` | Fades, sheet, step changes |
| `slow` | 520 ms, `Easing.out(Easing.cubic)` | Screen entrances, score count-up |
| `spring.snappy` | damping 18, stiffness 260, mass 0.9 | Buttons, chips |
| `spring.lock` | damping 11, stiffness 210, mass 1 | The hook closing (one visible overshoot) |
| `spring.back` | damping 20, stiffness 180 | A released finger returning |

Lists enter with an 18px rise and fade, staggered 60 ms per item, once. Nothing loops except the
waiting pinky and the live countdown. With Reduce Motion on, entrances become fades, the waiting
pinky holds still and the lock plays without the shake and burst. The hold button's 900 ms sweep
is a timer, not decoration, so it runs in full either way.

## 6. The Pinkilock gesture: exact spec

Implemented in `src/components/PinkyLock.tsx` and `PinkyFinger.tsx`. Everything below runs on the
UI thread (Reanimated shared values, Gesture Handler pan).

### Stage and shapes

- The stage is the full screen width `W`, 340 high, centred at `(cx, cy)`.
- Each pinky is one SVG stroke, 36 wide, round caps: a horizontal run from its own screen edge and
  a 90 degree curl of radius 34 ending in a 46 long tip. **Theirs** enters from the left, is pink
  and curls down. **Mine** enters from the right, is `text` white and curls up. Each has a nail
  (a short lighter stroke at the tip) and two knuckle lines.
- Locked pose: their run sits at `cy - 30` with the curl centred on `cx + 30`; mine at `cy + 30`
  with the curl on `cx - 30`. The two strokes then cross twice. Draw order is theirs, mine, then
  the tip of theirs again, which gives a true over and under link.
- Open pose: the same, but each pinky is lifted away vertically by `gap = 72` (theirs up, mine
  down) so the tips can pass each other.

### Shared values

| Value | Range | Meaning |
| --- | --- | --- |
| `mine` | 0 to 1 | My pinky's travel: 0 is `0.36 W` right of its locked x, 1 is at its locked x. At rest (0.08) the tip sits about 100 px inside the right edge |
| `theirs` | 0 to 1 | Theirs from the left: 0 is fully off-screen (`W/2 + 96` left of its locked x), 1 is at its locked x |
| `hook` | 0 to 1 | Vertical close: 0 is `gap` apart, 1 is interlocked |
| `burst` | 0 to 1 | The ring that fires on lock |
| `shake` | px | Horizontal tug applied to both pinkies |

### Two modes, one ending

- **Seal** (they went first): `theirs = 1` from the start, bobbing 4px on a 1.6 s sine loop.
- **First** (I go first): `theirs = 0` and a dim slot with a dashed centre line marks where theirs will arrive.

### Timeline

1. **Idle.** My pinky rests at `mine = 0.08` with a nudge hint (a 10px slide and back, every 2.4 s,
   stops at first touch). Prompt: `SLIDE YOUR PINKY IN`.
2. **Drag.** Pan, horizontal only (`activeOffsetX` of 8; 24 px of vertical travel fails the gesture).
   The touch area is inset 32 px from both screen edges, so it never competes with Android's
   edge-swipe back zone or the iOS back swipe, and the stack's own swipe-back is off on this screen.
   `mine = clamp(start + (-translationX) / (0.36 W), 0, 1)`,
   1:1 with the finger, no easing. A selection haptic fires each time `mine` crosses 0.25, 0.5 and
   0.75 going forward. The track line under the stage fills in pink from the right up to `mine`. From 0.75 the centre ring
   scales from 1 to 1.12 and brightens: the magnet zone.
3. **Release below 0.82.** `mine` springs back to 0.08 with `spring.back`; one light impact. Text:
   `ALMOST. ALL THE WAY IN.`
4. **Commit** (release at or above 0.82, or reaching 1.0 while dragging): input is disabled,
   `mine` goes to 1 with `spring.snappy`; one medium impact.
   - *First mode only:* state is saved as `half_locked`, the prompt becomes `PINKY OUT. WAITING ON
     {NAME}`, my pinky pulses (scale 1 to 1.04, 900 ms loop). When their pinky arrives (realtime
     event; the mock sends it after about 2.4 s) `theirs` runs 0 to 1 in 620 ms with
     `Easing.out(Easing.cubic)` and a light impact lands on arrival.
5. **Hook** (both at 1): `hook` 0 to 1 with `spring.lock`. At the same instant: heavy impact.
6. **Tug**, 140 ms after the hook starts: `shake` runs 0, -7, 6, -3, 0 px over 320 ms (the pull that
   tests the lock); success notification haptic at its start.
7. **Burst**, with the tug: a pink ring at `(cx, cy)` scales 0.4 to 2.6 and fades 0.9 to 0 over
   700 ms with `Easing.out(Easing.quad)`; the background flashes `pinkWash` for 240 ms.
8. **Sealed**, 520 ms after the hook: `LOCKED.` drops in (`mega`, 24px rise, `spring.snappy`),
   followed 160 ms later by the promise card with the live countdown and the two actions.

Total from commit to sealed in seal mode: about 1.2 s. During steps 4 to 8 Android back is ignored
so a promise is never left half drawn; before that, back leaves without changing anything.

### Haptic map (the same on both platforms)

| Moment | Call |
| --- | --- |
| Crossing 25 / 50 / 75% | `selectionAsync()` |
| Let go early | `impactAsync(Light)` |
| Commit | `impactAsync(Medium)` |
| Their pinky arrives | `impactAsync(Light)` |
| Hook closes | `impactAsync(Heavy)` |
| Tug | `notificationAsync(Success)` |

### Accessibility

The stage is one accessible element labelled `Slide your pinky in to lock this plan` with an
`activate` action, and a visible `Lock without sliding` button sits below it, so the promise
never depends on a drag. Both run the same commit timeline from step 4.

In a browser the stage is as wide as the column that holds it (not the window) and clips what it
draws. It takes keyboard focus: Left or Up slides the pinky in a quarter at a time (Right or Down
back out), the fourth press commits, and Enter, Space or End commit at once. A mouse drags it
exactly as a finger does.

## 7. Voice

Short, lowercase-friendly, a little dry. Say the rule plainly: "No ghosting. If you lock it, you
show." Buttons are verbs: Send vibe check, Lock it, Check in, Bail. Never guilt, never streak
pressure: a flake is recorded, not shamed.
