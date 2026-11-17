# Pinkilock build plan: hardening, satisfaction and going global

Written on 2026-11-17 for the engineer (or model) who builds the next stage. It assumes you have
read `CLAUDE.md`, `ARCHITECTURE.md` and `ROADMAP.md`. It does not replace the roadmap: Phase 3 and
Phase 4 items stay there. This plan adds the work needed to meet three targets the owner set, and
says in which order to do it.

## 1. The three targets, stated so they can be tested

### Target A: "no reverse engineering, no hack"

Taken literally this cannot be met by any app: the binary is on the attacker's phone, and anything
on it can be read and changed. Obfuscation only buys time. So the target the build is held to is:

> **An attacker who has fully reverse engineered the app, and holds a valid session, gains nothing
> the product forbids.** No contact before a kept promise, no one else's data, no forged promise
> state, no bulk copy of the people on it, no inflated Trust Score, and no secret to steal.

Everything in this plan follows from that: every rule is enforced on the server, the client holds
no secret, and the binary is made tedious to tamper with as a second layer only.

The test for it is the **attacker suite** (work package 0): a hostile client that talks to the API
directly, skipping the app. Target A is met when every check in that suite passes in CI.

### Target B: "satisfaction above 96%"

A plan cannot guarantee a satisfaction number; it can make the number exist and build the things
that move it. Today nothing measures it. The definition this plan builds:

| Measure | Definition | Target |
| --- | --- | --- |
| Date satisfaction | After a kept promise, each person answers "Worth showing up?" Yes or No. Share of Yes among answers, trailing 28 days, at least 50 answers | 96% or more |
| Stability | Sessions with no crash | 99.5% or more |
| Promise kept rate | Locked plans that end `kept` (already in `analytics.metrics_daily`) | Report it; no target until there is real data |
| Safety | Kept or flaked plans that lead to a report | Report it; every report reviewed within 24 hours |

Until 50 answers exist, the number is reported as "not enough data", never as a percentage.

### Target C: "used globally, within every country's privacy and safety rules"

No single build is lawful everywhere on day one, and this plan is engineering advice, not legal
advice. A dating app handles some of the most protected data there is (who someone wants to date
can reveal sexual orientation), and the rules differ by country. The target the build is held to:

> **The app opens in a country only when that country is on an allow-list, and a country joins the
> list only after its checklist in WP8 is done and a privacy lawyer has signed it off.**

So "global" is reached region by region, with the engineering for all of them built once.

## 2. What the review found

I read the migrations, the RLS policies, the auth settings in `supabase/config.toml`, the client
configuration and the push function. I did not read `supabaseBackend.ts` or the workflows line by
line, and I could not see the hosted project's settings; work package 0 covers those.

**Already right, keep it:** promise state changes only through `security definer` functions; the
reveal and blocks are RLS policies; table grants are explicit; reports and blocks are unreadable
by clients; pushes come only from the server and carry no private data; the client holds only the
public anon key; the service role key is used by nothing in the repo.

**Gaps**, each checked against the code:

