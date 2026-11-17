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
  profile/[id].tsx           Someone's profile, locked reveal, block or report
  report/[id].tsx            Report someone (always blocks too)
  account/sign-in.tsx        Add an email or a phone number (link), or sign back in with one
  account/blocked.tsx        People I blocked, with unblock
  invite/new.tsx             Vibe check composer (idea, time, place, one line in a chosen tone)
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
    Spark.tsx                What lines up between two cards (domain/spark.ts), public data only
  domain/                    Rules, no IO: types, invites (state machine), trust, time, ideas
                             (the catalogue, openers, dares, ask lines by tone, grouped profile tags), spark (what two
                             cards have in common),
                             safety (report reasons and limits), phone (E.164)
  services/
    backend.ts               The Backend interface (the repository layer)
    index.ts                 Picks mock or Supabase from the environment
    mock/                    seed.ts, mockBackend.ts (latency + a simulated other person)
    supabase/                supabaseBackend.ts (Auth, rpc, RLS reads, Realtime)
  state/store.ts             Zustand: cache of backend rows + actions
  lib/                       haptics, useNow, useReveal, push (register this device, route taps),
                             web (the few things only a browser needs)
supabase/
  config.toml                Local stack and function settings (Supabase CLI)
  migrations/                The schema, and the only source of it: tables, RLS, promise
                             functions, analytics role, the pg_cron schedule, push, blocks and
                             reports, data export and account deletion
  functions/push/            Edge Function: drains the notification outbox to Expo
analytics/duckdb_pipeline.py DuckDB worker: Trust Scores, conversion funnel, retention
scripts/                     push-config, analytics-role, supabase-db-url, make-icons
tests/db/                    Throwaway-Postgres checks: migrations, RLS, functions, push outbox, pipeline,
                             blocking, reporting, export, deletion
tests/live/                  Real users against a real Supabase: backend, safety and accounts, push, the screens
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

  any of sent, half_locked, locked --- a block, or an account deletion ---> ended
