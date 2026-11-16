# Pinkilock architecture

Pinkilock is a one-on-one pre-dating app. A match is not a chat thread: it is one specific,
time-bound micro-date that both people lock with a pinky promise. This file says how the system is
put together and why. The look and the gesture are specified in `DESIGN_SYSTEM.md`.

## 1. The three parts

```
  Phone (Expo / React Native)            Supabase (PostgreSQL, OLTP)            Analytics worker (OLAP)
 +----------------------------+  rpc   +-------------------------------+ scan  +---------------------------+
 | screens -> store -> Backend| -----> | promise functions (definer)   | ----> | DuckDB + postgres scanner |
 |            ^               |        | invites, profiles, RLS        |       | trust, funnel, retention  |
 |            +--- Realtime --| <----- | events (append-only log)      | <---- | writes trust_scores back  |
 +----------------------------+        +-------------------------------+ write +---------------------------+
        mock backend when no keys
```

| Layer | Choice | Why |
| --- | --- | --- |
| App | Expo SDK 52, React Native 0.76 (New Architecture), TypeScript strict, Expo Router 4 | One codebase for Android and iOS, runs in Expo Go today |
| Motion | Reanimated 3 + Gesture Handler 2 | The lock gesture runs on the UI thread at 60fps |
| Touch feedback | Expo Haptics behind `src/lib/haptics.ts` | One vocabulary on both platforms, silent on web |
| Client state | Zustand (`src/state/store.ts`) | Small, no providers, narrow re-renders |
| Live data (OLTP) | Supabase: Postgres, Auth, Realtime, Row-Level Security | Promises are small transactions that must be right |
| Analytics (OLAP) | DuckDB with its `postgres` extension, in a Python worker | Whole-log scans stay off the live database |
| Fallback | Mock backend in the phone (`src/services/mock`) | The full flow is testable before any key exists |

## 2. Folder structure

```
app/                         Routes only. A route file wires state to components.
  _layout.tsx                Fonts, gesture root, safe area, system bars, boot
  index.tsx                  Gate: onboarding or tabs (and the cannot-connect screen)
  onboarding.tsx             5 steps: hello, you, ideas, vibe, the promise
  (tabs)/                    _layout (custom tab bar), index (Discover), invites, plans, me
  profile/[id].tsx           Someone's profile, locked reveal
  invite/new.tsx             Vibe check composer
  invite/[id].tsx            One invitation: lock, seal, pass, take back
  lock/[id].tsx              The Pinkilock gesture
  plan/[id].tsx              Countdown, check in, bail, reveal
src/
  theme/                     tokens.ts (colour, type, space, motion), elevation.ts
  components/
    ui/                      T, Button, HoldButton, Chip, Screen, Sheet, input
    PinkyLock.tsx            The gesture surface (DESIGN_SYSTEM.md section 6)
    PinkyFinger.tsx          The two SVG pinkies
    InviteCard, TrustBadge, Portrait, LockedReveal, Countdown, NoticeBanner
  domain/                    Rules, no IO: types, invites (state machine), trust, time, ideas
  services/
    backend.ts               The Backend interface (the repository layer)
    index.ts                 Picks mock or Supabase from the environment
    mock/                    seed.ts, mockBackend.ts (latency + a simulated other person)
    supabase/                supabaseBackend.ts (Auth, rpc, RLS reads, Realtime)
  state/store.ts             Zustand: cache of backend rows + actions
  lib/                       haptics, useNow, useReveal
supabase/schema.sql          Tables, RLS policies, promise functions, analytics role
analytics/duckdb_pipeline.py DuckDB worker: Trust Scores, conversion funnel, retention
tests/db/                    Throwaway-Postgres checks for the schema, RLS and the pipeline
```

Rule of thumb: `domain/` knows the rules, `services/` knows where data lives, `state/` knows what
the screen currently holds, `components/` know how it looks, `app/` joins them.

## 3. State management

One store, three kinds of state:

1. **Server cache**: `me`, `myContact`, `profiles`, `invites`, `passedIds`. Only ever written with
   rows the backend returned.
2. **Session**: `ready`, `bootError`, `notice` (the in-app banner).
3. **Derived**: never stored. Screens compute incoming asks, locked plans and trust tiers from the cache.

Every action has the same shape: call the backend, merge the rows it returned. There are no
optimistic writes: a promise is the one thing the UI must never show before it is true. The lock
animation itself waits for the backend to say `locked`.

```
screen -> store action -> backend.method() -> rows -> merge -> screen
                              |
                              +-> backend.subscribe(event) -> merge + notice   (the other person, the clock)
```

`backend.subscribe` is the realtime channel. With Supabase it is a Realtime `postgres_changes`
subscription on `invites` and `trust_scores` (RLS filters the feed to rows I may read). In the mock
it carries the simulated other person.

## 4. The invite state machine

```
            send                 first pinky               second pinky
  (none) ---------> sent ------------------> half_locked ---------------> locked
                     |  \                          |                        |
              pass   |   \ 24h no answer           | pass                   | both check in      -> kept
                     v    v                        v                        | someone bails or
                 declined  expired             declined                     | misses the window  -> flaked
```

- **sent**: a vibe check is an ask, nothing is promised yet. It expires 24 hours after sending or
  at the start time, whichever is first.
- **half_locked**: one person has done the gesture (`first_pinky_by`). The receiver goes first.
- **locked**: the sender sealed it. Both have performed the gesture; the Anti-Ghosting Promise
  applies and the countdown starts. This is one `update` in Postgres, pushed to both phones by Realtime.
- **kept**: both checked in inside the window (10 minutes before the start to 30 minutes after).
- **flaked**: someone bailed after locking, or did not check in. Only that person's record moves.

The rules exist twice, on purpose, and must match: `src/domain/invites.ts` (used by the mock and
for what the UI offers) and the SQL functions in `supabase/schema.sql` (the authority in live mode).

Limits that keep intent high: 3 open asks at a time, one live invite per pair (a unique partial
index), a note of at most 80 characters, and no free-text chat anywhere before the micro-date.

## 5. Live database (Supabase / PostgreSQL)

Full DDL is `supabase/schema.sql`. Tables:

| Table | What it holds | Who can touch it |
| --- | --- | --- |
| `profiles` | The public card: name, age (18+ check), area, tagline, vibes, `idea_ids` | Read: any signed-in user. Write: only your own row |
| `profile_private` | Contact handle and extra photos | Read: you, and anyone with a `kept` invite with you. Write: you |
| `ideas` | The micro-date catalogue | Read only |
| `invites` | The whole product: who, what, when, status, `first_pinky_by`, `check_ins`, `flaked_by` | Read: the two people on it. **No direct writes at all** |
| `passes` | People I passed on in Discover | Only me |
| `events` | Append-only behaviour log | No client access. Written by the functions, read by analytics |
| `trust_scores` | One row per person, written by the DuckDB worker | Read: any signed-in user |
| `profile_cards` (view) | `profiles` joined to `trust_scores` | What the app selects for a card |
| `analytics.metrics_daily`, `analytics.retention_weekly` | Worker output | Analytics role only |

**Writes go through functions, not tables.** `send_invite`, `offer_pinky`, `decline_invite`,
`check_in`, `bail` are `security definer` functions that check `auth.uid()`, lock the row, apply
one transition and append to `events`. `sweep_invites` is the clock (expire asks, turn missed
check-ins into flakes); schedule it every minute with pg_cron. `log_event` lets the app record
`app_open` and nothing else.

**The accountable reveal is an RLS policy, not a blur.** `private_after_kept` on `profile_private`
returns a row only when a `kept` invite exists between the reader and the owner. The app never
holds a contact handle it is not yet allowed to show; `getReveal` simply selects and gets nothing
back until both people have checked in.

**Auth.** Anonymous sign-in for the MVP: a real `auth.uid()` with zero friction, so RLS works from
the first screen. Linking a phone number later keeps the same user id.