| # | Gap | Where | Why it matters |
| --- | --- | --- | --- |
| G1 | A contact can be shared before the reveal through free text: `name`, `tagline`, `area`, `pronouns`, `vibes`, the ask's `note` and `place`. Nothing on the server looks for handles, links or phone numbers | `profiles` table, `send_invite` | It defeats the core mechanic without any hacking |
| G2 | `vibes`, `idea_ids`, `area`, `pronouns`, `city` and `place` have no length or content limits; `vibes` and `idea_ids` accept any strings | `20261116000001_schema.sql` | A modified client can put any text of any size on a public card |
| G3 | The client may update every column of its own `profiles` row, including `photo_count`, `palette`, `glyph` and `city` | `grant select, insert, update on public.profiles` | Server-owned facts are client-writable |
| G4 | An anonymous account can do everything: read every card and send asks. Captcha is off; the local config allows 300 anonymous sign-ins an hour per address | `config.toml` `[auth]`, `[auth.rate_limit]` | Scraping and spam accounts cost nothing |
| G5 | Any signed-in user can select every profile in one query. Discover has no server-side page size or daily limit | `profiles_read` policy | The whole user base can be copied in one request |
| G6 | Asks are capped at 3 open at a time but not per day, and there is no cooldown after a decline. `passes` and `log_event` props are unbounded | `send_invite`, `log_event` | Harassment by repeated asks; storage abuse |
| G7 | Check-in is a button. Nothing shows the two people were together | `check_in` | Two accounts (or one person with two) can farm kept promises and Trust Scores, and open reveals |
| G8 | Trust Scores count every kept promise, including many between the same two accounts | `analytics/duckdb_pipeline.py` | Score farming |
| G9 | The session token is stored unencrypted | `src/services/index.ts` (AsyncStorage) | Readable on a rooted phone or from a backup |
| G10 | Over-the-air updates are not code signed | `app.json` `updates` | Anyone with the Expo account or token can ship code to every phone |
| G11 | A production build with missing keys silently runs the mock | `src/services/index.ts` | A misbuilt release looks alive and saves nothing |
| G12 | No crash reporting and no satisfaction measure | whole app | Target B cannot be seen |
| G13 | Reports can only be read in the SQL editor | `ROADMAP.md` Phase 3 | The 24-hour review promise cannot be kept at any volume |
| G14 | Age is self-declared | onboarding, `profiles.age` | Store rules and safety; a report reason is the only control |
| G15 | The app assumes India: `city` defaults to `Mumbai`, the phone placeholder is `+91`, distance is in km, the contact kinds are Instagram, Snapchat and WhatsApp, several date ideas are local (momo, pani puri, chai), and all text is English | schema, `app/onboarding.tsx`, `src/domain/ideas.ts` | It will not read as made for anyone elsewhere |
| G16 | No consent record, no privacy policy or terms in the app, no retention limits, no record of where data is stored or which companies process it | whole app | Required before launch almost everywhere |
| G17 | No country gate: anyone anywhere can sign up | auth | The app would be live in countries whose rules have not been checked, including ones where dating apps or same-sex dating put users at risk |
| G18 | A filter on typed text cannot catch coded contacts (1 for a, 2 for b; a number spelled in words; a handle split across fields or across edits), and once photos exist (Phase 4) a handle can simply be written in a picture, or shown as a QR code | every free-text field; Phase 4 photo upload | The reveal is bypassed without touching the server rules |
| G19 | Signing out clears only the phone's copy of the session; the session stays valid on the server | `supabaseBackend.ts` `signOut({ scope: 'local' })` | A copied or stolen token keeps working after the person signed out |
| G20 | A bug is hard to trace: failures are swallowed silently in places (`.catch(() => {})`), server errors are recognised by matching their message text, nothing carries an error code or a trace id, and no error ever reaches us from a phone | `supabaseBackend.ts`, every `raise exception` in the migrations | A user's "it did not work" cannot be tied to a cause |
| G21 | The `photos` field on the private row takes any JSON of any size | `profile_private.photos` | Storage abuse, and arbitrary content shown after a reveal |
| G22 | Sign-in says whether an email address or phone number has an account ("already on another account", "No account uses that yet") | GoTrue's answers, passed on by `codeError` | On a dating app, "is this person on it?" is itself private |
| G23 | 16 high or critical npm advisories in the dependencies that ship, most through the Expo SDK 52 toolchain; not yet triaged one by one | `npm audit --omit=dev` on 2026-11-17 | Known-vulnerable code in the build; some may be build-time only |
| G24 | Realtime delete events carry the row id to every subscriber | `listen()` in `supabaseBackend.ts`, Supabase Realtime | Low: an id with no content, but it tells a listener that an account or invite went away |
| G25 | GitHub Actions are used by tag (`@v4`), not by commit | every workflow | Low: a hijacked tag would run in CI with the deploy secrets |

## 3. Work packages, in order

One work package is one branch and one pull request. Each ends with the checks named in it
passing. Do them in this order; the dependencies are in section 4.

### WP0. Attacker suite and settings audit

The foundation: every later package adds checks here.

- Add `tests/db/attacker.sql` (run by `tests/db/run.py`) and `tests/live/attacker.test.ts` (run by
  `npm run test:live:local`). Both act as a signed-in user calling PostgREST and RPC directly.
- First checks, which should pass today and pin what is already right: cannot read
  `profile_private` without a kept promise; cannot write `invites`, `events`, `trust_scores`,
  `blocks`, `reports`, `notifications`, `push_tokens` directly; cannot call `sweep_invites`,
  `claim_notifications`, `set_push_config`; cannot read a blocked person; `anon` can read and call
  nothing.
- Then add one **failing** check per gap G1 to G8, marked as expected failures with the gap
  number. Each later package turns its checks green and removes the marker.
- Read `supabaseBackend.ts` and every workflow for anything this review missed; add findings to
  the table in section 2.
- List the hosted project's auth settings that matter (anonymous sign-ins, captcha, rate limits,
  OTP expiry, session lifetime) and make the deploy workflow set them, so they are in the repo and
  not only in the dashboard. `OPERATIONS.md` gets the list.
- Add to CI: a secret scan (gitleaks or the like) and `npm audit` at the high level, both failing
  the build. Add Supabase's database security lints to the deploy workflow if the CLI in use
  offers them; check its documentation first.

**Done when:** the suite runs in CI, the pinned checks pass, and every gap has a marked check.

**Status, 2026-11-17: built.** `tests/db/attacker.sql` pins 47 defences and marks 17 open gap
checks (G1 to G8, G18, G21); `tests/live/attacker.test.ts` adds the network side and G1, G3, G4,
G22. The backend and workflow read added G19 to G25 above. The deploy workflow now sets and prints
the auth settings (`OPERATIONS.md`, "Auth settings"). CI has the secret scan and a dependency
audit against a baseline; the database lint and Supabase's security advisor are report-only until
each has had a clean first run. Where the new gaps are closed: G21 in WP1; G22 in WP2; G24 in WP3;
G19, G23 and G25 in WP5; G20 in WP0b.

