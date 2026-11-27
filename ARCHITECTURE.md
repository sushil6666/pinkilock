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
| App | Expo SDK 58, React Native 0.88 (New Architecture), React 19, TypeScript 6 strict, Expo Router 58 | One codebase for Android and iOS, runs in Expo Go today |
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
  i18n/                      Every word on screen: en.ts (the English, and the shape other languages
                             follow), t() with plurals, dates, times, numbers and distance by locale,
                             and two pseudo-languages for tests
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
subscription on `invites`, `duos`, `trust_scores` and `feed_nudges` (RLS filters the feed to rows I
may read). The feed carries inserts and updates only: RLS cannot check a row that is gone, so a
delete would reach every listener (G24, D093). When something of mine is deleted (a duo left, a plan
whose other person deleted their account), a trigger touches my own `feed_nudges` row and the phone
re-reads.
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

**Doubles** (`from_friend`, `to_friend`, `pinkies`; docs/build-plan.md F3): two duos on one plan.
The three others put a pinky out in any order (`half_locked` from the first) and the asker seals it
last (`locked`); any one of the four passing declines it for all. Check-in takes the code of anyone
on the other side. All four in is `kept` at once; when the window closes, at least one from each
side in is `kept`, with a `no_show` event for each person missing, and otherwise `flaked`. Scores
come from each person's own events, so a flake is never on a friend who showed.

The rules exist twice, on purpose, and must match: `src/domain/invites.ts` (used by the mock and
for what the UI offers) and the SQL functions in `supabase/migrations` (the authority in live mode).

Limits that keep intent high: 3 open asks at a time, one live invite per pair (a unique partial
index), a note of at most 80 characters, and no free-text chat anywhere before the micro-date.

## 5. Live database (Supabase / PostgreSQL)

Full DDL is `supabase/migrations`. Tables:

| Table | What it holds | Who can touch it |
| --- | --- | --- |
| `profiles` | The public card: name, age (18+ check), area, tagline, vibes, `idea_ids` | Read: me, and people I share an invite with (any status, never across a block); everyone else only through `discover()`. **No direct writes**: only through `save_profile` |
| `profile_private` | Contact handle | Read: you, and anyone with a `kept` invite with you (`private.revealed_to`). **No direct writes**: the contact through `save_profile` |
| `photos` | Up to three photos behind the lock, and the face on the card (`kind`: `locked` or `face`): path in Storage, `pending` / `approved` / `held`, size | Read: your own; someone else's only when approved, and then a locked one where `private.revealed_to` allows and a face where `private.face_visible` does. **No client writes**: added by the `photo` Edge Function (`add_photo`, service role), removed with `remove_photo`, decided by a moderator |
| `photo_trash` | Paths of photo files whose row is gone | No client access. Filled by a trigger, emptied by the push function through the Storage API |
| Storage bucket `photos` | The photo files, JPEG with no metadata, 2 MB at most | Private. A file is readable (as a ten-minute signed link) only where its `photos` row is; no client can write |
| `ideas` | The micro-date catalogue | Read only |
| `vibes` | The profile tag catalogue (the same list as `VIBE_GROUPS` in `src/domain/ideas.ts`) | Read only |
| `ask_lines` | The lines an ask can carry (the same list as `ASK_LINES` in `src/domain/ideas.ts`) | Read only |
| `venues` | Suggested public places to meet (the same list as `VENUES` in `src/domain/venues.ts`); a venue is switched off, never deleted | Read only |
| `invites` | The whole product: who, what, when, status, `first_pinky_by`, `check_ins`, `flaked_by` | Read: the two people on it. **No direct writes at all** |
| `passes` | People I passed on in Discover; written only through `pass_profile` and `restore_passes` | Only me (read) |
| `events` | Append-only behaviour log. Rows are never deleted; a deleted account's rows lose their actor | No client access. Written by the functions, read by analytics |
| `trust_scores` | One row per person, written by the DuckDB worker | Read: any signed-in user |
| `profile_cards` (view) | `profiles` joined to `trust_scores` | What the app selects for a card |
| `push_tokens` | One row per device: Expo push token, owner, platform | No client access. Written through `register_push_token` |
| `notifications` | The push outbox: recipient, invite, kind, title, body, delivery state | No client access. Written by a trigger and the sweep, read by the Edge Function |
| `blocks` | Who blocked whom | No client access, not even the service role. Written by `block_user`, `report_user`, `unblock_user`; my own list through `my_blocks()` |
| `reports` | Reporter, reported person, reason, detail, the shared invite, review fields | No client access, not even the service role. Written only by `report_user`; read by a moderator with the database role |
| `client_errors` | Errors phones showed: code, trace id, screen, build. No content. Kept 30 days | No client access, not even the service role. Written by `log_client_error`; read by an operator with the database role |
| `date_ratings` | After a kept promise: worth it, again, felt unsafe. Never shown to the other person | No client access. Written by `rate_date`; read by the analytics role |
| `analytics.metrics_daily`, `analytics.retention_weekly`, `analytics.satisfaction_daily` | Worker output | Analytics role only |

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

**Where, and with what consent.** `countries` and `cities` are an allow-list (India open, with 91 cities: the eight metros and every tier-2 city, D083, D092);
a profile's city must be open, and a move to another city needs an area in the new city and comes at most once in 7 days (PL105; `profiles.city_changed_at`, server-only). Discover is per city, so it follows a move; so do the places offered in an ask. A first profile needs the request's country (`cf-ipcountry`, when
present; the live test passes with a one-run token, D063) to be open and four consents at the current `legal_version`: 18+, terms, privacy, and the
separate consent to use dating preferences. `privacy_requests` holds questions and appeals
(`file_privacy_request`); `my_moderation` shows a person what was done to their account and why;
`private.retention` clears and deletes on a schedule. `docs/data-map.md` lists what is held where.

