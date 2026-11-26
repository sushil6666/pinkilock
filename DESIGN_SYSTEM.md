# Pinkilock design system

Moonlight over Mumbai. A twilight-indigo night sky (never black), a golden moon, pink and gold
pinkies, heavy rounded type, and things that look made by hand: clay you could squash, buttons you
press down onto a block, notes stuck on a little crooked, a scribble in the margin. The night is
alive: stars twinkle, the moon glows, buttons spring. All values below are in
`src/theme/tokens.ts`; screens never hard-code a colour or a size.

## 1. Colour

| Token | Hex | Use |
| --- | --- | --- |
| `bg` | `#241A63` | Every screen background (twilight indigo: the night sky; no black anywhere) |
| `surface` | `#30237A` | Cards |
| `surfaceHi` | `#3D2E91` | Pressed cards, inputs, chips, the skyline |
| `line` | `#5A49B8` | 1px borders, dividers (violet) |
| `text` | `#FFF8E7` | Primary text, a warm moonlit white (14.1:1 on `bg`) |
| `textDim` | `#D3CBF5` | Secondary text (pale lavender, 9.7:1 on `bg`) |
| `textMute` | `#A99CE3` | Captions (muted lavender, 6.1:1 on `bg`), never body |
| `gold` | `#F5C95C` | Moonlight gold: the primary action, kept promises, high trust, my pinky (9.6:1 on `bg`) |
| `goldDeep` | `#B8892A` | The block under a gold button, knuckle lines, place-card borders |
| `goldWash` | `rgba(245,201,92,0.14)` | Tinted fills behind gold text; the moon's glow |
| `moon` | `#FFE6A3` | The moon, stars and lit windows on the first screen only |
| `pink` | `#FF6FAE` | Their pinky, the lock, eyebrows, selected chips (5.8:1 on `bg`) |
| `pinkDeep` | `#C2457E` | Knuckle lines, gradients |
| `shine` | `rgba(255,255,255,0.34)` | Light along the top of the logo's fingers |
| `pinkWash` / `pinkHalo` | `rgba(255,111,174,0.16 / 0.38)` | Tinted fills behind pink text; the nail on my pinky |
| `flare` | `#FF8466` | Flakes and destructive actions only (6.2:1 on `bg`) |
| `onGold` / `onPink` | `#241A63` | Text on gold (9.6:1) and on pink (5.8:1): the sky's own indigo |
| `onPhoto` | `rgba(20,14,60,0.88)` | Behind a badge that sits on a portrait, so gold and white stay sharp |
| `shadow` | `#0E0838` | What shadows are cast in: the sky, deeper. Never black |

Rules: gold is for what you can do and for promises kept; pink is the pinky and what is locked;
flare is status, never decoration. No black, no gradients on text. State is never shown by colour
alone: every status also has a word or an icon.

## 2. Type

Two families, loaded with `expo-font`:

- **Inter Tight** ExtraBold (800) for display: sentence case (never uppercase), tight leading,
  negative letter spacing. Crisp, compact and loud. Its ExtraBold Italic is for the wordmark only.
- **Inter Tight** (400, 500, 700) for everything else, so one family carries the whole app. Numbers
  use tabular figures.
- **Caveat Brush** for a hand: a person's own words (the note on an ask) and the odd scribble on the
  first screen. Never for a control, a rule or a number someone has to read exactly.

| Style | Family | Size / line | Use |
| --- | --- | --- | --- |
| `mega` | Inter Tight 800 | 54 / 58, -1.5 tracking | Countdown digits, Kept., the first screen's promise |
| `display` | Inter Tight 800 | 38 / 42, -1 tracking | Screen titles, names on cards |
| `title` | Inter Tight 800 | 25 / 30, -0.5 tracking | Card titles |
| `heading` | Plus Jakarta Sans 700 | 20 / 26 | Section heads |
| `body` | Plus Jakarta Sans 400 | 16 / 23 | Body |
| `bodyBold` | Plus Jakarta Sans 700 | 16 / 23 | Emphasis, buttons |
| `label` | Plus Jakarta Sans 700 | 12 / 16, +1.4 tracking, uppercase | Eyebrows, tags, tab labels |
| `caption` | Plus Jakarta Sans 500 | 13 / 18 | Meta lines |
| `hand` | Caveat Brush | 24 / 27 | A person's own note, scribbles, the step numbers on the first screen |