### WP0b. Every bug traceable (G20)

Do this straight after WP0, so that every later package is built with it. The aim: **from a
screenshot of an error, or a user saying when it happened, find the cause in minutes**, without
asking them to reproduce it. Nothing here may log content: ids, codes and timings only.

- **Error codes, one catalogue.** Every `raise exception` in the SQL functions gets a stable code
  (a custom SQLSTATE such as `PL101`, with the message as now). `src/domain/errors.ts` holds the
  same list: code, the words shown to the person, and whether the app should re-read. The live
  backend maps on the code, never on message text (today `rpcInvite` matches
  `/gone|not available|.../`). The mock throws the same codes. A database test fails if a function
  raises without one.
- **A trace id per action.** The app makes a short id for each thing a person does (send, lock,
  check in, save) and sends it as a request header on every call that action causes. The SQL
  functions read it from the request and store it in `events.props`; the push outbox carries it
  to the Edge Function, which logs it. One id then links the tap, the database change, the
  notification and the push.
- **Every error on screen shows its code and trace id** in small type under the message (for
  example `PL101 · 7F3K2M`), and can be copied. That line is all support needs from a user.
- **Nothing fails silently.** Every `catch` either handles the error or reports it. The empty
  `.catch(() => {})` calls in `supabaseBackend.ts` and the store go through one `report(error,
  where)` function. A lint rule bans empty catch blocks.
- **Errors reach us.** `log_client_error(p_code, p_trace, p_where, p_app_version)` writes to a
  `client_errors` table no client can read, rate-limited per account, 1 kB at most, kept 30 days.
  It works with no outside service; the crash tool in WP7 adds stack traces on top and uses the
  same code and trace id.
- **One logger in the app**, replacing ad hoc `console` calls: levels, structured fields, and a
  scrubber that drops anything that is not an id, a code, a route or a number. It keeps the last
  100 lines in memory as breadcrumbs (screen opened, action started, action finished, error).
- **Every build says what it is.** Version, git commit and update id are stamped at build time,
  shown at the bottom of Me, and attached to every error report. Source maps go to the crash tool
  (WP7), never into the binary, so a stack trace reads as file and line.
- **"Copy diagnostics" in Me:** app version and commit, backend kind, my user id, the breadcrumbs
  and the last five error codes with trace ids. No names, notes, places or contacts.
- **The server's side of a story, in one query.** `OPERATIONS.md` gains "Trace a bug": given a
  trace id, an invite id or a user id and a time, the queries that return the events, the
  notifications and their delivery state, and the client errors, in time order. Add
  `private.invite_timeline(p_invite)` for it, callable only with the database role.
- **Push delivery is traceable to the phone.** Poll Expo push receipts (the gap already named in
  `ARCHITECTURE.md`, section 6) and record the result on the notification row.
- **A root error boundary** in `app/_layout.tsx`: a crash in one screen shows the code and a
  "Try again", and reports itself, instead of a white screen.
- **Rule for every fix from now on:** a bug fix starts with a test that fails for that bug, in
  `tests/db`, `tests/live` or the app tests, and the fix's pull request names the trace id or
  error code that found it. Add this to `CLAUDE.md`.

**Done when:** a test forces one failure in each layer (a refused SQL function, a network drop in
the backend, a throw in a screen, a rejected push) and, starting only from the code and trace id
shown on screen, finds every one of them with the queries in `OPERATIONS.md`; the attacker suite
shows that `client_errors` cannot be read or flooded by a client and that the trace header cannot
be used to write anything but an id into the log; and no empty catch block is left.

**Status, 2026-11-17: built, with three parts left.** Done: codes on every SQL error and the
same catalogue in `src/domain/errors.ts` (a unit test checks both directions); a trace id per
database call, stamped on events and pushes by triggers and logged by the push function; the
reference under every error on screen; `client_errors` and `log_client_error`; one scrubbing
logger with breadcrumbs; no empty catch (a unit test, in place of a lint rule, since the project
has no linter); the build stamp; Share diagnostics; `private.invite_timeline`; the crash screen;
"Trace a bug" in `OPERATIONS.md`. **Not done:** polling Expo push receipts (delivery after Expo
accepts a push is still unseen); one trace id shared across the several calls of a single tap
(today each database call has its own); and direct table writes (profile save, pass) carry no
trace until WP1 moves them into functions. Source maps wait for the crash tool in WP7. For WP8:
`client_errors` rows are personal data and are not yet in `export_my_data`.

### WP1. Nothing free-form reaches a stranger before the reveal (G1, G2, G3, G18)

A filter can be beaten by anyone who invents a code, so the first defence is not a filter. It is
**removing the places where a stranger can be sent free-form content at all.** What cannot be
typed cannot be encoded. Filters and review are kept only for the one field that stays free.

**Every field another person sees before a kept promise, and what it becomes:**