**After a kept promise.** Each person answers once, privately: worth showing up, see them again,
felt unsafe (`rate_date`; `date_ratings` is readable by no client role). `date_feedback` says only
whether I answered and whether both of us want round two. The worker writes the 28-day share of
"worth it" to `analytics.satisfaction_daily`, with no rate under 50 answers. Cards carry the median
answer time for a "usually answers in" line. Clients read only the card's columns of `profiles`;
moderation columns stay server-side.

**The area, pronouns and contact kind are picked too** (migration `20261118000003_picked_fields.sql`).
The area comes from the city's list (`areas`, PL095) and pronouns from `pronoun_options` (PL096); a
value saved before the lists existed stays valid until it changes. Onboarding asks for the city
(an open one), and the server works out the country from it. Contact kinds are a catalogue by region
(`contact_kinds`): a kind with no countries works everywhere, the others only where people use them.
Phone sign-in takes the picked country's dialling code instead of assuming India.

**Distance on a card** (D089) comes from the same centres: `areaKm` in `src/domain/nearby.ts` gives
the straight line between my area and theirs, in whole kilometres (at least 1), and nothing for
another city, the same area, or an area of someone's own that has no centre. It uses only the two
areas both cards already show, so it says nothing new about where anyone is; the mock and the live
app use the same helper (`cardKm`).

**Where I am, from the phone** (D087, migration `20261118000013_areas_by_location.sql`). Each city's
list holds its common neighbourhoods (about 1,330 areas). "Use my location" (`src/lib/location.ts`,
`expo-location`, once, balanced accuracy) reads the position on the device and `src/domain/nearby.ts`
picks the nearest open city (an area within 25 km) and its nearest areas from approximate centres in
`src/domain/areaCentres.ts`, which exist only in the app. The coordinates never leave the phone: not
to the server, the logs or the store; only the city and area picked are saved. A denial, no location
or a place outside every open city falls back to the lists, with a retry. By hand, the eight metros are
one tap; the other cities are found by a search (name, an old name such as Bangalore, the state,
or one of the city's areas, which then comes with it) or by picking the state, then the city
(`src/domain/citySearch.ts`, D092). A city's state is app-side only. Typing finds loose
spellings and "Did you mean" names (`matchAreas`, `closeAreas`). An area off the list is allowed
when it reads as a place (`customAreaOk` and `private.custom_area_ok`: 3 to 30 characters, a letter
first, letters, digits and `.'-`, up to 4 words and 3 digits, nothing like a contact; PL106).
`save_profile` counts each one by city and name only in `private.area_requests` (no person, no
client access), so popular names can join the list in a later migration. A move cannot keep the
old city's area (PL095).

**Handles are checked, can be flagged, and can be proved** (D077, D078). `save_profile` stores a
handle only through `private.normalize_contact` (each app's own format; `src/domain/profile.ts` is
the app's copy, `HANDLE_CASES` the shared test table). After a kept plan, `report_bad_contact`
lets someone the handle was revealed to flag it within a week, once per plan, into
`contact_reports` (no client reads it). A verified handle cannot be flagged, and a flag waits 7
days: `private.settle_contact_reports` (hourly) clears it if the owner verified or changed the
handle, ignores it if the flagger flags more than half of their dates, and otherwise writes a
`bad_contact` event that the trust pipeline counts like an early bail (D079); `my_contact_flags` tells the owner how many, never who. A proof is a code from
`start_contact_check` sent from that account to Pinkilock on WhatsApp or Instagram: Meta calls the
`contact-verify` Edge Function (signature checked), which asks `confirm_contact_code` (service role
only) to set `profile_private.contact_verified_at`. A new handle clears it.

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
reaches at most 200 different people a day (`private.discover_seen`); a card whose account is
deleted while the page is being served is skipped, not an error (D097). New people are therefore
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
returns a row only when a `kept` invite exists between the reader and the owner (the rule is
`private.revealed_to(owner, reader)`, shared with photos). The app never
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
I made, devices, notifications sent to me, my events, my couples (D120), and Self love (moods, notes, the pause and
the reset), Spicy mode (my usernames, boundaries, yeses and unlocks), and the wallet (balances, ledger, orders,
stakes and treats), my Spicy call times (and, from format 12, my time on each voice call and whom I shared usernames with), and Talk mode (my settings, AI chat minutes and flags but
never the words, calls, referrals, and as a listener my application and payouts; format 11). Reports about me are not in it, nor
anyone else's contact. `delete_my_account()` ends my live invites, removes my id from every events
row (and clears what the phone sent with `app_open`), then deletes the auth user; everything that
references the profile cascades, and reports keep their row with my id set to null. The other
person's record does not change, because Trust Scores count kept promises from the events log
(section 7). `tests/db/account.sql` scans every uuid column afterwards for the deleted id.

**Auth.** Sign-in starts anonymous: a real `auth.uid()` with zero friction, so RLS works from the
first screen. Adding an email or a phone number (Me, Account) calls `updateUser({ email })` or
`updateUser({ phone })` and then `verifyOtp` with type `email_change` or `phone_change`, which
turns the same user into an email or phone user: the id, and so every row, stays. On a new phone,
"I already have an account" signs in with either, and no account is ever made that way.

Both kinds of code go through the `auth-code` Edge Function (D091, gap G22), never straight to
Auth, so the app never says who has an account. `public.auth_code_check` (service role only)
decides whether to send: to an account's own address when signing in, to a free one (or my own)
when adding it. The function answers `{ sent: true }` either way, sends in the background so the
time taken is the same, and the screen says "If ... is on a Pinkilock account, a code is on its
way". A code that was never sent fails like a mistyped one (PA006). Requests count by a hash of
the address and by the caller (one a minute and three a quarter-hour per address, ten an hour per
caller; PL112). Auth itself, called directly, would still tell, so production adds Auth's captcha
(Cloudflare Turnstile) once the owner's keys exist: `src/lib/captcha.ts` asks for a token before an
anonymous sign-in and before a code, `<CaptchaHost />` at the root shows the check (a script in a
browser, a WebView on a phone), and the function checks the token itself before anything else. Signing out is offered only once one of them is linked,
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
- **Receipts.** Expo's first answer only says it accepted a push. The function keeps each ticket
  (`push_tickets`) and, from 15 minutes on, asks Expo for its receipt: a device that turned out
  to be gone loses its token, any other failure is written on the notification
  (`receipt_error`), and answered tickets are dropped (unanswered ones after a day, as Expo keeps
  receipts that long). A cron job wakes the function every 15 minutes while any are due, so a
  quiet hour does not let them lapse; a receipts failure never stops sending.
- **Photo files to delete.** The same run deletes the files listed in `photo_trash` (removed
  photos, deleted accounts) through the Storage API, which is the only way Storage deletes a file;
  a job wakes it every five minutes while any are listed (D088).

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
on every re-read (a nudge on `feed_nudges` asks for one), and is never told why. `src/services/index.ts`
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
- **Trace ids.** The live backend sends an 8-character id as `x-trace-id` with each call to a
  database function. One tap calls one Backend method, and every call inside it shares one id
  (`src/services/traceScope.ts`), so a lock that writes and then re-reads leaves one trail. Triggers copy it onto every `events` row and every `notifications` row the
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

### When I am free

`profiles.free_windows` (set with `save_availability`, shown on the card) holds broad windows such as
weekday evenings. Asks can still pick any time; the composer marks the times inside the other
person's windows (`src/domain/freeWindows.ts`, in the phone's time zone).

### Self love and Bounce back

A private page reached from Me (D101). `private.self_moods` (one mood a day), `private.self_notes`
(gratitude, journal and boundary notes, 300 characters, three gratitude notes a day, 200 in all)
and `private.self_love` (the Discover pause and the 3-day reset) are readable by no client role and
not by the analytics worker. The app uses only `my_self_love`, `save_mood`, `add_self_note`,
`remove_self_note`, `pause_discover` (1 to 14 days, 0 ends it), `start_reset` and `do_reset_step`
(a step opens on its own day), each about the caller and each answering with the whole state. "Today"
is the day in the person's city. `discover()` leaves out anyone whose pause has not ended; plans and
asks already made carry on. The kind lines, the self-care steps and the solo ideas are words in
`src/i18n/en.ts`; solo plans are venues of the person's city (`soloPlans` in
`src/domain/selfLove.ts`). Nothing from Self love is logged or pushed. Bounce back is offered on an
ask someone said no to or that ran out, and on Asks, Sent, for three days afterwards.