```

- **sent**: a vibe check is an ask, nothing is promised yet. It expires 24 hours after sending or
  at the start time, whichever is first.
- **half_locked**: one person has done the gesture (`first_pinky_by`). The receiver goes first.
- **locked**: the sender sealed it. Both have performed the gesture; the Anti-Ghosting Promise
  applies and the countdown starts. This is one `update` in Postgres, pushed to both phones by Realtime.
- **kept**: both checked in inside the window (10 minutes before the start to 30 minutes after).
  Checking in takes the other person's 4-digit code (`my_checkin_code`, `check_in(invite, code)`):
  shown across the table or read out on the call, so only two people who are together can do it.
  Five wrong codes wait five minutes; codes are deleted when the plan stops being locked.
- **flaked**: someone bailed after locking, or did not check in. Only that person's record moves.
- **ended**: one of the two blocked the other, or deleted their account, while it was live. It is
  nobody's flake: no bail, no-show or decline is logged, and no one's score moves. Nothing is
  pushed about it.

The rules exist twice, on purpose, and must match: `src/domain/invites.ts` (used by the mock and
for what the UI offers) and the SQL functions in `supabase/migrations` (the authority in live mode).

Limits that keep intent high: 3 open asks at a time, one live invite per pair (a unique partial
index), a note of at most 80 characters, and no free-text chat anywhere before the micro-date.

## 5. Live database (Supabase / PostgreSQL)

Full DDL is `supabase/migrations`. Tables:

| Table | What it holds | Who can touch it |
| --- | --- | --- |
| `profiles` | The public card: name, age (18+ check), area, tagline, vibes, `idea_ids` | Read: me, and people I share an invite with (any status, never across a block); everyone else only through `discover()`. **No direct writes**: only through `save_profile` |
| `profile_private` | Contact handle and extra photos | Read: you, and anyone with a `kept` invite with you. **No direct writes**: the contact through `save_profile`, photos by the server only |
| `ideas` | The micro-date catalogue | Read only |
| `vibes` | The profile tag catalogue (the same list as `VIBE_GROUPS` in `src/domain/ideas.ts`) | Read only |
| `ask_lines` | The lines an ask can carry (the same list as `ASK_LINES` in `src/domain/ideas.ts`) | Read only |
| `venues` | Suggested public places to meet (the same list as `VENUES` in `src/domain/venues.ts`); a venue is switched off, never deleted | Read only |
| `invites` | The whole product: who, what, when, status, `first_pinky_by`, `check_ins`, `flaked_by` | Read: the two people on it. **No direct writes at all** |
| `passes` | People I passed on in Discover | Only me |
| `events` | Append-only behaviour log. Rows are never deleted; a deleted account's rows lose their actor | No client access. Written by the functions, read by analytics |
| `trust_scores` | One row per person, written by the DuckDB worker | Read: any signed-in user |
| `profile_cards` (view) | `profiles` joined to `trust_scores` | What the app selects for a card |
| `push_tokens` | One row per device: Expo push token, owner, platform | No client access. Written through `register_push_token` |
| `notifications` | The push outbox: recipient, invite, kind, title, body, delivery state | No client access. Written by a trigger and the sweep, read by the Edge Function |
| `blocks` | Who blocked whom | No client access, not even the service role. Written by `block_user`, `report_user`, `unblock_user`; my own list through `my_blocks()` |
| `reports` | Reporter, reported person, reason, detail, the shared invite, review fields | No client access, not even the service role. Written only by `report_user`; read by a moderator with the database role |
| `client_errors` | Errors phones showed: code, trace id, screen, build. No content. Kept 30 days | No client access, not even the service role. Written by `log_client_error`; read by an operator with the database role |
| `analytics.metrics_daily`, `analytics.retention_weekly` | Worker output | Analytics role only |

**Writes go through functions, not tables.** `send_invite`, `offer_pinky`, `decline_invite`,
`check_in`, `bail` are `security definer` functions that check `auth.uid()`, lock the row, apply
one transition and append to `events`. `sweep_invites` is the clock (expire asks, turn missed
check-ins into flakes, announce that check-in opened); a migration schedules it every minute with
pg_cron. `log_event` lets the app record `app_open` and nothing else.

**What a profile and an ask may contain is decided on the server.** `save_profile` is the only
way to write a profile: a name is one word of letters (2 to 16); tags come from `vibes` (three at
most) and ideas from `ideas` (three to six); area, pronouns and the one line have length limits;
portrait colours, photo count, city and join date are the server's. `private.looks_like_contact`
refuses a handle, a link, a phone number, an app name or "add me" in the line, the area, the
pronouns, and in an ask's note and place. `src/domain/profile.ts` has the same rules and codes for
the app and the mock, and one table of lines is run through both copies. The check stops the plain
cases only: a made-up code still gets through until lines are reviewed before anyone sees them
(`docs/build-plan.md`, WP1).

**Lines are picked or reviewed.** An ask's line must be one of `ask_lines` (the app's ready-made
lines) or none. The one free text, the profile line, can change once a week (the name once a
month), and with review on it waits in `private.line_reviews` while the card keeps the last
approved line: `review-line` (an Edge Function asking Claude, woken every minute by pg_cron like
push) approves, rejects or holds it for a person. Reports can name `shared_contact`; moderators
act through `private.moderate` (`scripts/moderate.sh`), and two strikes suspend an account.

**Discover is a function, not a table read.** `profiles` and `trust_scores` return only my own row
and people I share an invite with (`private.shares_invite`). Everyone else comes from
`discover(limit)`: at most 20 a call, same city, not passed, blocked or live with me, linked while
the gate is on, in an order that is fixed for the day and different for every person. An account
reaches at most 200 different people a day (`private.discover_seen`). New people are therefore
fetched, not pushed: the app asks again when Discover opens, every minute while it is open, and
when fewer than three cards are left (`backend.moreProfiles`).

**Trust Scores resist farming.** The worker counts promises kept with the same person once per
30-day period, and, while the link gate is on, none with an account that has no email or phone
(`analytics.accounts`, `analytics.settings`).

**Limits and the link gate.** `send_invite` refuses an 11th ask in a day and a second ask to
someone within 7 days of them passing; a trigger on `passes` counts passes (200 a day) in
`private.actions`, a short-lived log that also counts profile saves (20 a day). `private.config`
holds switches the server reads; `require_linked` makes asks and pinkies need a linked email or
phone (`private.is_linked` reads `auth.users.is_anonymous`). It is off until sign-in codes can be
sent; the deploy workflow decides.

**A place can be picked instead of typed.** `send_invite` takes an optional venue id. With one,
the server writes `place` from the catalogue (`name, area`) and ignores whatever the app sent as
the typed place, records `venue_id` on the invite and the venue in the event log, and refuses a
venue that does not exist, is switched off, or is on a video or game plan. Without one, the typed
place still works and still goes through the contact check. The app offers venues nearest first:
the other person's area, then mine, then the rest of the city (`venuesFor`).

**Privileges are explicit.** Supabase grants every API role full rights on new tables in `public`
by default. The first migration takes all of that back and grants exactly what the app uses, so
RLS is the second lock rather than the only one. `anon` (signed out) can read and call nothing.

**The accountable reveal is an RLS policy, not a blur.** `private_after_kept` on `profile_private`
returns a row only when a `kept` invite exists between the reader and the owner. The app never
holds a contact handle it is not yet allowed to show; `getReveal` simply selects and gets nothing
back until both people have checked in.

**Blocking is RLS too.** `private.blocked_pair(a, b)` is true when either person blocked the
other. It is a `security definer` function in the `private` schema, which the API does not expose,
so nobody can ask it about a pair they are not in. The policies on `profiles`, `trust_scores`,
`invites` and `profile_private` all add it: a blocked pair vanish from each other's Discover, lose
every invite between them (finished ones too) and the reveal. `block_user` also ends every live
invite between them as `ended` and drops anything still unsent about it from the push outbox;
`send_invite` refuses across a block with a message that does not say who blocked whom. The
blocked person is never told. Their phone notices the next time it re-reads (any reconnect, or a
failed action on a vanished invite), when the store drops whatever RLS no longer returns.
Unblocking (only the blocker can) brings the cards and the old invites back; ended stays ended.

**Reports.** `report_user(person, reason, detail, invite)` checks the reason (fake, harassment,
inappropriate, underage, unsafe, other), caps the detail at 500 characters and a person at 10
reports a day, attaches the invite only if the two of them share it, and always blocks as well.
The rules are mirrored in `src/domain/safety.ts`. There is no moderation tool yet: reports are read
in the SQL editor (`select * from reports where reviewed_at is null`).

**Export and deletion.** `export_my_data()` returns one JSON document: account (id, phone),
profile, contact, trust score, my invites (the other person by id only), passes, blocks, reports
I made, devices, notifications sent to me, and my events. Reports about me are not in it, nor
anyone else's contact. `delete_my_account()` ends my live invites, removes my id from every events
row (and clears what the phone sent with `app_open`), then deletes the auth user; everything that
references the profile cascades, and reports keep their row with my id set to null. The other
person's record does not change, because Trust Scores count kept promises from the events log
(section 7). `tests/db/account.sql` scans every uuid column afterwards for the deleted id.

**Auth.** Sign-in starts anonymous: a real `auth.uid()` with zero friction, so RLS works from the
first screen. Adding an email or a phone number (Me, Account) calls `updateUser({ email })` or
`updateUser({ phone })` and then `verifyOtp` with type `email_change` or `phone_change`, which
turns the same user into an email or phone user: the id, and so every row, stays. On a new phone,
"I already have an account" signs in with either (`signInWithOtp` with `shouldCreateUser: false`,
so no account is ever made that way). Signing out is offered only once one of them is linked,
since an anonymous account could not be got back. Email is offered first because it is free to
send: the deploy workflow points Auth at our own SMTP sender and installs the code-only templates
in `supabase/templates` once the `SMTP_*` settings exist, and switches email off until then
(Supabase's own mailer only reaches the project's team). The SMS provider is Twilio Verify,
switched on once its three secrets exist. The app reads `/auth/v1/settings` and says which of the
two is not on yet. Locally, `supabase/config.toml` turns both on: email goes to Mailpit, and phone
uses test numbers that send no SMS.

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

`analytics/duckdb_pipeline.py` runs every 6 hours in GitHub Actions
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
     median time someone takes to answer an ask. All four come from the events log (each person's
     own `kept`, `bailed` and `no_show` rows), so another person deleting their account does not
     change your record. An `ended` invite counts for no one.
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

`src/services/backend.ts` is the only thing screens and the store know. Besides the promise
methods it has `block`, `unblock`, `blockedPeople`, `report`, `exportMyData`, `deleteAccount`,
`account`, `sendCode`, `verifyCode` (by email or phone) and `signOut`. `Changes.removed` names people and
invites the backend can no longer see, and the store drops them; the live backend works that out
on every re-read and from Realtime deletes, and is never told why. `src/services/index.ts`
returns the Supabase implementation when `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_ANON_KEY` are set, otherwise the mock.

`supabaseBackend.ts` imports nothing from React Native: `index.ts` hands it AsyncStorage for the
session. That is what lets `tests/live` run the very same file from Node as two people.
Whatever one backend can do, the other can too: `registerPushToken` exists on both, and on the
mock it records the token and sends nothing, because its other person only moves while the app is
open and the in-app banner already covers that.

The mock mirrors the safety rules: it hides people I blocked and every invite with them, ends live
ones with `endForBlock`, keeps reports where nothing can read them back, accepts `123456` as every
phone code (the screen says so), and on sign-out parks the account under its number until someone
signs back in with it.

The mock keeps a small database in AsyncStorage, answers with about 280 ms of latency, and plays
the other person: they answer an ask after 7 seconds, seal a lock after 2.4, check in after 1.8, and
one of them (Nikhil) always passes so the declined state can be seen. Pending reactions are stored
as due times, so a restart loses nothing.

### Errors and tracing

Every error has a code, and every action a trace id, so that what a person saw can be tied to
what the server did (`OPERATIONS.md`, "Trace a bug").

- **Codes.** `src/domain/errors.ts` is the catalogue: `PL` for a refusal by a database function
  (each `raise` in the migrations carries the same code as its SQLSTATE), `PA` for sign-in, `PC`
  for the app itself. The live backend maps on the code, never on message text; the mock and the
  shared rules in `src/domain/invites.ts` throw the same codes. A server error that is not one of
  ours is shown as `PC002` and its text is dropped, because it can quote row values.
- **Trace ids.** The live backend sends a fresh 8-character id as `x-trace-id` with each call to
  a database function. Triggers copy it onto every `events` row and every `notifications` row the
  call causes, and the push function logs it. The header is accepted only in that exact shape.
- **On screen.** `ErrorText` shows the words and, under them, `CODE · TRACE`. `src/lib/report.ts`
  is the one place a shown error goes: it is remembered for diagnostics and sent to
  `client_errors` as code, trace, route pattern and build, never the words.
- **Nothing is swallowed.** A failure that is safe to carry on from goes to `quiet(where)` in
  `src/lib/log.ts`; a unit test fails on any empty catch. The logger keeps the last 100 lines in
  memory and drops any field that is not a number, a boolean or an id-shaped string.
- **Crashes.** `ErrorBoundary` in `app/_layout.tsx` replaces a white screen with the reference
  and "Try again", and reports itself as `PC009`.
- **Builds.** `src/lib/build.ts`: version, git commit (stamped by the EAS build workflow) and
  update id, shown at the bottom of Me and sent with every report.

### On the phone

The session is stored encrypted: a fresh key per item in the keystore (`expo-secure-store`), the
item AES-encrypted in AsyncStorage (`src/lib/sessionCrypto.ts`); in a browser it stays in the
page's storage. Screenshots and recording are blocked while a revealed contact is on screen.
Production builds refuse to run on the mock, and route ids are checked before they are written into
a query filter. None of this is a defence on its own: every rule that matters is on the server.

## 9. Cross-platform notes

- **Safe areas**: every screen is a `Screen` (`src/components/ui/Screen.tsx`) that pads with
  `useSafeAreaInsets`, so notches, the Dynamic Island, the home indicator and Android gesture or
  3-button navigation are handled in one place. The tab bar and sheets add the bottom inset themselves.
- **System bars**: light status bar content; on Android the navigation bar is painted royal blue with
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
- **Wide screens**: nothing is drawn wider than `columnMax` (480, `src/theme/tokens.ts`). `Screen`
  centres its header, content and footer in that column and draws a hairline down each side; the
  tab bar, sheets and the notice banner use `column` from `Screen.tsx`. A phone is narrower than
  the column, so nothing changes there. No screen sets its own width. The one exception is the
  first screen (`src/components/Welcome.tsx`), which in a window 960 or wider asks `Screen` for
  `wide` and is drawn in two columns up to `wideMax` (1080).
  `public/index.html` is the page the web build loads into: it paints `bg` before the app has
  loaded, and `app.json` (`web.themeColor`) gives the browser bar the same blue. Those two files
  are the only places a colour is written outside `src/theme/tokens.ts`, because neither can
  import it.
- **Browser**: the web build (`npx expo export -p web`) is the same screens. Anything a browser
  needs differently lives in `src/lib/web.ts` or in the shared component, never in a copied
  screen. So far: a hold that completes under a finger eats the click the browser makes when the
  finger lifts (it would otherwise tap whatever the new screen put there); a hold button commits
  at once for a screen reader's click, as the `activate` action does on a phone, and needs the
  full hold from a mouse, a finger or a held Space or Enter; the lock stage measures its own
  width, clips its drawing and takes the arrow keys. Haptics and push do nothing in a browser,
  and Me says so for push.
- **Clay loops**: `assets/loops/*.gif` are drawn by `scripts/make-loops.mjs`, which renders the
  scenes in `scripts/loops/scene.js` with three.js in Chromium and encodes them with ffmpeg. three.js
  is a dev dependency only: nothing 3D runs in the app, which shows plain GIFs through
  `src/components/Loop.tsx` (a still PNG with reduced motion). Android shows animated GIFs because
  the Expo template turns that on.
- **Screen readers in a browser**: the web renderer drops `accessibilityState`, so a control that
  can be on or off also spreads `aria({ pressed | selected | checked })` from `src/lib/web.ts`
  (chips and tags, tabs, the report reasons). The `display` type style is each screen's headline
  and is announced as a heading on a phone and is an `h1` in a browser; `Screen` is the `main`
  landmark. One rule in `src/lib/web.ts` gives whatever the keyboard lands on the same sky-blue
  focus ring, so a new control needs nothing. Reduced motion needs no code outside the lock and
  the hold button: Reanimated skips entering animations and springs when the system asks.
- **Web addresses**: `src/lib/routes.ts` names every route once: its page title (`Plans · Pinkilock`;
  a title never carries a person's name or an id, because titles end up in history and in shared
  tabs) and whether it needs a profile. The root layout sets the title when the route changes and
  sends a visitor with no profile who opens a personal screen directly to `/`, which leads to
  onboarding; it covers the screen with `bg` until that has happened. This is a courtesy, not a
  lock: what one person may see is still decided by RLS. An address that matches nothing shows
  `app/+not-found.tsx`. `tests/unit/routes.test.ts` fails when a route file is added without an
  entry. The build is one page (`web.output: single`), so the host must answer every path with
  `index.html`. `public/manifest.json`, the home-screen icons and `public/share.png` are drawn by
  `scripts/make-icons.mjs`; the manifest is a third place the blue is written by hand.

## 10. Environments and delivery

| | Backend | How it gets there |
| --- | --- | --- |
| Local | `supabase start` (Docker), or the mock with no keys | `npm run db:start`, `.env` |
| Development build | Whatever the developer's `.env` says: the dev client loads JS from the laptop | `eas.json` profile `development` |
| Preview build | The Supabase project in `SUPABASE_PROJECT_REF` | profile `preview`, installable APK |
| Production build | The project in `PROD_SUPABASE_PROJECT_REF` | profile `production`; refuses to build until that is set, or if it is the preview project |

- **Database and function**: `.github/workflows/supabase-deploy.yml` has two targets. `preview`
  (`SUPABASE_PROJECT_REF`) deploys on every push to `main` that touches `supabase/`, and by hand.
  `production` (`PROD_SUPABASE_PROJECT_REF`) deploys only by hand, in the `production` GitHub
  environment (where required reviewers can be added), and is refused until its ref and database
  password exist; its values never fall back to preview ones. Each run turns on anonymous sign-ins,
  runs `supabase db push`, deploys the `push` function, rotates the shared secret, sets the
  analytics role's password, turns on email sign-in if an SMTP sender is set (and off if not) and
  Twilio Verify phone sign-in if its secrets exist, and, for
  preview only, runs the live tests against what it just deployed. The live tests are not run on
  production, where their test people would show up in real Discover.
- **Analytics**: the worker runs once per project that has a ref and a pooler host, every 6
  hours; a project that is not set up is skipped.
- **App**: `.github/workflows/eas-build.yml` copies the public Supabase URL and anon key for the
  chosen profile into the matching EAS environment and starts the build. Both values are public
  by design; the service role key is used by nothing in the app, the repo or these workflows (the
  Edge Function gets its own from the platform).
- **Secrets** live in GitHub Actions secrets, Supabase function secrets and Supabase Vault. None
  is in the repository. `.env`, `supabase/functions/.env` and `google-services.json` are ignored.

## 11. Tests

- `npm run typecheck`: TypeScript strict over the app.
- `npm run test:unit`: the error catalogue matches the SQL in both directions, the logger keeps no
  content, the on-screen reference round-trips, and no catch in `src` or `app` is empty.
- `python tests/db/run.py`: starts a throwaway Postgres (pgserver), applies a small Supabase shim
  (roles, their default privileges, `auth.uid()`, a pg_cron stand-in), runs every file in
  `supabase/migrations`, walks three users through the state machine as the `authenticated` role
  (RLS, the functions, the reveal, the cron schedule, the analytics role's rights), runs the DuckDB
  pipeline and checks what it wrote, then checks the push outbox: who is told what, that nothing
  private is in it, and that clients cannot touch it.
  Last, the attacker suite (`attacker.sql`): one signed-in person with a modified app tries the
  tables and functions directly. It pins exactly which tables and functions the API roles hold,
  and marks each known gap from `docs/build-plan.md` as a `gap` line until it is closed.
  Then `tracing.sql`: every function raises with a code, a trace header lands on the event and
  the push row, a malformed one is ignored, and the phone error log cannot be read or flooded.
- `npm run test:live:local` (or `test:live` with a project's URL and anon key): two anonymous
  users drive `supabaseBackend.ts` through onboard, ask, lock, check-in, reveal, bail and expiry
  over GoTrue, PostgREST, RLS and Realtime. Expiry waits for the real pg_cron sweep. Then three
  more go through Phase 3 (`safety.test.ts`): a block (the blocked person's fresh boot and a raw
  client both find no card, no shared invite and no reveal), a report (unreadable, blocks), export,
  phone link and sign-in on a new phone (same id and history; local stack only, where the test
  numbers send no SMS), and account deletion.
  Then `attacker.test.ts`: the same hostile client over the network (the anon key alone, direct
  table writes, server-only functions, the schemas the API serves, the push function).
- `npm run test:push:local`: the whole push chain on the local stack, with a stand-in for Expo.
- `npm run test:app:local`: the web build in two browser sessions, through the real screens,
  ending with a block from the profile screen, a data download and an account deletion from Me.
  It runs twice, one person in a phone-sized window and the other in a desktop-sized one, then
  swapped, and fails if any screen it passes through scrolls sideways.
- CI runs all of the above on every pull request and every push to `main`. The live two-user test also runs against the real
  project after each deploy.

## 12. Not in the MVP, on purpose

Real photos and the video room itself, distance (live mode shows area only), calendar export,
separate app ids per build profile, push receipts, a moderation tool for reports, and telling the
blocked person's phone at once (it finds out on its next re-read).

`ROADMAP.md` says which phase each of these lands in: photos and the video room in Phase 4.