| Field | Today | After |
| --- | --- | --- |
| Tags (`vibes`) | Any strings | Picked from a `vibes` catalogue table, at most 3 |
| Ideas (`idea_ids`) | Any strings | Picked from `ideas`, 3 to 6 |
| Ask line (`note`) | Free text, 80 characters | **Picked from the ready-made lines only** (`noteStarters`, six tones), stored as a line id. No typing. The catalogue grows instead |
| Place | Free text | In person: picked from a place search (a maps provider) and stored as the place's id, name and area. Video and game: fixed by the app, as now |
| Area, city | Free text | Picked from a list for the chosen country |
| Pronouns | Free text | Picked from a list, or left empty |
| Name | 2 to 24 characters | First name: letters only, one word, 2 to 16 characters, no digits, dots, underscores or symbols. One change per 30 days |
| One line about you (`tagline`) | Free text, 80 characters | The only free text left. See below |

**The one free field, the profile line:**

- It starts from a prompt ("my toxic trait:", "the ick:" and the rest of `TAGLINE_PROMPTS`) and
  keeps 80 characters.
- It is **not shown to anyone until it has been reviewed.** Until then the card shows without it.
  Review is two steps on the server: the pattern check below, then a language-model check asked
  one question: "Is this an attempt to pass a way of contacting the writer, including in code,
  spelled-out digits, substitutions or instructions to decode something?" Anything unsure goes to
  a person (the moderation view in WP7). *Owner decision and an account are needed for the model;
  see section 5.*
- **One change per 7 days.** This matters as much as the review: a code needs a key or several
  messages, and a field that changes weekly and is reviewed each time is a very slow channel.
- `private.looks_like_contact(text)`: `@handle`, URLs and domains, runs of 5 or more digits with
  anything between them, digits spelled as words in the launch languages, the names of messaging
  and social apps, and words like "decode", "replace", "add me", "find me". One error message:
  "Contacts unlock after a kept promise. Take that out."

**Also in this package:**

- Profile writes move to one function, `save_profile(...)`; the `insert` and `update` grants on
  `profiles` are revoked. `photo_count`, `palette` and `glyph` are set by the server. The `vibes`
  table joins the list in `CLAUDE.md` of things that exist twice.
- Existing rows are migrated: a note or place that is free text on a finished invite stays as
  history; open asks keep theirs until they resolve; taglines enter the review queue.
- The mock and `src/domain/` mirror every rule, so the app never offers what the server refuses.
- A report reason, `shared_contact`, in SQL and `src/domain/safety.ts`. A confirmed case hides the
  line, costs the writer the ability to set one for 30 days, and a second case suspends the
  account. The terms (WP8) say so.
- Low-capacity channels that remain (which three tags, which ask line, which time) carry too
  little to pass a handle and are left alone. Do not add fields that widen them: no free-text
  "custom tag", no custom ask line, no emoji picker for names.

**Done when:** the G1 to G3 and G18 attacker checks pass: a direct API call cannot store a note,
place, area, pronoun or tag that is not from its catalogue; an unreviewed profile line is not
returned to any other account by any route; a table of at least 60 lines (30 that must be held,
including coded and spelled-out ones, and 30 ordinary lines that must pass) gives the expected
result.

**Status, 2026-11-17: first part built** (the part that needs no owner decision). Done:
`save_profile` as the only way to write a profile, with the direct write rights revoked (G3, G21);
the `vibes` catalogue and the idea, tag and length limits (G2); the name rule; and
`private.looks_like_contact` on the profile line, area, pronouns, and an ask's note and place (the
plain cases of G1). The attacker suite's G1, G2, G3 and G21 lines are now permanent checks.
**Still open:** G18 (a made-up code passes any pattern) until the profile line is reviewed before
it is shown; the pick-only ask line (O03), the review step (O04) and place search (O05), which
wait for the owner; picked area, city and pronouns; and the change limits (name once in 30 days,
line once in 7). One known rough edge: an existing account whose name has a space, digit or
symbol must change it at its next profile save.

### WP2. Make accounts cost something (G4, G6)

- Browsing stays open to anonymous accounts. **Sending an ask, answering one, and appearing in
  Discover require a linked email or phone.** In SQL this is the `is_anonymous` claim in
  `auth.jwt()`. The app asks for the link at the first ask, not at onboarding, so the first minute
  stays free of forms. *Owner decision: see section 5.*
- Captcha on anonymous sign-in and on code requests (Turnstile or hCaptcha, whichever the Supabase
  version supports; read its documentation). Needs an account from the owner.
- Daily limits kept in a `private` table and enforced in the functions: 10 asks a day, 1 ask to the
  same person per 7 days after a decline or expiry, 200 passes a day, 20 profile saves a day.
  `log_event` props capped at 1 kB.
- The limits live in one place in SQL and are mirrored as constants in `src/domain/invites.ts`.

**Done when:** the G4 and G6 checks pass, and the two-user live test still passes with linked
accounts.

### WP3. Discover through a function (G5)

- `discover(p_limit int default 20)` returns at most 20 cards a call: same city, not blocked, not
  passed, no live invite with me, linked accounts only. A daily ceiling of 200 cards per account.
