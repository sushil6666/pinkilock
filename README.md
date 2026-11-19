# Pinkilock

A one-on-one pre-dating app built on a pinky promise. No swiping deck, no chat: you ask one person
to one tiny plan with a time on it, you both lock pinkies, you both show up. Android and iOS from
one Expo codebase.

- `ARCHITECTURE.md`: how the app, Supabase and the DuckDB worker fit together
- `DESIGN_SYSTEM.md`: colours, type, components and the exact spec of the lock gesture
- `OPERATIONS.md`: running it live: secrets, workflows, shipping changes, health checks, fixes
- `ROADMAP.md`: the phases, what each must prove, and what is next
- `docs/phase-2-checklist.md`: the steps left to finish Phase 2 (accounts and real phones)
- `docs/phase-3-checklist.md`: what Phase 3 needs from you (SMS provider, production project, phones)
- `CLAUDE.md`: the project rules, for Claude Code sessions

## Run it on your phone (mock data, no accounts needed)

Needs Node 18.18 or newer with npm 10 or newer (npm 9 cannot install the patched copy in
`vendor/`; `npm install -g npm@10` fixes that), and the Expo Go app (SDK 52) on the phone.

```bash
npm install
npx expo start          # scan the QR code with Expo Go (Android) or the Camera app (iOS)
```

On WSL, the phone cannot reach the laptop's dev server directly: use `npx expo start --tunnel`.
Push notifications do not work in Expo Go; they need a preview or development build (below).

With no keys set, the app runs on ten made-up people who answer by themselves. A good first pass:

1. Onboard (five short steps, ends with a hold to swear the promise). The vibe step offers tags
   in five groups (Energy, Into, Wild and bold, Flirt style, Old school); pick up to three.
   The plan step lists every option with a one-line summary (the arrow opens what, where, cost and
   why); options local to your city come first, marked "Local to <city>".
2. **Asks**: open Aanya's boba run, tap **Lock it**, slide your pinky in. She seals it about two
   seconds later.
3. **Plans**: the plan with Ira starts in four minutes, so check-in is already open. Check in by
   typing Ira's code (the mock shows it, as if she read it out); Ira follows, and the reveal opens.
4. **Discover**: a card with something in common shows a spark (shared tags, shared ideas,
   opposites that attract). Send someone a vibe check. The one line has ready-made options in six tones
   (Chill, Bold, Flirty, Wild, Naughty, Old school). They answer in about seven seconds; then you seal.
   Nikhil always passes, so you can see that too.
   For an in-person plan, pick where to meet from the suggested public places (nearest to them first),
   or **Somewhere else** to type one.
5. On any locked plan: a first line and an optional dare (tap **Another** for a new one).
   **Can't make it** shows what a bail costs. **Me** has the reset, and **Change tags**.