### Couple mode

A shared corner for two people who matched (D120), reached from the card at the top of Plans and
from round two on a kept plan. A match is a kept plan for two where both said "see them again"
(`private.matched`, never across a block). `private.couples` holds one row per ask (`asked`, `on`,
`ended`); `private.couple_ideas` the date list (catalogue ideas, hearts as an array of the two ids,
done), `private.couple_days` the special days from a fixed list, and `private.couple_weeks` one row
per couple and week with the challenge and who ticked it. None is readable by a client role or the
analytics worker. The app uses only `my_couple`, `couple_ask`, `couple_answer`, `couple_end`,
`couple_add_idea`, `couple_idea` (heart, done, remove), `couple_add_day`, `couple_remove_day` and
`couple_challenge_done`, each answering with the caller's whole state. A week starts on Monday in the
asker's city; its challenge is picked from `private.couple_challenge_ids()` (the same list as
`COUPLE_CHALLENGES`, words in `src/i18n`) and never repeats last week's. A trigger on `blocks` ends a
couple at once; deleting an account cascades. Streaks, day counts and anniversaries are worked out in
the app (`src/domain/couple.ts`). "Plan it" opens the usual ask, so every date is still a pinky
promise. The screen reads the state again every 15 seconds while open; there are no pushes yet.
With friends (D123): a double date opens the ordinary Doubles ask to the partner, and "Got a single
friend?" opens Bring a friend (`/friends`); neither adds a server rule.

### Gentle reminders

A few pushes a week to bring people back (D124). `private.queue_nudges()` runs hourly from pg_cron
and writes at most one row per person into the same outbox as promise pushes (`notifications`,
`invite_id` null, a `nudge_key` that is unique per person, so each reminder goes once). It runs
only between 10:00 and 20:00 in the person's city, for people with a push token whose switch
(`private.nudge_prefs`, read and set by `my_nudges` / `set_nudges`) is on and who are not paused in
Self love, and keeps to 3 in 7 days and 1 in 20 hours. In order: a Couple mode ask waiting on me,
our couple challenge not ticked by Thursday, the kept-plan streak at the weekend, Monday's ideas,
a Wednesday Self love check-in. A tap opens Couple mode, Plans or Self love (`src/lib/push.ts`).

### Couple mode's Today: question and tip of the day