- The `profiles_read` policy narrows to: my own row, people I share an invite with, and people I
  blocked (through `my_blocks()` as today). `profile_cards` follows, since it is a
  `security_invoker` view.
- The `Backend` interface gains paging for Discover; the mock does the same. Realtime on
  `profiles` keeps working for the rows a person may still read; check that a profile edit by
  someone in my Discover queue is picked up on the next page load, and document that it is not
  live any more.

This is the largest change to data access in the plan. Read `supabaseBackend.ts` fully before
starting, and run `npm run test:app:local` at the end.

**Done when:** the G5 check passes (one account cannot read more than 200 cards in a day by any
route), and the app tests pass.

### WP4. Check-in that proves two people met (G7, G8)

- When the check-in window opens, each person's phone can fetch **their own** 4-digit code for that
  plan (`my_checkin_code(p_invite)`). To check in, a person enters **the other's** code:
  `check_in(p_invite, p_code)`. In person they show each other the screen; on a video or game plan
  they read it out. Five wrong tries locks check-in for that person for 5 minutes.
- Why this works: there is no chat and (after WP1) no contact before the reveal, so the code can
  only pass between two people who are actually in the same place or on the same call.
- Codes are generated on the server, stored hashed per invite and person, never sent in a push,
  never in Realtime payloads, and deleted when the plan resolves.
- This changes the state machine's check-in step: change `src/domain/invites.ts`, the SQL and the
  mock together, and rerun `tests/db`. The mock's other person "reads out" their code after its
  usual delay.
- The analytics worker counts at most one kept promise per pair per 30 days toward a Trust Score,
  and none where either account was anonymous. A database test pins both rules.

**Done when:** the G7 and G8 checks pass: one person with two accounts and no second phone in hand
cannot produce a `kept` plan without the other account's code, and repeated kept plans between one
pair move the score once.

### WP5. Client hardening (G9, G10, G11)

Second layer only. None of it is a reason to relax a server rule.

- Session storage: keep the session encrypted, with the key in the device keystore
  (`expo-secure-store`) and the encrypted value in AsyncStorage, the pattern Supabase documents for
  React Native. SecureStore alone is too small for a session. `supabaseBackend.ts` must stay free
  of React Native imports; the storage is still handed in from `index.ts`.
- Code-sign over-the-air updates (EAS Update code signing). The private key lives only as a
  GitHub Actions secret; `OPERATIONS.md` says how to rotate it.
- A production build with no Supabase keys must fail at build time, and the mock backend must not
  run in a production binary. Preview and development keep the mock.
- Android release builds: enable code shrinking and obfuscation (R8) through
  `expo-build-properties`; check the option names for the Expo SDK in use. Do not ship source maps
  in the binary. Strip `console.*` in production.
- Block screenshots and screen recording on the reveal only (`expo-screen-capture`), and say in
  the docs that a second phone's camera defeats it.
- Validate every route parameter (`/invite/[id]`, `/plan/[id]`, `/profile/[id]`, `/report/[id]`)
  as a uuid before use, since deep links come from outside.

Deliberately **not** in this package: root or jailbreak detection and certificate pinning. Both
break for honest users more often than they stop an attacker, and neither protects anything the
server does not already protect. Revisit after WP6.

**Done when:** a preview build installs and signs in on a real phone, an unsigned update is
refused by that build, and the production profile fails without keys.

### WP6. App attestation (later; needs store accounts)

- Play Integrity on Android and App Attest on iOS, verified in an Edge Function, required once at
  account creation and again when a linked account signs in on a new phone. A failed check does
  not block the app outright at first: log it for a release, look at the false-positive rate, then
  enforce.
- Depends on the Play and Apple developer accounts in Phase 3. Do not start before they exist.

**Done when:** an account cannot be created by a script that is not the signed app, measured by
the attacker suite against a staging project.

### WP7. See satisfaction and stability (G12, G13, G14)

- After a kept promise, the plan screen asks each person once: "Worth showing up?" Yes or No, plus
  "I felt unsafe", which opens the existing report flow. Stored through `rate_date(p_invite,
  p_answer)` in a table no client role can read. The other person never sees the answer, and it
  never affects their Trust Score. The mock records it the same way.
- The analytics worker adds the 28-day satisfaction figure and the answer count to
  `analytics.metrics_daily`. `OPERATIONS.md` gets the query and the rule from section 1 (no
  percentage under 50 answers).
- Crash and error reporting (Sentry or the like; needs an account from the owner). Scrub it: no
  contact handles, no notes, no places, no tokens in any report. Add a test that the scrubber
  removes them.
- A moderation view for reports, replacing the SQL editor: the roadmap item. It must use a
  database role, never the service role key in a browser.
- Age: keep the 18+ declaration, add the age question to the store forms in Phase 3, and treat
  document or selfie age checks as a later decision for the owner; it needs a paid provider.

