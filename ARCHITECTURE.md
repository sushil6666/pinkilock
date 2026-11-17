# Pinkilock architecture

Pinkilock is a one-on-one pre-dating app. A match is not a chat thread: it is one specific,
time-bound micro-date that both people lock with a pinky promise. This file says how the system is
put together and why. The look and the gesture are specified in `DESIGN_SYSTEM.md`.

## 1. The parts

```
  Phone (Expo / React Native)            Supabase (PostgreSQL, OLTP)            Analytics worker (OLAP)
 +----------------------------+  rpc   +-------------------------------+ scan  +---------------------------+
 | screens -> store -> Backend| -----> | promise functions (definer)   | ----> | DuckDB + postgres scanner |
 |            ^               |        | invites, profiles, RLS        |       | trust, funnel, retention  |
 |            +--- Realtime --| <----- | events (append-only log)      | <---- | writes trust_scores back  |
 +----------------------------+        | pg_cron: sweep every minute   | write | (GitHub Actions, 5 min)   |
        mock backend when no keys      | notifications (outbox)        |       +---------------------------+
              ^                        +---------------+---------------+
              |                                        | pg_net
              +------ Expo push service <------ Edge Function `push`
```

| Layer | Choice | Why |
| --- | --- | --- |
| App | Expo SDK 52, React Native 0.76 (New Architecture), TypeScript strict, Expo Router 4 | One codebase for Android and iOS, runs in Expo Go today |
| Motion | Reanimated 3 + Gesture Handler 2 | The lock gesture runs on the UI thread at 60fps |
| Touch feedback | Expo Haptics behind `src/lib/haptics.ts` | One vocabulary on both platforms, silent on web |
| Client state | Zustand (`src/state/store.ts`) | Small, no providers, narrow re-renders |
| Live data (OLTP) | Supabase: Postgres, Auth, Realtime, Row-Level Security | Promises are small transactions that must be right |
| Analytics (OLAP) | DuckDB with its `postgres` extension, in a Python worker on a GitHub Actions schedule | Whole-log scans stay off the live database |
| Push | Outbox table + pg_net + a Supabase Edge Function + Expo push | A promise with a start time has to reach a locked phone; only the server may send |
| Delivery | Supabase CLI migrations, GitHub Actions, EAS Build | Nothing is set up by clicking in a dashboard |
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
  lib/                       haptics, useNow, useReveal, push (register this device, route taps)
supabase/
  config.toml                Local stack and function settings (Supabase CLI)
  migrations/                The schema, and the only source of it: tables, RLS, promise
                             functions, analytics role, the pg_cron schedule, push
  functions/push/            Edge Function: drains the notification outbox to Expo
analytics/duckdb_pipeline.py DuckDB worker: Trust Scores, conversion funnel, retention
scripts/                     push-config, analytics-role, supabase-db-url, make-icons
tests/db/                    Throwaway-Postgres checks: migrations, RLS, functions, push outbox, pipeline
tests/live/                  Two real users against a real Supabase: backend, push, and the screens
.github/workflows/           ci, supabase-deploy, live-test, analytics, eas-init, eas-build
assets/                      Placeholder icon, adaptive icon, splash and notification icon
app.json, app.config.js      App config; eas.json holds the three build profiles
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
subscription on `invites`, `trust_scores` and `profiles` (RLS filters the feed to rows I may read).
Every time the socket connects or reconnects, the backend re-reads the cards and my invites and
announces whatever changed, so nothing that happened while the phone was asleep or offline is
lost. In the mock it carries the simulated other person.

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
for what the UI offers) and the SQL functions in `supabase/migrations` (the authority in live mode).

Limits that keep intent high: 3 open asks at a time, one live invite per pair (a unique partial
index), a note of at most 80 characters, and no free-text chat anywhere before the micro-date.

## 5. Live database (Supabase / PostgreSQL)