6. Safety and accounts: on anyone's profile, **Block or report**. In **Me**, Account: add a phone
   number (the mock's code is always `123456`), see blocked people, download your data, or delete
   the account. After **Sign out**, "I already have an account" on the first screen gets you back.
7. **Me** also has Safety (emergency numbers for your country), Ask us (your data, your score, an appeal),
   and the draft Terms and Privacy policy you agreed to on the last onboarding step.
8. When something fails, the message has a reference under it (`PL033 · 7F3K2M9Q`). **Me**, Help,
   **Share diagnostics** collects recent ones with the build, and nothing private.
9. **Doubles**: in **Me**, My duo, tap **Make a duo with a friend**; Rhea joins a few seconds later.
   Cards marked "Has a duo" (Zoya, Aanya, Arjun and their friends) can then be asked out on a double:
   in the ask, pick **Double, with Rhea**. The other three put a pinky out together; you seal it. On the
   plan, check in with the code from either person on the other side, and the reveal opens for each.

## Run the backend locally (Docker)

```bash
npm run db:start                  # Supabase on your machine: Postgres, Auth, Realtime, Edge Functions
npx supabase status               # prints the local API URL and anon key
```

Put that URL and key in `.env` (copy `.env.example`) and `npx expo start` talks to the local
stack. `npm run db:reset` rebuilds the database from `supabase/migrations`, which is the only
place the schema lives. To change the schema, add a migration (`npx supabase migration new name`);
never edit one that has been applied.

## Go live

Everything is applied by GitHub Actions. Nothing is clicked in the Supabase dashboard.

**1. Create a Supabase project and an Expo account**, then add these in the GitHub repository
under Settings, Secrets and variables, Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `SUPABASE_ACCESS_TOKEN` | A personal access token from supabase.com/dashboard/account/tokens |
| Secret | `SUPABASE_DB_PASSWORD` | The project's database password |
| Secret | `ANALYTICS_DB_PASSWORD` | A new password you make up, for the analytics worker's role |
| Secret | `EXPO_TOKEN` | expo.dev, Account settings, Access tokens |
| Secret | `EXPO_ACCESS_TOKEN` | Optional: only needed when "enhanced push security" is on for the Expo account; can be the same token as `EXPO_TOKEN` |
| Secret | `GOOGLE_SERVICES_JSON` | The contents of Firebase's `google-services.json` (Android push; see below) |
| Variable | `SUPABASE_PROJECT_REF` | The project ref (the id in the project URL) |
| Variable | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Project Settings, API: the anon / publishable key |
| Variable | `SUPABASE_POOLER_HOST` | Printed by the first deploy run, e.g. `aws-1-ap-south-1.pooler.supabase.com` |
| Secret | `TWILIO_VERIFY_ACCOUNT_SID`, `TWILIO_VERIFY_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Optional: phone sign-in (step 5). Until all three exist, phone sign-in stays off |
| Secret | `SMTP_PASSWORD` | Optional: email sign-in (step 5). Your mail sender's SMTP password or API key |
| Variable | `SMTP_HOST`, `SMTP_USER`, `SMTP_SENDER_EMAIL`, optional `SMTP_PORT` (default 465) | Optional: email sign-in. Until all four exist, email sign-in stays off |

The service role key is not needed anywhere and must not be added.

For a production project later, the same values with a `PROD_` prefix (step 6).

**2. Deploy the backend.** Run the **Supabase deploy** workflow (it also runs on every push to
`main` that touches `supabase/`). It turns on anonymous sign-ins, applies the migrations (schema,
RLS, the every-minute `sweep_invites` schedule, push), deploys the `push`, `review-line`, `contact-verify`, `photo` and `auth-code` Edge Functions (the last stays off until Meta is set up, see OPERATIONS.md), connects
Postgres to it with a fresh shared secret, sets the analytics role's password, and finishes by
running the live two-user test against the project.

**3. Build the app.** Run **EAS init** once and commit the project id it prints into `app.json`
(`expo.extra.eas.projectId`). Then run **EAS build** with the `preview` profile: it produces an
installable Android APK pointed at the project above, and puts the install link in the run summary.

| Profile | What it is | Backend |
| --- | --- | --- |
| `development` | Dev client; loads JavaScript from your laptop | Your own `.env` |
| `preview` | Installable APK for testers | `SUPABASE_PROJECT_REF` |
| `production` | Store bundle | `PROD_SUPABASE_PROJECT_REF` and `PROD_EXPO_PUBLIC_SUPABASE_ANON_KEY`; refuses to build until both exist |

**4. Android push needs Firebase** (iOS push needs an Apple developer account and is set up by
EAS when you first build for iOS). In the Firebase console create a project, add an Android app
with package `com.pinkilock.app`, and download `google-services.json`: its contents go in the
`GOOGLE_SERVICES_JSON` secret. Then, in Firebase, Project settings, Service accounts, generate a
private key and upload it on expo.dev under the project's Credentials, Android, FCM V1 service
account key. Without these the app builds and runs, and the Me tab shows that push is off.

**5. Sign-in codes: email (free) and phone (Twilio Verify).** People keep their account by adding
an email or a phone number; the app offers email first because it costs nothing to send.

*Email.* Supabase's built-in mailer only reaches the project's own team, a few emails an hour, so
the deploy leaves email sign-in off until you give it a sender. Resend's free tier (3,000 emails a
month) is plenty to start: verify a domain there, then set `SMTP_HOST` = `smtp.resend.com`,
`SMTP_USER` = `resend`, `SMTP_SENDER_EMAIL` = an address on that domain (variables) and
`SMTP_PASSWORD` = a Resend API key (secret), and run **Supabase deploy**. It switches email on and
installs the code-only templates in `supabase/templates`. Any SMTP sender works the same way.
Supabase caps a project at 30 emails an hour by default once your own sender is set; raise it in
the dashboard's Auth rate limits if sign-ins are refused for that.

*Phone.* In Twilio, create a Verify service, then add its Account
SID, Auth Token and Service SID as the three `TWILIO_VERIFY_*` secrets and run **Supabase deploy**:
it switches the project's phone provider on. Twilio Verify sends codes from its own pre-registered
templates, which is what Indian DLT rules require for OTP texts, so there is no sender ID or
template to register yourself.

**6. Production (when you are ready).** Create a second Supabase project, then add
`PROD_SUPABASE_PROJECT_REF`, `PROD_EXPO_PUBLIC_SUPABASE_ANON_KEY` (variables) and
`PROD_SUPABASE_DB_PASSWORD`, optionally `PROD_ANALYTICS_DB_PASSWORD` (secrets). Run **Supabase
deploy** with target `production` (only ever by hand; it refuses to run until those exist), set
`PROD_SUPABASE_POOLER_HOST` from its summary, then **EAS build** with profile `production`. In
Settings, Environments, `production`, you can require your own approval before each production
deploy.

The **Me** tab shows which backend is in use and whether push is on for this phone. A live
project starts empty: people appear in Discover as they onboard, so try it with two phones.

## Push notifications

Sent only by the server: a database trigger queues them, an Edge Function delivers them through
Expo. The app registers its device token and nothing else. You get one for a new ask, the other
person's pinky, the lock, check-in opening, and a bail or a no-show. See `ARCHITECTURE.md`
section 6.

## Analytics worker (DuckDB)

In the cloud it runs every 6 hours as the **Analytics worker** workflow, with the restricted
`pinkilock_analytics` role. If a run fails, an issue labelled `analytics-worker` is opened and
GitHub emails you; the next good run closes it. Trust badges in live mode read what it writes.

By hand:

```bash
pip install -r analytics/requirements.txt
export PINKILOCK_PG_DSN="postgresql://pinkilock_analytics.<ref>:<password>@<pooler host>:5432/postgres?sslmode=require"
python analytics/duckdb_pipeline.py --dry-run     # compute and print only
python analytics/duckdb_pipeline.py               # write trust_scores and analytics.* back
```

## Checks

```bash
npm run typecheck
npm run test:unit           # error catalogue matches the SQL, logger keeps no content, no silent failures
pip install pgserver duckdb && python tests/db/run.py   # migrations, RLS, functions, push outbox, pipeline, attacker suite (Python 3.12)
npm run test:live:local     # two users, then block, report, export, phone and delete, then the attacker suite, against `supabase start`
npm run audit:check         # no new high or critical advisory in what ships (security/audit-baseline.json)
npm run test:push:local     # the push chain with a stand-in for Expo (setup: top of tests/live/local_push.sh)
npm run test:app:local      # the real screens in two browser sessions, phone and desktop width, both ways round (npx playwright install chromium)
npm run test:live           # the same live tests against EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
```

CI runs all but the last on every pull request and every push to `main`. The last runs against the real project after each deploy,
and on demand as the **Live two-user test** workflow.

## The web build

The same screens run in a browser; there is no second site.

```bash
EXPO_PUBLIC_BACKEND= npx expo export -p web --output-dir dist/web   # mock data, no keys
npx serve dist/web --single                                         # any server that answers every path with index.html
# then open /?lang=en-XA (every word accented and a third longer) or /?lang=ar-XB (right to left)
node scripts/make-icons.mjs                                         # redraw the icons and the share picture
node scripts/make-loops.mjs                                         # redraw the clay animations (needs ffmpeg)
```

It is one page, so whatever serves it must fall back to `index.html` for every path (a reload on
`/plans` must work). Each screen has its own page title, a visitor with no profile is led to
onboarding from any link, and an unknown address shows a not-found screen. It is the website:
**Web deploy** publishes it from `main` to Cloudflare Pages at pinkilock.com (`OPERATIONS.md`,
"The website"). `node scripts/check-web-bundle.mjs dist/web` checks a build for anything secret.

## Status

**Verified locally** (a full Supabase stack in Docker, and in CI): the migrations
apply cleanly and pg_cron runs the sweep; two separately signed-in users go through onboard, ask,
both pinkies, lock, check-in, reveal, bail and expiry using the app's own backend code; each
hears the other over Realtime; the reveal returns nothing before a kept invite; the same flow
works through the real screens in two browser sessions; a push travels from trigger to outbox to
Edge Function to a stand-in for Expo with nothing private in it; the analytics worker runs as its
restricted role.

**Verified against the real project** (Supabase `rwdqzjwocdlbppotadec`, 2026-11-16): the deploy
workflow applied all four migrations, turned on anonymous sign-ins, deployed the `push` function
and connected Postgres to it; the live two-user test then passed 6 of 6 there, including expiry
by the real pg_cron sweep and Realtime delivery both ways. An Android preview APK pointed at this
project was built on EAS and is installable.

**Phase 3, verified locally and in CI only** (on the `claude/project-thread-cm3xba` branch until it
merges): blocking hides two people from each other, every invite between them and the reveal,
through RLS, and ends live plans with no flake; reports are stored where no client can read them
and block too; data export; account deletion removes the person and keeps the log anonymised;
an email address or a phone number links to the anonymous user with the same id and history, and
signs back in on a new phone (email codes read back from the local stack's Mailpit; phone with its
test numbers). Through the real screens: block from a profile,
download data and delete the account from Me. None of it has run against the real project yet:
it deploys there when the branch merges; email sign-in needs a mail sender and phone sign-in the
Twilio secrets.

**Not verified:** a real push delivery (needs Firebase for Android, see Go live step 4), the
analytics worker's first cloud run (needs `ANALYTICS_DB_PASSWORD` and `SUPABASE_POOLER_HOST`), and
anything on a physical phone. That means a push actually arriving (the last
hop, Expo to APNs or FCM to the device), tapping one to open the right screen, the permission
prompt, haptics, safe areas, and 60fps on the lock gesture. iOS builds have not been attempted.

The icon and splash are placeholders drawn from the lock mark. The video room named in video
plans is not built.