**Done when:** a kept plan in the local live test produces a rating row, the worker reports the
figure, and a forced crash in a preview build arrives in the crash tool with nothing private in it.

### WP7b. Photos that cannot carry a contact (G18; do this with Phase 4's photo upload)

The roadmap's Phase 4 adds real photos. A public photo is the widest possible channel for a
handle, a number or a QR code, so photo upload must not ship without this.

- **The public photo is taken in the app, not picked from the gallery.** A live camera capture
  cannot be a screenshot of a handle or an edited image, and it also cuts fake profiles. Extra
  photos stay hidden until a kept promise, as designed, so they need only the safety checks.
- **Every photo is checked on the server before anyone else can see it** (status `pending`, then
  `approved` or `held`; RLS returns only approved photos to other people). The checks, in an Edge
  Function: exactly one clear face; **no readable text at all** (text detection, not a search for
  handles, so codes and handwriting fail the same way); no QR code or barcode; the usual nudity
  and violence screen. Anything unsure is held for a person.
- **Metadata is stripped on the server** (location, device, time) and the image is re-encoded, so
  nothing rides along in the file itself.
- A photo change is limited to once per 7 days, and a held photo counts toward the same
  `shared_contact` penalties as text.
- The client check exists only to tell the person early; the server decides. The attacker suite
  uploads directly to storage and must not be able to make a photo visible.

**Done when:** an image containing a written handle, a phone number, a coded string or a QR code
is never returned to another account; a direct upload that skips the app stays `pending`; a photo
with location metadata comes back without it.

### WP8. Privacy and regulation, built once for every region (G16, G17)

Get a privacy lawyer before the first public launch; this package builds what they will ask for.
The rules named here are the main ones as I understand them; the lawyer confirms the current text
and adds what is missing.

**Built once, for everyone (use the strictest rule as the default):**

- **Country allow-list.** A `launch_countries` table. Sign-up is refused, with a plain message,
  outside it. The country comes from the store region and the phone or network country, checked
  on the server; it is a gate, not something shown to other people.
- **Consent, recorded.** At onboarding: 18+ confirmation, terms, privacy policy, each with a
  version and a timestamp in a `consents` table written by a function. Because dating preferences
  can reveal sexual orientation, ask for **explicit consent** to process that data, separate from
  the terms. A changed policy asks again. Push permission and any analytics beyond what the
  service needs are separate, optional choices, off until chosen.
- **Collect less.** No gender or orientation field unless the product needs it. No precise
  location stored: Discover works on city and area. Check-in codes (WP4) exist so that no location
  is collected at all.
- **Rights, in the app.** Export and deletion exist already. Add: correct my data (profile edit
  covers it), withdraw consent (which deletes the account), object to the Trust Score and ask a
  person to look at it, and a contact for privacy requests. Answer within 30 days.
- **Trust Score transparency.** It is automated profiling. The Me screen already explains the
  formula; add a "this looks wrong" route to a person, and keep the rule that it never uses
  ratings, reports or anything but the user's own kept and broken promises.
- **Retention limits**, enforced by a scheduled job: finished invites' `note` and `place` cleared
  after 90 days; `notifications` after 30 days; unlinked anonymous accounts with no activity
  after 30 days; inactive accounts warned at 12 months and deleted at 13; reports kept as long as
  the law requires and no longer. The lawyer sets the final numbers.
- **Where data lives.** Record the Supabase region, and list every company that touches personal
  data (Supabase, Expo push, Apple and Google push, the SMS and email senders, the crash tool) in
  `docs/data-map.md` with what each receives. Sign a data processing agreement with each.
  Cross-border transfer terms (standard contractual clauses) are needed when EU or UK users' data
  sits outside those regions; choosing an EU region for the production project avoids most of it.
- **Breach plan.** `OPERATIONS.md` gains a runbook: who decides, how users and regulators are
  told, and the clocks (72 hours to the regulator under GDPR; India's law also requires telling
  its Board and the affected people).
- **Safety duties.** Reporting, blocking and review within 24 hours (WP7) are the base. Add an
  in-app safety page (meet in public, tell a friend, how to report, local emergency number by
  country), terms that ban under-18s, harassment, scams and commercial use, and a record of every
  moderation action with its reason, which people can appeal.

**Per region, before that region joins the allow-list:**