Font scaling is allowed up to 1.3x (`maxFontSizeMultiplier`) so layouts hold on large-text phones.

## 3. Space, shape, elevation

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 56. Screen gutter is 20. The app is never drawn
  wider than 480: on a tablet or in a wide browser window it is a centred column on `bg`,
  with a 1px `line` down each side.
- Radius: 6 (chips), 14 (cards, buttons), 28 (sheets), 999 (pills, badges). Cards are squared
  off, never bubbly.
- Borders do most of the separation work (1px `line`). Shadows are used for two things only:
  `raised` (cards over content: iOS y8 blur 24 in `shadow` at 50%, Android elevation 8) and `glow`
  (the primary action and the lock: iOS gold shadow blur 22 at 50%, Android elevation 10 with gold
  `shadowColor`). `src/theme/elevation.ts` returns the right props per platform.
- Touch targets are at least 48 by 48.

## 4. Components

- **Button**: a slab you press. The 56-high face (radius 14) stands `depth` (5) above a darker block
  and sinks onto it in 70 ms under a finger, a mouse or a key, then springs back; light haptic on
  press in. `primary` is a gold face on `goldDeep` with `onGold` text; `ghost` a `surface` face with a 1px line on
  `line`; `danger` a `surface` face with a flare outline on `flare`; `quiet` is text only. A button
  that cannot be pressed sits sunk, level with its block. No glow.
- **HoldButton**: the same slab, drawn as a `depth`-thick bottom edge in its fill colour. Press and hold 900 ms to commit (send an ask, swear the promise, bail). A fill
  sweeps left to right; haptic ticks at 33% and 66%, medium impact on completion; letting go early
  drains the fill in 180 ms. Used wherever a tap would be too cheap.
- **Chip**: 40 high, radius 6, uppercase label. Selected is pink fill, indigo text.
- **Plan option** (`IdeaChip`): a chip with the time and one-liner under the title, and a chevron on the right (48 wide) that opens What you do / Where / Cost / Why it works under a hairline. Headings are gold captions (indigo when selected). The row picks; only the chevron opens.
- **InviteCard**: a ticket. Eyebrow with status, the idea in display type, time row, note in quotes,
  a perforated divider, then who it is with and their trust badge.
- **TrustBadge**: pill on `onPhoto` with a 1.5px border in its tone and a shield icon, score in tabular figures and the tier name. Gold at 90+,
  white 75 to 89, flare under 55. `size="lg"` adds the kept and flaked counts.
- **Portrait**: people are shown as a two-colour gradient block with a large glyph and initial, so
  the prototype ships no stock photos of real people. When someone's face has been checked (D095),
  it takes the block's place, `cover`-cropped, under the same bottom fade (`onPhoto`) so the name and
  badge stay readable; a link that fails falls back to the block.
- **Face camera**: a 3:4 frame (`radius.card`) with the front camera, the area outside a face oval
  dimmed with `scrim`, the oval in a dashed `pink` line and a "Fit your face in the oval" pill on
  `onPhoto`. After the shot: the photo in the same frame, the line saying who will see it, then
  "Use this photo" (primary) and "Retake" (ghost). On Me, no face is a dashed `pink` row with a
  camera disc; with one, a gold "On your card" line and Change / Take down tags.
- **LockedReveal**: blurred tiles and a masked handle with a lock and the line that says what
  unlocks it.
- **Sheet**: bottom sheet for confirmations (pass, bail, blocked location); on desktop a dialog in the middle of the window. Rises 280 ms with `easeOutCubic` over a
  72% indigo scrim. There are no system alerts anywhere in the app.
- **Loop**: a short clay animation, a GIF drawn in 3D by `scripts/make-loops.mjs` (two pinkies
  hooking, the pair tilted 45 degrees rising to the right like the logo mark; a padlock clicking shut). Drawn on `bg` and keyed out, so it only goes on `bg`, never on a
  card. Decoration: hidden from screen readers, and a still frame (the lock closed) with reduced
  motion. The welcome screen and the not-found screen use them.