## 6. Analytics and the trust engine (DuckDB)

`analytics/duckdb_pipeline.py` runs every few minutes (cron or a scheduled job), as the
`pinkilock_analytics` role:

1. `ATTACH` the Postgres database with DuckDB's `postgres` extension and copy `events`, `invites`
   and `profiles` into DuckDB in one read transaction.
2. Compute, entirely inside DuckDB:
   - **Trust Scores** per person from kept promises, early bails, late bails and no-shows, plus the
     median time someone takes to answer an ask.
   - **Pre-date conversion** per day: asks sent, first pinkies, locks, kept, flaked, declined,
     expired, ask-to-lock rate, lock-to-kept rate, median minutes to lock.
   - **Weekly retention** by signup cohort, from any activity in the log.
3. Write the three small result tables back in one Postgres transaction.

```
score   = round(100 * (kept + 4) / (kept + penalty + 4))
penalty = 1.0 * early bails + 1.25 * late bails (inside 2 hours of the start) + 1.5 * no-shows
```

The prior of 4 means a new person starts at 100 and one early bail costs 20 points, not everything.
Tiers shown on the badge: 90+ Promise Keeper, 75 to 89 Mostly solid, 55 to 74 Shaky, under 55 Flake
risk; fewer than 3 finished promises shows New here. The raw kept and flaked counts always sit
beside the number.

In live mode the badge shows `profile_cards.trust_score`, so a score changes when the worker next
runs, not the instant a promise resolves. In mock mode there is no worker: `src/domain/trust.ts`
applies the same formula with every flake weighted 1.

## 7. Repository layer: mock and live

`src/services/backend.ts` is the only thing screens and the store know. `src/services/index.ts`
returns the Supabase implementation when `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` are set, otherwise the mock.

The mock keeps a small database in AsyncStorage, answers with about 280 ms of latency, and plays
the other person: they answer an ask after 7 seconds, seal a lock after 2.4, check in after 1.8, and
one of them (Nikhil) always passes so the declined state can be seen. Pending reactions are stored
as due times, so a restart loses nothing.

## 8. Cross-platform notes

- **Safe areas**: every screen is a `Screen` (`src/components/ui/Screen.tsx`) that pads with
  `useSafeAreaInsets`, so notches, the Dynamic Island, the home indicator and Android gesture or
  3-button navigation are handled in one place. The tab bar and sheets add the bottom inset themselves.
- **System bars**: light status bar content; on Android the navigation bar is painted obsidian with
  light buttons (`expo-navigation-bar`), and the root background is set with `expo-system-ui` so
  there is no white flash behind the keyboard.
- **Edge-swipe zones**: the lock's touch area is inset 32 px from both screen edges and only
  claims horizontal drags, so Android's back gesture and the iOS back swipe keep working around
  it; the stack's own swipe-back is disabled on the lock and onboarding screens.
- **Shadows**: `src/theme/elevation.ts` returns iOS shadow props or Android `elevation` for the
  same level, including the pink glow.
- **Blur**: `expo-blur` on iOS; Android gets a dense scrim because its blur is costly and uneven.
  Locked content is not on the phone either way (section 5).
- **Haptics**: only impact and notification styles that exist on both platforms; no state is
  conveyed by a haptic alone.
- **Back**: Android hardware back works on every stack screen; the lock ignores it only during the
  one second of sealing.

## 9. Tests

- `npm run typecheck`: TypeScript strict over the app.
- `python tests/db/run.py`: starts a throwaway Postgres (pgserver), applies a small Supabase shim
  (roles, `auth.uid()`), runs `supabase/schema.sql`, walks three users through the state machine
  as the `authenticated` role (27 checks on RLS and the functions, including the reveal), runs the
  DuckDB pipeline against it and checks the scores and funnel it wrote back.

## 10. Not in the MVP, on purpose

Real photos and the video room itself, push notifications, phone-number auth, distance (live mode
shows area only), calendar export, and reporting and blocking. Reporting and blocking must ship
before real users do.