| Region | Main rules to clear | What they add beyond the base |
| --- | --- | --- |
| India | Digital Personal Data Protection Act 2023 and its rules; IT Rules 2021 (intermediary duties); telecom rules for SMS | Notice and consent in plain language (and local languages on request); a grievance officer named in the app with response deadlines; breach notice to the Board; registered SMS sender and templates |
| EU and EEA | GDPR; ePrivacy; Digital Services Act | Explicit consent for special-category data; a data protection impact assessment before launch; an EU representative if there is no EU company; a point of contact, notice-and-action and yearly transparency reporting under the DSA (lighter for small companies) |
| UK | UK GDPR; Online Safety Act | A UK representative; an illegal-content risk assessment and a children's-access assessment for Ofcom; expect to need real age assurance, not a tick box |
| USA | State privacy laws (California first); state online-dating safety laws; FTC rules on unfair practices; rules on automated texts | "Do not sell or share" position stated (the app does neither); safety notices that several states require dating services to show, including whether background checks are done; consent wording for SMS codes |
| Canada | PIPEDA and Quebec's Law 25 | Meaningful consent; French in Quebec; a named privacy officer |
| Brazil | LGPD | A named data protection officer; Portuguese; sensitive-data consent |
| Australia | Privacy Act; Online Safety Act and the online dating industry code | Reporting and complaint handling to the code's standard; cooperation with the eSafety Commissioner |
| Elsewhere | Local law | Not on the allow-list until checked. Do not launch where dating apps or same-sex dating are illegal or dangerous for users; where data must be stored in-country (for example China and Russia), a separate deployment would be needed, so leave them out |

**Stores, worldwide:** Apple and Google both require an 18+ rating for dating apps, in-app account
deletion (built), reporting and blocking of user content (built), a privacy policy link, and
accurate data-safety forms. Screenshots and the listing must match what the app does.

**Done when:** sign-up outside the allow-list is refused on the server (attacker check); a consent
row exists for every account in the tests; the retention job is covered by a database test;
`docs/data-map.md` and the breach runbook exist; and for the first launch region the lawyer's
sign-off is recorded in `docs/` with its date.

### WP9. Make it read as local anywhere (G15)

- All user-facing text moves into a strings file per language (start with English; the structure
  must allow right-to-left languages). Dates, times and numbers use the phone's locale; plan times
  are stored in UTC, as now, and shown in the viewer's time zone, with the zone named when the two
  people's zones differ on a video or game plan.
- `city` loses its `Mumbai` default: onboarding asks for country and city. Discover's "same city"
  rule (WP3) uses them. Distance shows in km or miles by locale.
- Phone entry takes a country picker and stays E.164; the `+91` placeholder goes.
- Contact kinds become a catalogue by region (add Telegram, LINE, KakaoTalk, WeChat and others as
  regions join), in SQL and in `src/domain/types.ts` together.
- Ideas and openers gain an optional region list, so that local ones (momo stop, pani puri
  face-off, cutting chai) show where they make sense and every region has at least 20. Tags and ask
  lines are reviewed per language by a native speaker: flirty lines do not translate word for
  word, and what is playful in one place is offensive in another.
- Emergency numbers and the safety page (WP8) are per country.

**Done when:** the app runs fully in a second language in the app tests, a user in a second time
zone sees correct plan times in the live test, and no screen contains a hard-coded country.

## 4. Order and dependencies

```
WP0 ──> WP0b ──> WP1 ──> WP2 ──> WP3
                   │       └────> WP4
                   └────────────> WP7 (rating part can start after WP0)
WP5 can run alongside WP1 to WP4.   WP6 waits for the store accounts.
WP8 starts after WP0 and must finish before any public launch.   WP9 before the second country.
```

- WP0b comes before the feature packages on purpose: each of them adds server rules and error
  cases, and they should be born with codes and trace ids rather than have them added later.
- WP4 depends on WP1: the code proves presence only once contacts cannot leak early.
- WP7b ships with Phase 4's photo upload, never after it.
- WP3 depends on WP2: Discover's "linked accounts only" rule needs the link gate.
- WP8's country gate and consent screen ship before strangers are invited, even in one country.
  The lawyer's work runs in parallel with WP1 to WP5; start it first, it has the longest wait.
- PR #10 (tags, tones, new ideas, spark card) should merge first. WP1 turns its tag list into the
  server catalogue, and the spark card must keep working on WP3's paged Discover.

## 5. What only the owner can decide or provide

| Needed | For | Recommendation |
| --- | --- | --- |
| Decision: require a linked email or phone before sending or answering an ask | WP2 | Yes. It is the cheapest strong defence against spam and scraping, and email codes are free to send |
| Decision: check in by exchanging 4-digit codes | WP4 | Yes. It proves presence without collecting location |
| Captcha account (Turnstile or hCaptcha) | WP2 | Either; both have free tiers |
| Crash reporting account | WP7 | Sentry's free tier is enough to start |
| Play and Apple developer accounts | WP6, Phase 3 | Already on the roadmap |
| A privacy lawyer, and a first launch country | WP8 | Start with one country (India, where the app is already aimed), then add regions one at a time |
| Decision: production database region | WP8 | An EU region, if EU or UK launch is planned within a year; moving later is costly |
| Named people: privacy contact, grievance officer (India), representatives (EU, UK) | WP8 | Can be the owner at first, or a paid service for the representatives |
| Translators who are native speakers | WP9 | Per language, at the time that region joins |
| Decision: the ask line becomes pick-only, with no typing | WP1 | Yes. It closes the easiest channel completely, and the six tones already give 30 and more lines; add more lines rather than a text box |
| Decision and account: a language model to review profile lines, and an image check for photos | WP1, WP7b | Yes, with a small fast model. The provider goes in the data map and the privacy policy (WP8) |
| A maps provider for place search | WP1 | Needed once places stop being free text |
| A mail sender (`SMTP_*`) | WP2's link gate | Already on the Phase 3 checklist; WP2 cannot ship without it |