At the top of Couple mode (D125). `private.couple_answers` holds one answer per person per day; the
day is the asker's city day and the question is `private.couple_question_of(couple, day)`, walking
`private.couple_question_ids()` (the same list as `COUPLE_QUESTIONS`) from a per-couple start.
`couple_question()` answers with today's question, my answer, theirs only once I have answered, the
last 14 days both answered and the streak; `couple_question_answer(body)` takes one answer a day.
Only `couple_on` couples reach either, so a block or an ending closes it. The tip of the day is
`tipOf(day)` in `src/domain/daily.ts`, words in `daily.tips`; nothing is stored for it.

### Daily relationship check-in

`/check-in` (D126), reached from Couple mode's Today and from Self love. `checkin_save` stores one
entry a day in `private.rel_checkins` (mood, two notes, `harm` from `private.mentions_harm`). The app
then calls the `talk` Edge Function with `action: 'checkin'`: it claims today's entry with the
service role (`checkin_ai_claim`), sends only the mood and the notes to Claude with the instructions
in `supabase/functions/talk/checkin.ts`, and stores the answer (`checkin_ai_done`), once a day.
Nothing of it is logged. The reminder is `private.queue_checkin_reminders()` on pg_cron at :03,
kind `checkin_daily`, at the hour in `private.checkin_prefs`, only when there is no entry for the day.

### This week: plan ideas and city events

Plans shows three ideas a week (D121), picked in the phone by `weeklyIdeas` in `src/domain/weekly.ts`
from the ideas offered in the person's city: a per-person order of the catalogue, nine ideas a week,
three of different kinds where it can, so none repeats the week after. Nothing is stored. City events
are a team-written catalogue, `public.city_events` (no client role reads or writes the table), served
by `city_events()`: the caller's city, from now to 14 days ahead, at most 12, a venue's name and area
standing in for the place. Rows are added in SQL and switched off with `active`, never deleted. "Ask"
and "Plan it" open the ordinary ask (`invite/new` takes `idea` and `venue`), so the promise rules apply.

### Your record: kept-plan streak and city standing

Me shows "Your record" (D122). The streak is worked out in the phone from my invites by `keptStreak`
in `src/domain/streaks.ts`: weeks in a row (Monday, India time) with a plan I kept, this week counting
once it has one. Where I stand comes from `my_city_standing()` (security definer, reads
`trust_scores` and `invites` on the server): among people in my city with 3 or more kept or missed
promises, a top 1/5/10/25/50 percent bucket by Trust Score, only once there are 20 of them and I
have 3 of my own; and the share of the city's plans (both people in the city) kept in the last 30
days, once there are 20. It answers only the caller's buckets, never an id, a rank or a list.

### Spicy mode

An opt-in for two adults (D103), off by default, reached from Me. `private.spicy` (one row while it
is on: Discord, Telegram and Signal usernames, boundaries from a fixed list, when the 18+ and rules yeses
were given) and `private.spicy_yes` (a yes to one person) are readable by no client role and not by the
analytics worker. The app uses only `my_spicy`, `save_spicy` (both yeses, a linked account, the
usernames through `private.spicy_username`, which refuses more than six digits as a phone number,
PL123 to PL129), `spicy_off` (deletes the row and every yes given or received), `spicy_with` and `spicy_yes` (PL130).
`private.spicy_with_for` opens from day one between two people who are both on and not suspended,
nobody blocked, when the other is a card Discover showed the caller (`private.discover_seen`) or
someone they share an ask, plan or duo with (`private.shares_invite`); every other case is the
same `{"open": false}`, so it says nothing about the other person. Usernames come back only when both
said yes. Pinkilock hosts no chat: Discord is shown first, Telegram second (a `t.me` link), Signal third (with a tip to turn on disappearing messages). Nothing
is logged, pushed or sent to analytics. The rules are mirrored in `src/domain/spicy.ts`, and
`SPICY_HANDLE_CASES` is the shared username table (`tests/db/spicy_cases.sql`).

Since D105, usernames also wait for the match's **unlock**: 600 bought credits paid to Pinkilock
(`spicy_pay`: 'half' is 300 once, 'full' is whatever is left), kept per pair in
`private.spicy_unlocks`. A trigger on `private.spicy_yes` (a yes taken back, Spicy off, a deleted
account) and one on `blocks` give back what was paid while it is not yet unlocked.