Full DDL is `supabase/migrations`. Tables:

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
| `push_tokens` | One row per device: Expo push token, owner, platform | No client access. Written through `register_push_token` |
| `notifications` | The push outbox: recipient, invite, kind, title, body, delivery state | No client access. Written by a trigger and the sweep, read by the Edge Function |
| `analytics.metrics_daily`, `analytics.retention_weekly` | Worker output | Analytics role only |

**Writes go through functions, not tables.** `send_invite`, `offer_pinky`, `decline_invite`,
`check_in`, `bail` are `security definer` functions that check `auth.uid()`, lock the row, apply
one transition and append to `events`. `sweep_invites` is the clock (expire asks, turn missed
check-ins into flakes, announce that check-in opened); a migration schedules it every minute with
pg_cron. `log_event` lets the app record `app_open` and nothing else.

**Privileges are explicit.** Supabase grants every API role full rights on new tables in `public`
by default. The first migration takes all of that back and grants exactly what the app uses, so
RLS is the second lock rather than the only one. `anon` (signed out) can read and call nothing.

**The accountable reveal is an RLS policy, not a blur.** `private_after_kept` on `profile_private`
returns a row only when a `kept` invite exists between the reader and the owner. The app never
holds a contact handle it is not yet allowed to show; `getReveal` simply selects and gets nothing
back until both people have checked in.

**Auth.** Anonymous sign-in for the MVP: a real `auth.uid()` with zero friction, so RLS works from
the first screen. Linking a phone number later keeps the same user id.

## 6. Push notifications

A push is sent by the server and only by the server. The app has no code that can send one.

```
promise function / sweep -> invites row changes -> trigger invites_notify -> notifications (outbox)
     -> trigger -> pg_net POST -> Edge Function `push` -> Expo push API -> APNs / FCM -> phone
```

| Kind | When | Who is told |
| --- | --- | --- |
| `new_ask` | An ask is sent | The person asked |
| `pinky_out` | The receiver put their pinky out | The sender, who has to seal it |
| `locked` | The sender sealed it | The receiver |
| `checkin_open` | The sweep sees the window open (10 minutes before the start) | Whoever has not checked in |
| `bailed` | Someone bailed on a locked plan | The other person |
| `no_show` / `missed` | The window closed without both check-ins | The one who showed / the one who did not |

- **The outbox is written in the same transaction as the change**, so a notification exists
  exactly when the change committed. `unique (invite_id, recipient_id, kind)` means nothing is
  announced twice, however often the sweep runs.
- **What a notification says is decided in SQL**, from the invite the recipient is on, the other
  person's public name and the idea's title: all things RLS already lets them read. No statement
  on this path reads `profile_private`, and the push payload carries only `inviteId` and `kind`.
  The note and the place stay out as well.
- **Delivery.** A trigger on the outbox calls the Edge Function through pg_net; the sweep calls it
  again every minute while anything is unsent. The function claims rows with one atomic `update`
  (two overlapping runs cannot take the same row), posts to Expo in batches of 100, marks rows
  sent, deletes tokens Expo reports as `DeviceNotRegistered`, and leaves failures for the next
  sweep (5 attempts, then it gives up; rows older than an hour are not sent).
- **Who may call the function.** Only Postgres: it sends a shared secret that lives in Supabase
  Vault and as a function secret, regenerated by every deploy. The gateway's JWT check is off for
  this function because the caller is not a user.
- **The phone's part** is `src/lib/push.ts`: ask permission once there is a profile, get the Expo
  push token, hand it to `backend.registerPushToken`, and on a tap open the invite or the plan.
  While the app is in the foreground the system banner is suppressed, because the in-app banner
  (driven by Realtime) already says it.
- **Not built:** Expo push receipts are not polled, so a delivery that Expo accepts and APNs or
  FCM later rejects is not noticed until that device's next send.

## 7. Analytics and the trust engine (DuckDB)