## 6. Rules for whoever builds this

- `CLAUDE.md` applies in full: new migrations only, both copies of every duplicated rule changed
  together, mock parity, deploys only from `main` through GitHub Actions, docs updated in the same
  change.
- Never make a check pass by weakening it. If an attacker check cannot be made green, stop and say
  why.
- Every new server rule gets three things in the same pull request: the SQL, the mirror in
  `src/domain/` and the mock, and a check in the attacker suite.
- Error messages to a hostile client say nothing about another person: not that they exist, not
  that they blocked someone, not why a limit was hit beyond the limit itself.
- Nothing in this plan may send, cache or log a contact handle, a check-in code or a rating
  outside the function that owns it.
- Where this plan names an Expo, Supabase or store feature, read that product's current
  documentation before building on it; option names change between versions.
- Stop and ask the owner when a package needs an account or a decision from section 5, or when a
  change would alter what a person sees about another person in a way this plan does not describe.

## 7. What remains true after all of it

These are the limits no build removes; they belong in the privacy policy and in honest answers:

- Two real people who want to cheat together can: they can swap codes face to face and never have
  the date. That costs them nothing the product was protecting.
- After a kept promise, a contact is theirs to keep, screenshot or share. The reveal is a one-way
  door by design.
- Contact smuggling is made slow and costly, not impossible. After WP1 and WP7b the only free
  content a stranger sees is one reviewed line a week and a text-free photo of a face. Someone
  can still, for example, hold up fingers in a photo or agree a code during a video date. The
  first carries almost nothing and the second happens on the date itself, which is the point of
  the app. Reports, review and the penalties cover what is left.
- The app can be decompiled. After this plan, what the reader finds is a public key, a list of
  date ideas and a client for an API that refuses everything the product forbids.
- "Global" is a list of countries that grows, not a switch. Laws change; each region's sign-off
  has a date and needs revisiting, at least yearly.
- The 96% figure depends on the people and the dates, not only on the build. The plan makes it
  visible, removes the known causes of bad experiences (spam, fakes, no-shows that look kept,
  crashes), and leaves the rest to be learned from real answers.

## 8. Product features from the market review

Added on 2026-11-17 after a review of 15 dating apps. The owner chose the large items first
(`docs/decisions.md`, D028). These sit beside the hardening packages; each still follows section 6.

### F1. Suggested venues: built

A catalogue of well-known public places. An in-person ask picks one, and the server writes the
place; typing "somewhere else" still works and is still checked for contacts. This is the first
half of WP1's "place is picked, not typed": it removes typing for most asks without a maps
provider. **Left:** a local's review of the list; lists for other cities (a city with none falls
back to typing); partner venues; and dropping the typed fallback once coverage allows, which is
what closes that channel completely.

### F2. Selfie verification: not started, blocked

A verified badge from a live selfie matched against the profile photo. **Blocked on:** real
photos, which do not exist yet (Phase 4, with WP7b's in-app camera and server checks), and a
liveness provider (O11). Build it as part of WP7b, not before: the same camera step can do both.
Privacy: a face scan is biometric data, so it needs explicit consent, must not be kept after the
check, and must be named in the data map (WP8).

### F3. Double micro-date: designed, build after WP4

Two friends ask two friends: four people, one plan. What it changes:

- An invite gains a second person on each side. Each of the four puts a pinky out; it locks when
  all four have. Any one declining ends it for all, with no flake.
- Check-in: each person exchanges codes with someone from the other pair (WP4's codes), so the
  rule "you met" still holds. This is why it comes after WP4.
- A flake is on the person who did not show, never on their friend. The plan is `kept` for those
  who checked in if at least one from each side did.
- The reveal opens pair by pair, only between two people who both checked in, and only across the
  two sides; friends already know each other.
- Blocks: if anyone on the plan has blocked anyone else on it, the plan cannot be made, and the
  refusal says nothing about who.
- Both copies of the state machine, the push rules, the mock and every database test of the
  invite change. Estimate it as the largest single package in this plan.

### F4. Refundable stake: not started, blocked

Each person puts down a small amount to lock a plan; showing up returns it, a no-show forfeits
it. **Blocked on:** a payments account and a legal view (O12): holding and returning money is
regulated differently by country (in India, by the payment rules that apply to holding customer
funds), and both app stores have rules on what must go through their own payment systems. Design
notes for when it unblocks: the stake is optional per plan and both must agree to it; a forfeited
stake never goes to the other person (that would pay people to be stood up, and invite fraud); a
plan `ended` by a block or deletion always refunds; and the Trust Score never depends on money.

### Also from the review, not large

Share my date with a trusted contact plus a safety check-in; "when I'm free" windows; an
"usually answers in" badge (the worker already computes the figure); "round two" after a kept
date; friend vouches. Recommended order when the owner wants them: share my date first.