**Call times (D106).** On an unlocked match the two set up a call in Discord, Telegram or Signal,
and Pinkilock checks that it happened. `private.spicy_calls` (one open call per pair, three per
match) holds each person's times (1 to 8, on the half hour, an hour to a week ahead) and minimum
(5, 10, 15 or 30; the shorter applies). `spicy_call_pick` sets the call at the first time both picked.
The **in-app call timer**: while the call's hour is open and the app is in front, the app calls
`spicy_call_beat` every 20 seconds, which writes one row per person per minute to
`private.spicy_call_minutes`; a minute counts when both have a row for it. Nothing of the call
itself is heard or stored. `private.call_sweep` (every minute) or both tapping End hands the facts
to `private.call_verdict`: enough together is talked, one never there is a no-show, one leaving 3+
minutes before the other is a drop, and anything else asks both (`spicy_call_answer`,
`private.answer_verdict`, 24 hours; someone with 3 disputed "they missed it" in 30 days is not
taken on their word alone). A miss writes a bare `call_missed` event for that person (no plan, no
props), which the Trust Score worker weighs like an early bail, and gives the one who showed their
own part of the unlock back (once per match). `spicy_call_end` with `p_unsafe` ("I felt unsafe or
uncomfortable") ends it for both at once with no blame; so do Spicy off, a yes taken back and a
block. One free move each (`spicy_call_move`) an hour or more ahead; later, cancelling is a miss.
Reminders are local notifications on the phone with plain words (`src/lib/callReminder.ts`); no
server push mentions Spicy. The rules are mirrored in `src/domain/calls.ts`; `CALL_CASES` and
`ANSWER_CASES` are the shared tables (`tests/db/call_cases.sql`).

Since D107, Spicy turns on only after the **Spicy terms and quiz**. The person reads the terms
(sections in `src/i18n` under `spicyQuiz.terms`), agrees, and answers five questions; the server
marks them (`pass_spicy_quiz`: PL155 for old terms, PL156 without the yes, PL157 for a missing or
unknown answer) against `private.spicy_quiz_key()` and keeps a pass as a `public.consents` row (kind
`spicy`, version `spicy-N`, so it is in the data download and goes with the account). `spicy_terms`
says where the caller stands. `private.spicy_terms_version()` is the version in force: `save_spicy`
refuses without a pass for it (PL154), and `private.spicy_with_for` is closed unless both people
passed it, so changing the terms pauses every match (no yes, unlock or call) until each passes again.
The key and the marking are mirrored in `src/domain/spicyQuiz.ts`; `QUIZ_CASES` is the shared table
(`tests/db/spicy_quiz_cases.sql`).
**The call itself is in the app, audio only (D111).** While the timer is open, **Join the call**
asks the `voice` Edge Function for a room; it checks the person's sign-in, asks
`spicy_voice_room(user, other)` (service role only: Spicy open, both yes, unlocked, a set call in its
hour, not ended), and mints a LiveKit token for `spicy_<call id>` that may publish the microphone and
nothing else (`supabase/functions/_shared/livekit.ts`, shared with Talk mode). The app joins with
`src/lib/voice.ts` (livekit-client on the web; `@livekit/react-native` WebRTC on phones), never asks
for the camera, and shows mute, leave and "I felt unsafe or uncomfortable". LiveKit posts signed
`participant_joined` / `participant_left` / `room_finished` webhooks to the same `voice` function,
which hands Spicy rooms to `spicy_voice_event` (times clamped to the last ten minutes) and so to
`private.spicy_call_voice`. `private.call_minute_rows` reads the minutes from those sessions once
anyone reached the room, else from the check-ins; `call_together`, `call_timer_settle` and
`call_state` use it. `talk_<call id>` rooms go to `talk_voice_event` once Talk mode has one.
Usernames: `private.spicy_with_for` is now a wrapper over `private.spicy_with_base` that shows
Discord, Telegram and Signal only after a call with outcome `talked` and when both have a row in
`private.spicy_shares` (`spicy_share`); triggers drop shares on Spicy off, a yes taken back or a block.

### Paid features switch

D117: one switch, `paid` in `private.config`, decides whether Pinkilock takes money. It is off by
default; the Supabase deploy sets it from the repository variable `PAID_FEATURES`. The app reads it
once at boot through `public.app_switches()` (`Backend.switches()`, `paid` in the store; any error
reads as off) and hides prices and Pay buttons; the server enforces it. Each money path is a thin
wrapper over the function as it was, renamed into `private` (`*_before_pause`): `wallet_open_order`
(PL188), `treat_plan` (PL188), `talk_call` for paid calls (PL188), `talk_ai_session` (one free
session per local day, `private.saathi_free_days`, PL189) and `spicy_pay` (free, one per person per
7 days, `spicy_unlocks.free_by`, PL190). `private.talk_state` adds `paused` and `saathi_used_today`;
`private.spicy_with_for` adds `unlock.free` and `unlock.free_next`. `private.pink_gold_gift` and
`private.boost_gift` (source `gift`) give the paid perks as rewards, callable only from SQL. The
`wallet` function answers `open: false` and makes no order while paused. The mock follows
`EXPO_PUBLIC_MOCK_PAID=1` (off otherwise). Rules in `src/domain/paid.ts`, checks in
`tests/db/paid_pause.sql`.

### Bring a friend

D118, `supabase/migrations/20261127000002_referrals.sql`. Built on Talk's referral tables
(`private.talk_referral_codes`, `private.talk_referrals`, now with `via` = `link` or `duo`): a friend
joins with `talk_claim_referral` (the `/r/CODE` link, kept on the phone through onboarding by
`src/lib/referral.ts`) or by `join_duo` when their account is under 7 days old (the `/duo/TOKEN`
page is open without a profile and keeps the token through onboarding the same way).
`private.referral_check` says whether a friend has a verified phone (or a linked email with
`referral_needs_phone` off, as it starts until phone sign-in is live), an approved face photo, a plan, and a device (`private.devices`, from
`note_device`, a random id the app keeps, `src/lib/device.ts`) seen on no other account.
`private.referral_settle` gives once per friend (`private.referral_rewards`): 7 days of Pink Gold each
(`pink_gold_gift`), a Boost for the referrer (`boost_gift`, ref `referral:<friend>`), 30 more days
at the 5th, at most 10 per referrer per 30 days. It runs from `public.my_referrals()` (counts and my
own checklist, never who) and `private.referral_sweep()` (pg_cron, every 10 minutes, friends from
the last 60 days). The download adds `app_devices` and `referral_rewards`. Rules mirrored in
`src/domain/referrals.ts`; screen `app/friends.tsx`, entry on Me (`src/components/Friends.tsx`);
checks in `tests/db/referrals.sql` and the attacker suites.

### Wallet

A closed loop of credits (D104), reached from Me, on a plan, in the composer and in Spicy mode. No
client role and not the analytics worker reads any of its tables:

- `private.wallets` (paid and earned balances, the boost), `private.wallet_ledger` (every change,
  once per `(user, kind, ref)`), `private.wallet_orders` (Razorpay orders; `user_id` set null when
  the account goes, the rest kept for the books), `private.wallet_extra_asks`, `private.wallet_stakes`,
  `private.wallet_treats`, `private.wallet_visits`, and `public.treat_partners` (readable when active,
  written by no client).
- Every balance change goes through `private.wallet_move` in the same transaction; spending
  (`private.wallet_spend`) takes earned credits first. The app calls `my_wallet`, `wallet_visit`
  (the streak, from boot), `wallet_boost`, `wallet_extra_ask`, `wallet_stake`, `treat_options`,
  `treat_plan`, `decline_treat` and `spicy_pay` (PL132 to PL146).
- `send_invite` allows 3 open asks plus the extra ones; `discover()` puts boosted cards first.
- A trigger on invites leaving `locked` settles stakes (`private.stake_end`, the same rules as
  `stakeEnd` in `src/domain/wallet.ts`; `STAKE_CASES` is the shared table), turns a held treat into a
  voucher code on a kept plan or gives it back, and rewards a kept plan. Triggers on
  `profile_private`, `photos`, `date_ratings` and `vouches` give the other rewards. `wallet_sweep`
  (pg_cron, every ten minutes) gives back vouchers nobody used in a day.
- Top-ups: the `wallet` Edge Function makes a Razorpay order at `wallet_pack_price`, files it
  (`wallet_open_order`), and credits it (`wallet_paid`, once, amount checked) after checking the
  Checkout signature and reading the payment from Razorpay, or from the signed webhook
  (`payment.captured`, `order.paid`; `refund.processed` calls `wallet_refunded`). Only the service
  role may call these and `redeem_treat` (for a partner's till, later). The website loads Razorpay
  Checkout (`src/lib/razorpay.ts`; `web/_headers` allows its script and frame). The phone apps offer
  no top-up until Play Billing (O15).

### Pink Gold

Pink Gold (D115) is the name for paid members. `private.pink_gold` (no client role can read it)
holds who is a member, since when and until when; `private.is_pink_gold` gives only yes or no, and
`public.profile_cards` carries it as `pink_gold`, so the badge reaches exactly the cards a person may
already see (Discover, a shared plan, their own on Me) and a block hides it like the rest. The app
reads it as `Profile.pinkGold` and draws `src/components/PinkGold.tsx`; the mock seeds two members.
The team can also grant it in SQL (`OPERATIONS.md`, "Pink Gold"). Spicy mode never reads it. My
download has my own `pink_gold` (since, until, now), without the team's note, and my `boosts`.

**Plans and Boosts (D116)** ride the wallet's order path: the `wallet` Edge Function asks
`wallet_pack_price` (credit packs from `private.wallet_pack`, plans and Boost packs from
`private.shop_item`), files the order with `wallet_open_order` (PL184 past 13 months ahead, PL186 past
12 Boosts waiting), and `wallet_paid` hands a paid plan or pack to `private.shop_deliver` (months onto
`private.pink_gold`, rows into `private.boosts`) instead of crediting. `wallet_refunded` undoes either.
A Boost is a row in `private.boosts` that lapses a month after buying; `wallet_boost` uses the one
that lapses first (PL185 when none) and sets `wallets.boost_until` for 24 hours. A member's 2 free
Boosts for the Indian month arrive on `my_wallet` or `wallet_boost` (`private.member_boosts`).
`discover()` orders boosted cards, then members, then the daily shuffle; `send_invite` lets a member
have 15 open asks (PL187); `save_profile` lets a member move to a city marked `early` before it is
`active`. "See who asked you" is app-side (`asksInView`): the Asks tab shows a member every open ask
waiting on them, and anyone else the next one plus a count. The server still sends every ask, so
each one shows who sent it before anyone answers. A member's first `talk_ai_session` in an Indian month
costs nothing (`private.member_saathi`, one row a month; `my_wallet` says `saathi_free` while it waits).
`src/domain/pinkGold.ts` holds the same prices and rules for the app and
the mock; the page is `app/pink-gold.tsx`, reached from Me.

### Talk mode

"Feeling alone? Talk to someone" (D108), reached from Me. Never linked to Spicy mode
(`tests/unit/talk.test.ts` checks the imports, the routes and the words). No client role and not the
analytics worker reads any of its tables, all in `private`: `talk_people` (my settings, the free
call), `talk_referral_codes` and `talk_referrals`, `talk_ai_chats`, `talk_ai_minutes` and
`talk_ai_days` (minutes charged and a flag, never the words), `talk_listeners`, `talk_calls`,
`talk_minutes` (heartbeat minutes, as D106), `talk_payouts` (the listener set null when the account
goes, kept for the books), `talk_blocks` and `talk_reports`.

- **Shared rules**, in TypeScript and SQL with shared case tables (`tests/db/talk_cases.sql`):
  `talkMatch` / `talk_match` (caller's opposite, same or anyone against the listener's women, men or
  anyone), `mentionsHarm` / `mentions_harm` (one word list) and `talkSplit` / `talk_split` (credits
  to paise at 76 per credit, 60% to the host, GST inside Pinkilock's 40%, TDS 0.1% under 194-O).
- **The app** calls `talk_state`, `talk_settings`, `talk_ai_session` (60 credits for up to 15 minutes
  on a chat, D114; again in its last 2 minutes; free on a flagged chat), `talk_listeners`, `talk_call`
  (holds bought credits for the length, PL139 when short), `talk_answer`, `talk_beat`, `talk_end`,
  `talk_report`, `talk_block`, `talk_listener_apply`, `talk_listener_available` and
  `talk_claim_referral` (PL158 to PL177). `talk_sweep` (pg_cron, every minute) ends calls nobody
  answered, that ran their length, or where someone left; it charges only minutes both were present.
- **The `talk` Edge Function** holds every key: `ai` (checks through `talk_ai_turn` that the chat has paid time,
  a day pass bought before D114, or a mention of self-harm, which always goes,
  then asks the model with the instructions in `supabase/functions/talk/companion.ts` and the tone the
  phone sent, warm or flirty, always warm once the chat is flagged (D113); the reply's
  help marker sets `talk_ai_flag`), `voice` (a LiveKit token for `talk_<call id>` from
  `talk_voice_room`: microphone only, no data, no recording), `kyc` (PAN, bank and address straight to
  Razorpay Route's linked accounts; only the last four digits come back, `talk_kyc_done`), and
  `payouts` (called hourly by pg_cron through `private.kick_talk_payouts` with the push secret:
  `talk_payouts_claim` gives payouts a week old and not held by a report, each sent as a Route
  transfer and recorded by `talk_payout_done`). Without a key, each part answers "off" and the app
  says so. A person approves a listener with `talk_listener_decide` (service role).
- **The free first call** (D109) opens in `private.talk_person` from a verified referral or a finished
  profile (face, handle, plans). The invite link `/r/CODE` is open without a profile; the code waits
  on the phone (`src/lib/referral.ts`) until onboarding is done.
- **The review ask** (D110): `src/lib/review.ts` shows the store's prompt after a kept plan, a match or
  a good listener call, at most once in 60 days (`src/domain/review.ts`), never on the web.

### Friend vouches

A person makes a link (`create_vouch_link`: three a day, each good for 7 days and three friends); a
friend who opens it picks one to three phrases from a fixed list (`vouch`), signed in or not. The
card shows the count and the phrases picked most (`private.vouch_summary`), never who vouched;
`vouches` is readable by no client role.

### Duos and doubles

A person makes a duo link (`create_duo_link`: three a day, one day, one use); a friend who has a
profile opens it in the app (`/duo/[token]`) and joins (`join_duo`). `duos` holds one row per person,
so nobody is in two duos, and each person reads only their own row; cards say only `has_duo`. Either
can `leave_duo`, and a block between them ends it. `send_invite(..., p_double => true)` seats both
duo partners and refuses (PL004, naming no one) if any two of the four have a block. Everyone on a
double reads the plan and the four cards (`private.on_invite`, `private.shares_invite`); a block
between any two of them ends it and hides it from those two. The reveal policy opens a contact only
between two people on opposite sides who both checked in. Round two stays a two-person thing.

### Add to calendar

A locked plan offers "Add to calendar": `src/domain/calendar.ts` writes an `.ics` file (the idea, a
first name, the place, the time in UTC, a reminder; never a contact handle) and
`src/lib/calendarFile.ts` hands it over, as a download in a browser or through the share sheet on
a phone. Pinkilock sends it to no calendar service; where it goes is the person's choice.

### Photos behind the lock

Up to three photos (D088), each shown to nobody else until a moderator has approved it, and then
only where the handle is shown: after a kept promise, never across a block. On Me,
`src/components/MyPhotos.tsx` picks one (`src/lib/photoPick.ts`: `expo-image-picker`, then
`expo-image-manipulator` to a JPEG of at most 1280 px, which drops the file's metadata) and the
backend POSTs it with the person's own token to the `photo` Edge Function. The function checks the
token with Auth, strips the file again (`supabase/functions/photo/jpeg.ts`: EXIF, XMP, ICC,
comments and anything after the image; a file that is not a whole JPEG is refused), then draws
the picture again from its pixels (`supabase/functions/photo/reencode.ts`, D098: mozjpeg in
WebAssembly decodes, jpeg-js writes a new baseline JPEG at quality 85; more than 1600 px on a side,
or a file that will not decode, is refused), so nothing hidden in the picture data survives, asks
`add_photo` for the rules (three photos, six uploads a week, 2 MB, not paused) and stores the file
in the private `photos` bucket. No client can write to the bucket, so a modified app cannot skip
any of that.

A moderator works through `scripts/moderate.sh photos` and decides with `photo <id> approve_photo |
hold_photo | hold_photo_contact`; the last is a strike, as for a line. Reading is RLS twice over:
`photos` returns my own rows and someone else's approved rows where `private.revealed_to` allows,
and the Storage policy signs a file only when its row is readable. Links last ten minutes and the
app keeps none. Removing a photo, or deleting the account, deletes the row at once (and with it
every way to read the file) and leaves the path in `photo_trash`; the push function, woken by a
five-minute job, deletes the files through the Storage API. A phone build from before this change
has no picker, so Me says photos need the new version.

### Your face on your card

One optional photo of your face (D095), shown on your card in place of the drawn portrait. It is
taken in the app with the front camera and never picked from the gallery
(`src/components/FaceCamera.tsx`, `expo-camera`; in a browser, the browser's camera), with an oval
to fit into and, before sending, the line that says who will see it. Sending it records the `face`
consent. It travels the same road as the photos behind the lock: the `photo` Edge Function with
`?kind=face`, `add_photo` with `p_kind = 'face'`, `pending` until a moderator approves it, a strike
when held for a contact. Its own rules (`src/domain/face.ts` and `add_photo`): one waiting at a
time, a new one once a week except straight after a held one, three tries a week. While a new one
waits the old one stays up; approving it deletes the old one.

Who sees it is `private.face_visible`: the owner, and whoever is already shown the card (people
they share a plan or a duo with, and cards `discover()` handed out in the last two days), never
across a block and never while the account is paused. The `photos_face` policy and the Storage
policy apply it, so a face is never signed for anyone else. The backend adds `faceUrl` to every
card it reads (one query for the faces of the cards in hand, then signed links of an hour, reused
while their rows still come back); `Portrait` draws the face, and falls back to the drawing if the
link fails. "Camera only" stops an ordinary person sending a screenshot; a modified app could send
any picture, so the person who checks it is the real defence until the automatic checks (O04).
A 0.2.x phone build has no camera module, so Me says the face needs the new version.

### Share my date and the after-date check

A locked plan offers "Share my date" (who, what, where, when, through the phone's share sheet; no
contact handle) and "Check on me after" (a local notification 15 minutes after the end that opens
the Safety screen). Both stay on the phone: Pinkilock keeps no trusted contact and cannot alert
anyone by itself.

### Words and languages

Nothing on screen is written into a screen. Screens, components and the few domain labels that
are words (report reasons, kinds of date, ask tones, free windows, tag groups) call `t('group.key')`
from `src/i18n`; the English is `src/i18n/en.ts`, and a new language is a file of the same shape
in which any key left out shows in English. Error messages are looked up by code, so the SQL
keeps the English and the app shows the phone's language. Dates, times and numbers use the
phone's locale through `Intl`, plan times are shown in the viewer's own time zone (when another
clock reads differently, the plan names it too: the other person's on a call, the place's on a
date in person, from the city's `time_zone`, never from where a phone seems to be), and distance
is in miles where the
viewer's profile country uses them (US, UK, Liberia, Myanmar), or the phone's region before
there is a profile. The language comes
from the person's choice in the language picker (D102; kept on the device: localStorage in a
browser, read before the first frame, AsyncStorage on a phone, read before the splash screen
goes), else the phone, and `?lang=` in a browser wins over both. `src/i18n/languages.ts` lists
English and the 22 scheduled languages with their script, direction, the states where each is
the main language (the picker suggests those first) and whether a native speaker has reviewed
it; `src/i18n/langs/` holds the translations. Indian languages keep the digits 0 to 9. In a
browser the current script's Noto font is loaded after Inter Tight in every font stack
(`src/theme/scriptFonts.web.ts`); a phone falls back to its own system font, so the app ships
none. `T` opens up line heights and drops letter spacing for non-Latin scripts. On a phone a right-to-left language flips the layout
from the next start; in a browser `<html>` gets `lang` and `dir`. Two pseudo-languages exist only
for testing: `en-XA` (accented and a third longer) shows any text that skipped `t()` and any label
that will not fit, and `ar-XB` checks the mirrored layout. `tests/unit/strings.test.ts` fails on
words written straight into a screen.

Catalogue content is not in the strings files: idea titles and openers, profile tags, ask lines
and venues are rows in SQL tables, and are translated per region by a native speaker as each
region opens (WP9). A local idea (cutting chai, pani puri) lists the countries it is offered in
(`ideas.countries`, null for everywhere): onboarding and Me offer only what is on offer where the
person lives, and `save_profile` refuses a newly picked one from elsewhere (PL104) while keeping
any already saved. A city idea (vada pav on the sea wall, misal pav) also lists the open cities it
is offered in (`ideas.cities`; a state's dish lists every open city in that state), so every open
city has at least one in-person idea of its own. The pickers show those first, marked "Local to
<city>", and a trigger on `profiles` (`private.check_city_ideas`) refuses a newly picked one from
another city, a move included, with the same PL104. Every plan option in both pickers (sign-up
and Me) shows its one-line summary, and its arrow opens what you do, where, the cost and why it
works. Stored values stay as they were written: the place on a remote ask, and the
picked ask line, are read by the other person as sent.

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
- **System bars**: light status bar content; on Android the navigation bar is painted the night-sky `bg` with
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
  first screen: in a window 960 or wider onboarding asks `Screen` for `wide` and shows the
  website's front page (`src/components/Landing.tsx`) across the whole window, with no hairlines and
  its text kept to `wideMax` (1200); narrower, it shows
  the one-column `Welcome`. Start on either goes into the same sign-up steps.
- **Desktop**: in a browser window 960 or wider (`src/lib/desktop.ts`, `useDesktop`) the app has
  a desktop layout instead of the column: the tab bar is a side menu (`tabBarPosition: 'left'`),
  and each `Screen` lays itself out by its `desk` prop (`page` up to `deskMax` with `Columns` and
  `Grid`, `form` beside the night sky, `read` up to `readMax`). The column rule above holds for
  phones and narrow windows only; no screen measures the window itself.
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
  entry. The build is one page (`web.output: single`); Cloudflare Pages answers every path with
  `index.html` (there is no `404.html`). The website is this build at pinkilock.com, published by
  `.github/workflows/web-deploy.yml` with the headers in `web/_headers`: a content security policy
  that allows only the page's own scripts and the Supabase project, no framing, HSTS. `public/manifest.json`, the home-screen icons and `public/share.png` are drawn by
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
  content, the on-screen reference round-trips, no catch in `src` or `app` is empty, and no screen
  or component has words written into it (every word goes through `src/i18n`).
- `python tests/db/run.py`: starts a throwaway Postgres (pgserver), applies a small Supabase shim
  (roles, their default privileges, `auth.uid()`, a pg_cron stand-in), runs every file in
  `supabase/migrations`, walks three users through the state machine as the `authenticated` role
  (RLS, the functions, the reveal, the cron schedule, the analytics role's rights), runs the DuckDB
  pipeline logged in as `pinkilock_analytics` (with the worker's rights and no more) and checks what it wrote, then checks the push outbox: who is told what, that nothing
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