`analytics/duckdb_pipeline.py` runs every 5 minutes in GitHub Actions
(`.github/workflows/analytics.yml`), as the `pinkilock_analytics` role. That role can read
`events`, `invites` and `profiles` and write `trust_scores` and `analytics.*`, and nothing else; a
database test pins that list. Its password is the workflow's only secret. A failed run opens an
issue labelled `analytics-worker` (and GitHub emails it); the next good run closes it. GitHub may
start scheduled runs late and pauses schedules in a repository with no activity for 60 days.
Each run:

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

## 8. Repository layer: mock and live

`src/services/backend.ts` is the only thing screens and the store know. `src/services/index.ts`
returns the Supabase implementation when `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` are set, otherwise the mock.

`supabaseBackend.ts` imports nothing from React Native: `index.ts` hands it AsyncStorage for the
session. That is what lets `tests/live` run the very same file from Node as two people.
Whatever one backend can do, the other can too: `registerPushToken` exists on both, and on the
mock it records the token and sends nothing, because its other person only moves while the app is
open and the in-app banner already covers that.

The mock keeps a small database in AsyncStorage, answers with about 280 ms of latency, and plays
the other person: they answer an ask after 7 seconds, seal a lock after 2.4, check in after 1.8, and
one of them (Nikhil) always passes so the declined state can be seen. Pending reactions are stored
as due times, so a restart loses nothing.

## 9. Cross-platform notes

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

## 10. Environments and delivery

| | Backend | How it gets there |
| --- | --- | --- |
| Local | `supabase start` (Docker), or the mock with no keys | `npm run db:start`, `.env` |
| Development build | Whatever the developer's `.env` says: the dev client loads JS from the laptop | `eas.json` profile `development` |
| Preview build | The Supabase project in `SUPABASE_PROJECT_REF` | profile `preview`, installable APK |
| Production build | The project in `PROD_SUPABASE_PROJECT_REF` | profile `production`; refuses to build until that is set |

- **Database and function**: `.github/workflows/supabase-deploy.yml` runs on a push to `main` that
  touches `supabase/`. It turns on anonymous sign-ins (the one Auth setting the app needs), runs
  `supabase db push`, deploys the `push` function, rotates the shared secret, sets the analytics
  role's password, and then runs the live two-user test against what it just deployed.
- **App**: `.github/workflows/eas-build.yml` copies the public Supabase URL and anon key for the
  chosen profile into the matching EAS environment and starts the build. Both values are public
  by design; the service role key is used by nothing in the app, the repo or these workflows (the
  Edge Function gets its own from the platform).
- **Secrets** live in GitHub Actions secrets, Supabase function secrets and Supabase Vault. None
  is in the repository. `.env`, `supabase/functions/.env` and `google-services.json` are ignored.

## 11. Tests

- `npm run typecheck`: TypeScript strict over the app.
- `python tests/db/run.py`: starts a throwaway Postgres (pgserver), applies a small Supabase shim
  (roles, their default privileges, `auth.uid()`, a pg_cron stand-in), runs every file in
  `supabase/migrations`, walks three users through the state machine as the `authenticated` role
  (RLS, the functions, the reveal, the cron schedule, the analytics role's rights), runs the DuckDB
  pipeline and checks what it wrote, then checks the push outbox: who is told what, that nothing
  private is in it, and that clients cannot touch it.
- `npm run test:live:local` (or `test:live` with a project's URL and anon key): two anonymous
  users drive `supabaseBackend.ts` through onboard, ask, lock, check-in, reveal, bail and expiry
  over GoTrue, PostgREST, RLS and Realtime. Expiry waits for the real pg_cron sweep.
- `npm run test:push:local`: the whole push chain on the local stack, with a stand-in for Expo.
- `npm run test:app:local`: the web build in two browser sessions, through the real screens.
- CI runs all of the above on every push. The live two-user test also runs against the real
  project after each deploy.

## 12. Not in the MVP, on purpose

Real photos and the video room itself, phone-number auth, distance (live mode shows area only),
calendar export, separate app ids per build profile, push receipts, and reporting and blocking.
Reporting and blocking must ship before real users do.

`ROADMAP.md` says which phase each of these lands in: reporting, blocking and phone sign-in in
Phase 3, photos and the video room in Phase 4.