- **Logo**: the two pinkies locked (pink theirs, gold mine, the app icon's geometry), turned 45
  degrees so they rise to the right and standing on a 14-unit block of `pinkDeep` and `goldDeep`
  (3D depth straight down the screen) with a `shine` along each finger, beside
  "pinkilock" in Inter Tight ExtraBold Italic, with no full stop (`src/components/Logo.tsx`). It sits top centre on
  every screen: `Screen` draws it in the header, with the back control left and the screen's title
  as a small label under it. A page with its own top bar passes `logo={false}`. Read out as
  "Pinkilock".
- **NightSky**: the first screen's backdrop (`src/components/NightSky.tsx`): the golden moon with a
  soft glow that breathes, a dozen stars that twinkle out of step, and the Mumbai skyline along
  the sea (towers with lit windows, the Gateway arch, the Sea Link's cables in gold), running to
  the screen's edges. The pinkies float in it. Decoration only, still with reduced motion. On the
  desktop front page (`wide`) the sky spans the whole window, the moon sits above the pinkies, and
  the city carries on past the landmarks with more towers, cropped at the sides, never the top.
  Signed in, the landmarks show only for someone in Mumbai; every other city gets plain towers in
  their place (`landmarks={false}`). On a desktop `form` screen the sky fills the left side with
  no dividing line, and the city (`City`) runs along the bottom of the whole window (D086).
- **Places**: on the phone's first screen, a sideways row of real venues from `VENUES` ("Where
  plans happen"), one city each, so the row shows India rather than one city: a gold kind icon, the
  name and the city on a `surface` card with a `goldDeep` border. On the desktop front page, one
  place in each of the first twelve cities, with "area, city" under it. The skyline stays Mumbai's.
- **Where picker** (`WherePicker`, sign-up and Me): city chips in two groups, "Metros" then "More
  cities" in a `textMute` caption, then the area search and area chips for the picked city. On Me,
  "Where I am" is a `panel` row (gold pin, "area, city", a gold Move tag) that opens the picker and a
  "Move to {city}" button.
  On top sits a ghost "Use my location" button (crosshair icon) with a `textMute` note under it:
  finding, found, "said no" with "Try my location again", or outside every open city, and always
  that the location stays on the phone. Found areas show as "Nearest to you" chips. A typed name
  with no match shows "Did you mean" chips and a gold `Tag` "Use "{area}" as my area"; a chosen
  area of one's own shows as a chip marked "your own" (D087).
- **Welcome**: the first screen. The pinkies, a scribbled note pointing at them, the promise in
  `mega`, and the three steps as notes on a `line` block, each tilted by a degree or so.
- **Landing**: the same first screen in a window 960 or wider, as the website's front page, using
  the whole window (no side hairlines); text columns stop at `wideMax` (1200). A top bar with the
  logo in the middle and Sign in and Start on the right, the hero (pinkies left, words and Start right), then sections for
  how it works, the rules (cards beside the padlock), micro-date ideas, places, questions, and a
  closing Start. Sections are a pink `label` over a `display` title; cards are `surface` with a
  `line` border; places are a pink left rule. Only tokens, so a theme change carries over.
- **Tab bar**: 4 tabs, icon over label, active is pink with a 3px bar above the icon; counts sit in
  a pink pill. On desktop it is a menu down the left (`sideNav`, 232): icon beside label, the
  active tab on `surface` with a pink bar at its left edge, counts in a pink pill.
- **Desktop** (a browser window 960 or wider, `useDesktop`): every screen says what kind it is with
  `Screen`'s `desk`. `page` runs up to `deskMax` (1080) and lays out two columns with `Columns`
  (a picture or the next plan on the left, details on the right) or `Grid` (a list in two
  columns). `form` puts the night sky and the pinkies on the left and the form, with its footer,
  on the right at `columnMax`. `read` stops at `readMax` (760). The logo stays top centre. Phones
  and narrow windows keep the phone layout.
- **Wallet** (D104): existing tokens only. Credits are gold: a gold coin with a `star` before every
  amount, the balance and the Me entry on gold (`goldWash` behind `goldDeep`), a voucher as a solid
  `gold` card with the code in `display` and `onGold`. Rewards use `gift` (pink) until done
  (`check-circle`, gold). Spicy's unlock keeps Spicy's pink panel with a gold meter. The words say
  "credits", never "money" or "coins", and always that credits are never cash.
- **Spicy voice calls** (D111): inside the timer card, **Join the call** is the primary button
  (`phone-call`); once on the call, full-width ghost **Mute** / **Unmute** (`mic`, `mic-off`) and
  **Leave the call** (`phone-off`), a pink line when muted, a gold "Connecting…" line, and a small
  `mic` line in `textMute`: voice only, never the camera, never recorded. After a kept call, "Keep in
  touch somewhere else?" is a `label` with a ghost **Share my usernames** (`share-2`); the usernames
  appear in the same `surface` cards as before, with a quiet **Stop sharing** under them.
- **Spicy call times** (D106): a gold panel (`goldWash`, `goldDeep`) inside Spicy's pink one, with a
  `phone` eyebrow. Times and lengths are `Chip`s; the set call sits in a `surface` card with
  `phone-call`; the timer shows "n of m min together" in `title` gold over a gold meter, and a gold
  or `line` dot for whether the other person has the app open. "I felt unsafe or uncomfortable" is
  on screen for the whole call, and the words always say that leaving is allowed. Long button labels
  wrap to two lines (`Button`'s `wrap`) rather than being cut.
- **Talk mode** (D108): existing tokens only, and calm. The AI is `moon`: a `cpu` icon and an
  outlined "AI · not a person" badge on its card, its title and every reply, plus a line above the
  message box that never scrolls away. A real listener is gold (`goldWash` behind `goldDeep`), as is
  a call that rings or runs. The help lines sit in a `surface` card with `life-buoy`; after a mention
  of self-harm they turn `flare` with the call button primary. The chat uses `read` on a desktop (no
  pinkies beside it: Talk mode is not dating).
- **Spicy mode** (D103): existing tokens only. Its own things are pink (`pinkWash` behind `pinkDeep`:
  the Me entry card with a `zap` icon, the "on" panel, the hand-off on a card or a plan); the safety rules sit on
  gold (`goldWash` behind `goldDeep`) with a `shield` before each. Boundaries are chips, pink when
  picked, and pink tags on a plan. The words stay tasteful: "Spicy", never "naughty" or explicit.
  The terms and quiz (D107) take the form's place until passed, in a `surface` panel edged
  `pinkDeep`: each terms section has its own icon, gold, or `flare` for the "never" ones (privacy,
  camera, photos, threats, never allowed); a quiz question shows one at a time with a pink progress
  bar and options as rows that turn gold (`goldWash` behind `gold`) when picked. A pass is a gold
  panel with `check-circle`; a miss lists each missed question with its reason by a gold `shield`.
- **Self love** (D101): the private page uses the existing tokens only. Its own things are gold
  (`goldWash` behind `goldDeep`: the kind line in the hand font in `moon`, the Me entry card, done
  reset steps, the gold-week badge filled `gold`), and Bounce back is pink (`pinkWash` behind
  `pinkDeep`). Mood buttons are slabs on `surfaceHi`, pink when picked; the week is seven rings.

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
waiting pinky, the live countdown, and the first screen's stars and moon. With Reduce Motion on, entrances become fades, the waiting
pinky holds still and the lock plays without the shake and burst. The hold button's 900 ms sweep
is a timer, not decoration, so it runs in full either way.

## 6. The Pinkilock gesture: exact spec

Implemented in `src/components/PinkyLock.tsx` and `PinkyFinger.tsx`. Everything below runs on the
UI thread (Reanimated shared values, Gesture Handler pan).

### Stage and shapes

- The stage is the full screen width `W`, 340 high, centred at `(cx, cy)`.
- Each pinky is one SVG stroke, 36 wide, round caps: a horizontal run from its own screen edge and
  a 90 degree curl of radius 34 ending in a 46 long tip. **Theirs** enters from the left, is pink
  and curls down. **Mine** enters from the right, is `gold` and curls up. Each has a nail
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

Every word lives in `src/i18n/en.ts`, never in a screen. A translation keeps the meaning and the
tone, not the words, and is written by a native speaker: a flirty line that works in English can
fall flat or offend elsewhere. Lay text out to grow: a label may run a third longer in another
language, so rows of chips wrap and one-line labels truncate rather than push off the screen.
Open the web build with `?lang=en-XA` to see every screen a third longer before calling a layout
done.

Other scripts (D102): Latin letters stay Inter Tight, and each Indian script reads in its Noto
font at the same weight (on a phone, the system's own). Lines open up by about a third (Arabic
script by two fifths) and letter spacing is dropped, so marks above and below the letters never
clip; `T` does this by itself. Digits stay 0 to 9. The language picker is a small pill with a
globe and the language's own name, top left on the welcome screen and the website's header, and
a row on Me; its list writes every language in its own script. Machine-drafted translations may
ship to staging, never to launch, until a native speaker has read them.
