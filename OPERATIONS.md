# Pinkilock operations

How to run Pinkilock in the cloud: where everything lives, how changes ship, how to tell that
it is healthy, and what to do when something breaks. `README.md` covers first-time setup and
`ARCHITECTURE.md` explains the design. This file is for working on the system once it is live.

## 1. The system at a glance

| Part | Where it runs | Changed by |
| --- | --- | --- |
| Database: schema, RLS, promise functions | Supabase project (`SUPABASE_PROJECT_REF`) | `supabase/migrations`, via **Supabase deploy** |
| The clock: `sweep_invites` every minute | `pg_cron` job `pinkilock-sweep` in that project | Migration `..._sweep_cron.sql` |
| Push: outbox, trigger, sender | `notifications` table and the `push` Edge Function | `..._push.sql`, `supabase/functions/push`, via **Supabase deploy** |
| Trust scores, funnel, retention | **Analytics worker** workflow, every 6 hours | `analytics/duckdb_pipeline.py` |
| The app | EAS builds (project `pinkilock/pinkilock`, package `com.pinkilock.app`) | **EAS build** workflow |
| Checks | **CI** on every PR and every push to `main` | `tests/` |

**The golden rule:** everything reaches the cloud through GitHub Actions from `main`. Nothing is
changed by hand in the Supabase dashboard, and nothing is deployed from a branch.

## 2. Environments

| Environment | Backend | App build | Status |
| --- | --- | --- | --- |
| Local | Mock (no keys) or `npm run db:start` (Docker) | Expo Go or a development build | In use |
| Staging | Supabase `SUPABASE_PROJECT_REF` (deploy target `preview`) | EAS `preview` APK | Live since 2026-11-16 |
| Production | Supabase `PROD_SUPABASE_PROJECT_REF` (deploy target `production`) | EAS `production` | Prepared, not created yet (Phase 3) |

The `production` EAS profile refuses to build until both `PROD_*` variables exist, or if they
point at staging, so a store build can never quietly point at staging. **Supabase deploy**
targets staging on every push to `main`; it deploys production only when run by hand with target
`production`, in the `production` GitHub environment, and refuses until `PROD_SUPABASE_PROJECT_REF`
and `PROD_SUPABASE_DB_PASSWORD` exist. Production values never fall back to staging ones.

## 3. Secrets and variables

All of these live in GitHub, under Settings, Secrets and variables, Actions. None is in the repo.

| Kind | Name | Used by | How to rotate |
| --- | --- | --- | --- |
| Secret | `SUPABASE_ACCESS_TOKEN` | Deploy, live test | Make a new token at supabase.com/dashboard/account/tokens, update the secret, revoke the old one |
| Secret | `SUPABASE_DB_PASSWORD` | Deploy, live test | Reset it in the Supabase dashboard (Project settings, Database), then update the secret |
| Secret | `ANALYTICS_DB_PASSWORD` | Analytics worker; deploy sets it on the role | Update the secret, then run **Supabase deploy** by hand |
| Secret | `EXPO_TOKEN` | EAS init, EAS build | Make a new one on expo.dev (Access tokens), update, revoke the old one |
| Secret | `EXPO_ACCESS_TOKEN` | Deploy passes it to the `push` function | Same as `EXPO_TOKEN`, then run **Supabase deploy** |
| Secret | `GOOGLE_SERVICES_JSON` | EAS build (Android push) | Replace the contents, then rebuild the app |
| Variable | `SUPABASE_PROJECT_REF` | Everything that talks to the project | Not a secret |
| Variable | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Live test, EAS build | Public by design, but rotating it needs a new app build |
| Variable | `SUPABASE_POOLER_HOST` | Analytics worker | Printed in the summary of every **Supabase deploy** run |
| Secret | `TWILIO_VERIFY_ACCOUNT_SID`, `TWILIO_VERIFY_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` | Deploy turns on phone sign-in with them (both projects) | Make a new auth token in Twilio, update the secret, run **Supabase deploy** |
| Secret | `SMTP_PASSWORD` | Deploy gives it to Auth as the mail sender's password (email sign-in codes) | Make a new API key at the sender (e.g. Resend), update the secret, run **Supabase deploy**, revoke the old key |
| Variable | `SMTP_HOST`, `SMTP_USER`, `SMTP_SENDER_EMAIL`, `SMTP_PORT` | Deploy: email sign-in is on only when the first three and `SMTP_PASSWORD` exist | Not secrets. Set them as `production` environment variables to give production its own sender |
| Variable | `PROD_SUPABASE_PROJECT_REF`, `PROD_EXPO_PUBLIC_SUPABASE_ANON_KEY` | Deploy (target `production`), EAS `production`, analytics | Empty until there is a production project |
| Secret | `PROD_SUPABASE_DB_PASSWORD`, `PROD_ANALYTICS_DB_PASSWORD` | Same as their staging twins, for production | As for staging |
| Variable | `PROD_SUPABASE_POOLER_HOST` | Analytics worker (production) | Printed by a production deploy run |
| Secret | `CLOUDFLARE_API_TOKEN` | Web deploy publishes the website with it | A custom token scoped to the account, Cloudflare Pages: Edit and nothing else. Make a new one in the Cloudflare dashboard (My Profile, API Tokens), update the secret, delete the old one |
| Variable | `CLOUDFLARE_ACCOUNT_ID` | Web deploy | Not a secret |
| Secret | `PROD_SUPABASE_ACCESS_TOKEN` | Optional: only if production is in another Supabase account | As for `SUPABASE_ACCESS_TOKEN` |
| Variable, secret | `PROD_TURNSTILE_SITE_KEY`, `PROD_TURNSTILE_SECRET` | Captcha on production sign-in (D091): the site key goes into production builds, the secret to Auth and the `auth-code` function; on only when both exist | Rotate the secret in Cloudflare (Turnstile, the widget, Settings), update `PROD_TURNSTILE_SECRET`, run **Supabase deploy** (production) |
| Secret | `META_APP_SECRET`, `META_VERIFY_TOKEN` | Deploy gives them to the `contact-verify` function; contact proofs are off until both exist (D078) | Reset the app secret in Meta's App Dashboard (App settings, Basic), update the secret, run **Supabase deploy**. The verify token is any string you choose; change it in Meta's webhook settings at the same time |
| Secret | `WHATSAPP_TOKEN`, `INSTAGRAM_TOKEN` | `contact-verify`: answers on WhatsApp; looks up who sent an Instagram message and answers | Make a new system-user token (WhatsApp) or long-lived token (Instagram) in Meta, update, run **Supabase deploy** |
| Variable | `PINKILOCK_WHATSAPP_NUMBER`, `PINKILOCK_INSTAGRAM` | Deploy: where the app tells people to send their code (digits with 91; the account's username) | Not secrets. Empty leaves that app's proofs off |

Kept outside GitHub, and managed by the deploy:

- **The push shared secret.** It sits in Supabase Vault (`push_function_secret`) and in the
  function secret `PUSH_HOOK_SECRET`. Every **Supabase deploy** run generates a new one, so
  rerunning the deploy rotates it.
- **The service role key.** Supabase gives it to the Edge Function. The app, the repo and the
  workflows never use it. Never add it as a GitHub secret.
- **The Firebase service-account key.** It is uploaded on expo.dev (Credentials, Android, FCM V1),
  not stored in GitHub.

## 4. Workflows

| Workflow | Runs when | What it does |
| --- | --- | --- |
| **CI** | Every PR and every push to `main`, unless only Markdown changed | Typecheck; a secret scan over the whole history and a dependency audit; `tests/db` (the attacker suite included); and the live (two users, then block, report, export, phone, delete, then the attacker suite), push and two-browser tests on a local Supabase stack. Uses no project keys |
| **Supabase deploy** | A push to `main` that touches `supabase/` or the workflow (target `preview`); or by hand, choosing `preview` or `production` | Sets the auth settings below and prints them back, applies migrations, reports what Supabase's security advisor says, sets the analytics password, prints the pooler host, deploys `push`, rotates the push secret, turns on Twilio Verify if its secrets exist, then (staging only) runs the live tests |
| **Live two-user test** | After each staging deploy; or by hand | Two anonymous users go through the whole flow, then three more through block, report, export and delete, on staging; all are deleted after. Never run on production |
| **Analytics worker** | Every 6 hours; or by hand | Recomputes trust scores and metrics, once per project that is set up. If a run fails it opens an `analytics-worker` issue (`analytics-worker-production` for production), and the next good run closes it |
| **EAS build** | By hand (pick a profile and platform) | Copies the backend values into the EAS environment, builds, and puts the install link in the run summary |
| **Web deploy** | A push to `main` that can change the website (not Markdown, docs, `supabase/` or tests); or by hand | Builds the web app against the production project (the preview project, with a warning, until production exists), adds the security headers and the share tags, refuses to publish if anything secret is in the bundle, publishes to Cloudflare Pages (project `pinkilock`) and checks pinkilock.com |
| **EAS init** | Once, by hand | Created the EAS project (id is already in `app.json`) |

GitHub can pause scheduled workflows in a repo with no activity for 60 days. If trust scores
stop moving, check that **Analytics worker** is still enabled.

### Auth settings

The deploy workflow sets these on the hosted project on every run and prints what is in force in
the run summary, so the dashboard is never the only record. Change them in the workflow (and the
local copy in `supabase/config.toml`), never in the dashboard.

| Setting | Value | Why |
| --- | --- | --- |
| Anonymous sign-ins | on | The app starts anonymous, so RLS works from the first screen |
| Anonymous sign-ins per hour, per address | 30 (300 locally, where every test person shares one address) | The cost of making accounts in bulk |
| Code requests and code checks per 5 minutes, per address | 30 each | Guessing or spamming sign-in codes |
| Session refreshes per 5 minutes, per address | 150 | Supabase's default, pinned |
| Access token life | 1 hour | A stolen token stops working within the hour |
| Refresh token rotation | on, 10 second reuse window | A copied refresh token is noticed when both copies are used |
| Email code life | 10 minutes | A code read later from a mailbox is useless |

Captcha on anonymous sign-in and on code requests is set by its own step, on production only and
only once Turnstile is set up: see "Captcha" below.

### Captcha

Auth's captcha (Cloudflare Turnstile) stops a script from asking Auth directly whether an email or
number has an account (gap G22, D091); the app's own path never tells. It is on only for
production, and only when both of these exist:

- the variable `PROD_TURNSTILE_SITE_KEY` (public: it goes into the production app and website builds);
- the secret `PROD_TURNSTILE_SECRET` (the deploy gives it to Auth and to the `auth-code` function).

Set up: in Cloudflare, Turnstile, add a widget (mode Managed) for `pinkilock.com`, the hostname the
phone's check page claims (`EXPO_PUBLIC_TURNSTILE_PAGE`). Then, in this order:

1. Add `PROD_TURNSTILE_SITE_KEY`, run **EAS build** (production) and ship that build. Builds from
   before this change have no check and could not sign in once captcha is on.
2. Wait until nearly everyone is on that build (the store consoles show versions).
3. Add `PROD_TURNSTILE_SECRET` and run **Supabase deploy** (production), then **Web deploy**.
   The run summary says "Captcha on sign-in: on (Turnstile)".

To turn it off, delete the secret and run **Supabase deploy** (production). Preview never has it, so
the live test can sign people up there. If people report "The quick check did not finish", look at
Turnstile's analytics in Cloudflare; "Update Pinkilock to sign in" means an old build met captcha.

### Limits and the link gate

Set in SQL (`20261117000011_limits_and_gate.sql`), mirrored in `src/domain/invites.ts` and the mock:
10 asks a day; one ask to the same person per 7 days after they passed or let it expire; 200 passes
a day; 20 profile saves a day; 1 kB of props on an `app_open` event. A refusal carries its code
(`PL025` to `PL028`, `PL041`).

The **link gate** (`private.config`, key `require_linked`): when on, sending an ask and putting a
pinky out need an email or phone linked to the account (`PL068`; the app shows an "Add your email"
button). Passing on an ask never needs it. The deploy workflow turns it on when a mail sender
(`SMTP_*`) or Twilio Verify is configured, and off otherwise, and says which in the run summary. To
flip it by hand: `scripts/gate-config.sh "<db url>" on|off`. Locally it is off, so the live tests'
anonymous people can play; `tests/db/limits.sql` covers it on and off.

### Signed updates

Builds refuse an over-the-air update that was not signed, once a certificate exists:

1. Run `scripts/codesign-setup.sh` once. It writes `code-signing/certificate.pem` (commit it) and a
   private key outside the repo.
2. Put the private key in the GitHub secret `EXPO_UPDATES_PRIVATE_KEY`, then delete the file.
3. Build new binaries (EAS build). From then on, publish updates with
   `eas update --private-key-path <file holding the secret>`; an unsigned one is ignored by the app.

To rotate: make a new pair, ship a build with the new certificate, and only then stop signing with
the old key. Until step 1 is done, updates are not signed (`app.config.js` adds signing only when
the certificate is present).

### The app on the phone

Version 0.4.0 adds in-app voice calls (D111, and Talk mode, D108): `@livekit/react-native` with its
WebRTC module and Expo plugin, the microphone permission (`RECORD_AUDIO`; on iOS the microphone line
and background audio so a call keeps going with the screen off), and `expo-store-review`. A new
binary: no over-the-air update reaches 0.3.x builds, and a 0.3.x build says calls need the new
version. The camera is never used for a call; the voice token cannot publish video at all.
Note: `expo-image-picker`'s `cameraPermission: false` blocks `android.permission.CAMERA` for the whole
app (it shows as `tools:node="remove"` in `npx expo config --type introspect`), which also takes it
from `expo-camera`'s face photo on Android. This predates D111 and is not changed here.

Version 0.3.0 is the Expo SDK 58 upgrade (React Native 0.88, D094): a new binary, and no
over-the-air update reaches 0.2.0 builds, whose native side is SDK 52. Android draws the app edge to
edge; the `expo-navigation-bar` plugin in `app.json` keeps the bar's buttons light with no scrim.
EAS builds on Node 22.13 (`eas.json`). It also adds `expo-camera` for the face on the card (D095):
the front camera only, with the camera permission line in `app.json`, no microphone and no barcode
scanner. A 0.2.0 build shows "needs the latest version" where the camera would be. The Supabase
deploy applies migrations before it deploys functions, which this needs: the new `photo` function
sends `p_kind`, which only the new `add_photo` takes (the old three-argument call still works).

Version 0.2.0 adds native modules (encrypted session storage, screenshot blocking on the reveal),
so it needs a new binary; an over-the-air update cannot reach 0.1.0 builds. A production build
without the Supabase keys fails at build time and refuses to start (`EXPO_PUBLIC_APP_ENV`).
Android release builds are shrunk and obfuscated (R8). Signing out revokes the session on the
server, not only on the phone. GitHub Actions are pinned to commits; Dependabot opens monthly pull
requests for actions and npm packages, except the packages the Expo SDK pins (`expo`, `expo-*`,
`react`, `react-native-*` and the rest listed in `.github/dependabot.yml`). Those move together in an
Expo SDK upgrade with `npx expo install --fix`, never one at a time.

### The security gates in CI

- **Attacker suite.** `tests/db/attacker.sql` and `tests/live/attacker.test.ts` act as a signed-in
  user with a modified app. Lines that start `ok` are defences that hold. Lines that start `gap`
  are known holes from the build plan, written as the defence that should hold; they do not fail
  the run while the hole is open, and they **do** fail it the day the hole is closed, so that the
  marker is turned into a plain check in the same change. The run ends with how many are open.
- **Secret scan.** gitleaks over the whole history. If it fires, the secret is already leaked:
  rotate it first ("A secret leaks", below), then remove it.
- **Dependency audit.** `npm run audit:check` fails on any high or critical advisory in what ships
  that is not listed in `security/audit-baseline.json`. Since the Expo SDK 58 upgrade (D094) the
  baseline is empty; an entry needs a triaged reason, and the check says when a name can come off
  it. Prefer upgrading to patching: batch 8's in-place patches (D093) went with the upgrade.

### Staying inside the Actions minutes

GitHub gives a private repo a monthly allowance of Actions minutes and bills every job as at
least one minute. What uses them here, and how to use fewer:

- **Analytics worker:** one run every 6 hours is about 120 minutes a month. It ran every 5 minutes at
  first, which would have been about 8,600. Change the `cron` line in `analytics.yml` to run it
  less often, and run it by hand when you want a fresh score at once.
- **CI:** about 15 to 20 minutes a run, mostly the local Supabase stack. It runs for a pull
  request and for a push to `main`, so every merged PR costs two runs. Push to a PR in a few
  larger commits, not many small ones.
- **Supabase deploy:** one run per merge that touches `supabase/`, followed by the live test.
  Merging two such PRs back to back runs it twice. Merge them together where you can.
- Check the total under Settings, Billing and plans. A public repo has no limit on minutes.
- Since 2026-11-25 the repo is public (D100), so minutes are not limited. If it goes private again,
  the limits above apply: the first sign of running out is jobs that fail in a few seconds with no
  logs and no `analytics-worker` issue.
- While it is public, never commit a secret, a `.env` file or `google-services.json`: everything
  in the history is readable by anyone.

## 5. Everyday changes

### A change to the database

1. On a branch, add a migration: `npx supabase migration new <name>`. Never edit one that has
   already been applied.
2. If an invite rule changes, change `src/domain/invites.ts` in the same commit.
3. Add checks in `tests/db`, and in `tests/live` if the change crosses the network.
4. Run `npm run typecheck`, `python tests/db/run.py` and `npm run test:live:local`.
5. Open a PR. CI must be green. Merging it deploys to the project and runs the live test.
6. Check the **Supabase deploy** run: `migration list` shows the new file and the live test passes.

### A change to the app only

1. Branch, change, test with the mock and with `npm run db:start`, open a PR, merge on green CI.
2. Run **EAS build** (`preview`, `android`) and install from the link in the run summary.

There are no over-the-air updates. A JavaScript change reaches phones only through a new build.

### The website

pinkilock.com is the app's own web build, published by **Web deploy** from `main` to Cloudflare
Pages (project `pinkilock`). Nothing is uploaded by hand. A change to the screens reaches the site
on the next push to `main`; check it first by exporting on mock data and serving it locally
(`README.md`, "The web build").

- **The domain.** The DNS for pinkilock.com is on Cloudflare in the same account. The site answers
  on `pinkilock.com` and `www.pinkilock.com`, both attached once in the dashboard (Workers & Pages,
  `pinkilock`, Custom domains). `mail.pinkilock.com` belongs to Resend for email: never change
  its records.
- **Headers.** `web/_headers` is the security policy: the page runs only its own scripts and talks
  only to its own origin and the Supabase project. A new outside service (a font, analytics, an
  error reporter) is blocked by it until the policy names it, and adding one is a decision for
  `docs/decisions.md`, because the page holds the sign-in session.
- **Every path is the app.** Pages answers any path with `index.html` because the build has no
  `404.html`; the app's own not-found screen does the rest. Do not add a `404.html`.
- **No `node_modules` on Pages.** Cloudflare Pages never uploads a folder named `node_modules`,
  and Expo puts every font and icon under `assets/node_modules/`. `scripts/prepare-web-dist.mjs`
  moves them to `assets/vendor/` and fails the deploy if the bundle names a file that is not there.
  Serif type or empty boxes on the live site mean this step was skipped.
- **Rolling back.** In the dashboard, `pinkilock`, Deployments: pick an earlier one, Rollback. Then
  fix `main`, because the next push publishes again.
- **The site is down or old.** Look at the last **Web deploy** run. Its last step fetches `/`,
  `/plans` and `/share.png` from pinkilock.com and warns if any of them is not a 200.

### A change to the push function

Edit `supabase/functions/push`, then run `npm run test:push:local`. Merging deploys it.

### Turning on contact proofs (D078)

People prove a handle by sending a code from it to Pinkilock. Until this is set up the app says
"Checking handles is not switched on yet". Steps, once:

1. Make a Meta app (developers.facebook.com, type Business) and add the **WhatsApp** product. Give
   it a phone number that is not on any WhatsApp app (a new SIM works), and make a permanent
   system-user token with `whatsapp_business_messaging`.
2. For Instagram: turn `@pinkilock` into a professional account, add **Instagram** (API with
   Instagram login) to the same app, connect the account, and make a long-lived token with
   `instagram_business_basic` and `instagram_business_manage_messages` (needs Meta's app review).
3. In GitHub add the secrets `META_APP_SECRET`, `META_VERIFY_TOKEN` (any long random string),
   `WHATSAPP_TOKEN`, `INSTAGRAM_TOKEN`, and the variables `PINKILOCK_WHATSAPP_NUMBER` (e.g.
   `919800000000`) and `PINKILOCK_INSTAGRAM` (`pinkilock`). Run **Supabase deploy**.
4. In Meta, for each product, set the webhook to `https://<ref>.supabase.co/functions/v1/contact-verify`
   with the same verify token, and subscribe to `messages`.
5. Check: tap Verify in the app, send the code, and the tick appears within a few seconds. The
   function's logs show `{"at":"contact_verify","WhatsApp:verified":1}` and never a number or name.

Receiving messages costs nothing; the "Verified" answer is free inside WhatsApp's 24-hour reply
window.

### A change to the analytics worker

Edit `analytics/duckdb_pipeline.py`, then check it with `python tests/db/run.py` and
`python analytics/duckdb_pipeline.py --dry-run` against a local stack. The next scheduled run
after the merge uses the new code. No deploy is needed.

**Self love data (D101).** Moods and notes are in `private.self_moods` and `private.self_notes`.
They are the person's alone: `scripts/moderate.sh` does not show them, and nobody should read them in
the SQL editor. A person's request about them is answered with their data download. The help line
on Bounce back (Tele-MANAS 14416, `SUPPORT_LINES` in `src/domain/selfLove.ts`) should be checked
before launch and when a country opens.

**Couple mode data (D120).** Couples, date lists, special days and challenge ticks are in
`private.couples`, `private.couple_ideas`, `private.couple_days` and `private.couple_weeks`. They are the
two people's alone: nobody reads them in the SQL editor except to answer a report, and a request is
answered with the data download (`couples`). Nothing to set up: it works once the migration is
deployed.

**Spicy mode data (D103).** Usernames, boundaries and yeses are in `private.spicy` and
`private.spicy_yes`. Like Self love, nobody reads them in the SQL editor except to answer a report
about that person, and a person's request is answered with their data download. Spicy mode should not
be announced or launched publicly until a lawyer has reviewed it (O14 in `docs/decisions.md`). A report
about Spicy mode is handled like any other: the report already blocks, which closes the hand-off.

**Changing the Spicy terms (D107).** The terms and quiz are words in `src/i18n` (`spicyQuiz`) and
the key in SQL. When the terms change in a way that matters, in one PR: a new migration that
replaces `private.spicy_terms_version()` with the next number (and `private.spicy_quiz_key()` if the
answers moved), `SPICY_TERMS_VERSION` and `SPICY_QUIZ` in `src/domain/spicyQuiz.ts`, the words in
English and Hindi, and `UPDATE_CASES=1 npm run test:unit`. Once it deploys, Spicy pauses for everyone
until they pass the new quiz: say so in the release note. Typo fixes keep the version. The old passes
stay in `public.consents` as a record.

## 6. Health checks

Do these in a quick weekly look, and whenever something feels wrong.

1. **Actions tab:** the latest **CI**, **Supabase deploy** and **Analytics worker** runs are green,
   and there is no open issue labelled `analytics-worker`.
2. **Supabase SQL editor**, read-only queries:

```sql
-- The clock: the last sweeps succeeded.
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'pinkilock-sweep')
order by start_time desc limit 5;

-- Push backlog: should be empty or only seconds old.
select kind, count(*) as pending, max(attempts) as attempts, max(last_error) as last_error, min(created_at) as oldest
from public.notifications where sent_at is null group by kind;

-- Postgres reaching the push function: recent responses should be 200.
select status_code, error_msg, created from net._http_response order by created desc limit 10;

-- Trust scores are fresh: should be within the last 6 hours or so.
select max(computed_at) as last_scored from public.trust_scores;

-- Reports nobody has looked at yet.
select id, reason, detail, reported_id, created_at from public.reports where reviewed_at is null order by created_at;
```

3. **Supabase dashboard**, Edge Functions, `push`, Logs: no repeated errors.

## 7. When something breaks

### The Supabase deploy fails

- At "Check that the project values are set": a secret or variable is missing. Add it and rerun.
- At "Apply migrations": the SQL is wrong for the live database. Fix it with a **new** migration
  on a branch, and do not edit the failed one. A migration that never applied can be edited
  before you rerun.
- At the live test: the deploy went through but the flow is broken. Treat it as a production bug
  (see "Rolling back" below).

### Asks never expire, or missed check-ins never turn into flakes

The sweep is not running. Run the cron query in section 6. If the job is missing, rerun
**Supabase deploy**: the cron migration schedules it again by name.

### Pushes do not arrive

Work along the chain until you find the break:

1. Is there a row in `notifications`? If not, the change never committed, or the trigger is
   missing (check `migration list`).
2. Is `sent_at` still empty?
   - If `last_error` says `DeviceNotRegistered`, the token has been removed. The phone
     registers again on its next start.
   - If `net._http_response` shows 401, the push secret is out of step. Rerun **Supabase deploy**.
3. Was it sent, but nothing showed on the phone?
   - On Android, the build needs `GOOGLE_SERVICES_JSON` and the FCM key on expo.dev.
   - Check that the phone allowed notifications. The **Me** tab shows whether push is on.
   - Look at `receipt_error` on the row: FCM or APNs refused it after Expo accepted it
     (`DeviceNotRegistered` also removes the token; `MismatchSenderId` or `InvalidCredentials`
     mean the FCM or APNs keys on expo.dev are wrong). The function's log has a `push_receipt`
     line per failure, with the notification id.

Notifications older than an hour, or that have failed 5 times, are never sent. That is on
purpose: a late "check-in is open" is worse than none.

### Trust scores are stale, or an `analytics-worker` issue is open

Open the failing run.

- **Authentication failed:** `ANALYTICS_DB_PASSWORD` and the role's password disagree. Rerun
  **Supabase deploy**.
- **Could not connect:** check `SUPABASE_POOLER_HOST` against the deploy run summary.
- **Permission denied for a table, view or function:** a migration gave the worker something to read
  that `pinkilock_analytics` has no right to. Fix it in a new migration, never by a grant in the
  dashboard. `tests/db` runs the pipeline as that role, so the fix can be checked there first.
  A view that calls a function needs the right to call it, so read the table instead (issue #51).

The app keeps showing the last good scores in the meantime, so nothing breaks for users.

### The satisfaction figure

`select * from analytics.satisfaction_daily order by day desc limit 7;` gives, per day, the answers
to "Worth showing up?" in the 28 days before, how many said yes, the rate (empty under 50 answers:
report "not enough data", never a percentage), and how many said they felt unsafe. The target is
96% or more (`docs/build-plan.md`, target B). Every "felt unsafe" also opens a report.

### Review profile lines and act on reports

Everything goes through `scripts/moderate.sh` with the database URL (the `postgres` role); no app,
API key or service role key is involved, and every action needs a reason, which is kept.

```bash
scripts/moderate.sh "$DB" queue                                  # open reports, and lines waiting for a person
scripts/moderate.sh "$DB" report 42 hide_line "spelled-out number"  # act on a report
scripts/moderate.sh "$DB" person <uuid> approve_line "ordinary"  # act on a person (lines, suspensions)
scripts/moderate.sh "$DB" history <uuid>                         # what was done to them, and why
```

Actions: `dismiss`, `hide_line` (removes the line, no new line for 30 days, one strike; a second
strike suspends), `suspend`, `unsuspend`, `approve_line`, `reject_line`. A suspended account is out
of Discover and cannot ask, lock or edit.

### Check photos

Every new photo waits for a person (D088): nobody else sees it until it is approved. Work through
them at least daily; a person sees "Checking" on their own photo until then. The list has a `kind`
column: `face` is the face on the card (D095), shown to strangers once approved, so look harder:
one person's face, clearly theirs, no text, screens, other people or filters; anything else is
`hold_photo` (and `hold_photo_contact` if it carries a contact). Approving a new face takes the old
one down. A held face can be retaken straight away.

```bash
scripts/moderate.sh "$DB" photos                                  # waiting photos: id, owner, path
scripts/moderate.sh "$DB" photo <id> approve_photo "ordinary"     # show it after a kept promise
scripts/moderate.sh "$DB" photo <id> hold_photo "blurry, no face"  # show it to nobody
scripts/moderate.sh "$DB" photo <id> hold_photo_contact "handle on a card"  # nobody, and a strike
```

Look at each file in the dashboard (Storage, bucket `photos`, the path from the list). Hold
anything with readable text, a handle, a number, a QR code or a barcode as `hold_photo_contact`;
hold nudity, violence, other people's faces, or a photo of a photo as `hold_photo`. The files there
carry no metadata: the `photo` function strips it and draws the picture again before storing
(D098). Its log line says how long that took (`ms`); a refusal with `why: not_redrawn` is a file
that passed the strip but would not decode. If successful uploads start taking more than about
1500 ms, the function is near the Edge runtime's 2 s of CPU a request: tell the owner. A held photo stays on the
owner's Me as "Not approved" until they remove it. Removed photos and deleted accounts leave their
paths in `photo_trash`, which the push function empties within five minutes; if it grows,
check the push function's log for `photo_trash_failed`.

**Line review mode** (`private.config` key `line_review`): `off` shows a line after the pattern
check only (the default); `ai` sends new lines to the `review-line` Edge Function, which asks
Claude and holds anything unsure for a person; `human` holds every new line for a person. The deploy
workflow sets `ai` when the `ANTHROPIC_API_KEY` secret exists, otherwise `off`. Only the line itself
is sent to Claude. Its log has one JSON line per decision with the profile id and the outcome, never
the line.

### Trace a bug

Every error the app shows has a reference under it, for example `PL033 · 7F3K2M9Q`: an error
code, then a trace id. Ask the person for that line, or for **Me, Help, Share diagnostics**, which
holds their account id, the app build, and the references of recent errors (no names, messages,
places or contacts). Then, in the SQL editor:

```sql
-- 1. What the code means: src/domain/errors.ts. PL = a database function refused (the same code
--    is in the migrations), PA = sign-in, PC = the app itself (PC001 network, PC002 a server
--    error that is not one of ours, PC009 a screen crashed).

-- 2. From a trace id: what that one action did on the server, and what the phone reported.
select at, type, actor_id, invite_id, props from public.events where props ->> 'trace' = '7F3K2M9Q';
select created_at, kind, recipient_id, sent_at, attempts, last_error from public.notifications where trace = '7F3K2M9Q';
select at, user_id, code, route, app_version, platform from public.client_errors where trace = '7F3K2M9Q';

-- 3. The whole story of one invite, in time order: its events, its pushes and their delivery,
--    and every phone error on the same traces.
select * from private.invite_timeline('<invite id>');

-- 4. From an account and a time: what that phone saw go wrong.
select at, code, trace, route, app_version from public.client_errors
where user_id = '<account id>' and at > now() - interval '1 day' order by at;

-- 5. Is it one person or everyone? Errors by code and build over the last day.
select code, app_version, count(*), count(distinct user_id) as people from public.client_errors
where at > now() - interval '1 day' group by 1, 2 order by 3 desc;
```

The push function's log (Supabase dashboard, Edge Functions, `push`, Logs) has one JSON line per
notification with the same trace id and what happened to it (`sent`, `no_device`, or the error).

A refused action logs no event, because the database rolled it back; its trace id is then only
in `client_errors`. A `PC002` has the real database error in the Postgres logs at that time.
`client_errors` keeps 30 days, takes at most 30 reports an hour from one account, and goes with
the account when it is deleted.

Then fix it the same way every time: first a test that fails for this bug (`tests/db`,
`tests/unit`, `tests/live` or the app tests), then the fix, and the pull request names the
reference that found it.

### A report comes in

Reports are readable only with the database role, in the SQL editor (query in section 6). The
reporter has already blocked the person, so nothing is urgent for them. Look at the reported
person's other reports (`where reported_id = ...`), and mark it looked at:
`update public.reports set reviewed_at = now(), review_note = '...' where id = ...`. There is no
ban tool yet; if one is needed, deleting that person's auth user (Authentication, Users) removes
them the same way as an in-app deletion.

### Someone asks for their data, or for their account to go

Both are in the app: Me, Account, **Download my data** and **Delete my account**. Deletion is
immediate and cannot be undone; the events log keeps anonymous rows, and reports keep their
rows without the id.

### Email sign-in does not work

- The app says "Email sign-in is not switched on yet": the `SMTP_*` settings are not all set, or
  the deploy has not run since. Its run summary says whether email sign-in is on. Without them the
  deploy switches email off on purpose.
- Codes never arrive: first, the address may have no account (signing in) or be on another one
  (adding it); the app says the same either way on purpose (D091). The `auth-code` function's log
  has one line per request with `sent`, `not_sent` or Auth's status, never the address. Then check
  the sender's logs (Resend, Emails) and the spam folder. A domain that
  is not verified at the sender is refused there. Supabase also caps emails per hour (Auth, Rate
  limits); a burst of sign-ins past it gets "Wait a moment before asking for another code".

### Phone sign-in does not work

- The app says "Phone sign-in is not switched on yet": the three `TWILIO_VERIFY_*` secrets are not
  all set, or the deploy has not run since. Its run summary says whether phone sign-in is on.
- Codes never arrive: check the Twilio console (Verify, Logs). Verify sends Indian OTPs from its
  own registered templates; other countries may need to be allowed in the service's settings.

### The EAS build fails

- **Missing `EXPO_TOKEN`, or no `projectId`:** see the error text in the run.
- **"No Supabase project is configured":** the profile's variables are empty.
- **Otherwise:** the run's last step, "Show why the build failed", prints EAS's error message
  and the end of the native log; the full log is on the build page linked in the run.
- **"Duplicate resources" in `mergeReleaseResources`:** two images in `assets/` share a name and
  differ only in extension (`x.gif` and `x.png`); Android keeps one name per image. Rename one.
  `npm run test:unit` checks for this.
- **"No matching client found for package name":** the Android app registered in Firebase is not
  `com.pinkilock.app`. Download google-services.json again for that package and replace the
  `GOOGLE_SERVICES_JSON` secret.

### A request or an appeal comes in

`scripts/moderate.sh "$DB" requests` lists them, oldest first. Answer each within 30 days (the
privacy policy says so), then `scripts/moderate.sh "$DB" answer <id> "what was done"`. A Trust Score
review: check the person's own events (`select type, at from events where actor_id = '<id>'`) and
correct only a real error. An appeal names a moderation action: `history <uuid>` shows it; undo it
with `person <uuid> unsuspend "appeal accepted"` (or the matching action) when it was wrong.

### Personal data leaks (breach runbook)

1. **Contain**: rotate whatever leaked (A secret leaks, below), switch off the path that leaked.
2. **Record**: what data, whose, since when, how found. Keep the record even if nothing is reported.
3. **Decide within 24 hours** whether it is likely to harm people. If yes, the clocks start from when
   we became aware: GDPR (EU, UK): the regulator within 72 hours; India (DPDP): the Data Protection
   Board and the affected people, without delay; other launched countries: their rule (the lawyer's
   checklist per region, `docs/build-plan.md` WP8).
4. **Tell the people affected** in plain words: what happened, what it means for them, what to do.
5. **Fix and test**: a test that fails for the hole, then the fix, then add it to the attacker suite.

### Opening a country or a city

Only after its checklist and the lawyer's sign-off (WP8). Then a migration sets `active = true` in
`countries` and `cities`, and the same change goes into `src/domain/countries.ts`. Discover is per
city; a city with no venue list falls back to typed places. A city opened inside India needs no
new legal review: it gets its `state` in `CITIES` (for the state, then city picker), at least 12
areas with rough centres and 6 places to meet (`npm run test:unit` checks), and any old name people
still use goes in `CITY_ALIASES` (`src/domain/citySearch.ts`).

**Early access (D116).** To open a city to Pink Gold members first, a migration sets `early = true`
(leaving `active = false`) in `cities`, and `early: true` goes on its row in `CITIES`. Members can then
move there from Me; everyone else gets it when `active` turns true.

The tier-2 cities opened by D092 (migration `20261119000002_tier2_cities.sql`) have area and place
lists written without a local check. Before launch, have someone who lives in each city read its
areas, their rough centres and its places; fix names and centres in a new migration, and switch a
wrong place off (`active = false`), never delete it.

### Areas people name themselves

`private.area_requests` counts areas typed off the list, by city and name (no person). To promote
popular ones, read it in the SQL editor (`select * from private.area_requests order by people desc`),
check each name is a real place, then add rows in a new migration to `areas` and the same names to
`AREAS` in `src/domain/areas.ts` and `AREA_CENTRES` in `src/domain/areaCentres.ts` (`npm run test:unit`
checks all three match). "Use my location" needs the `expo-location` native module, so the first
build after D087 must be a new EAS build; an over-the-air update alone is not enough.

A first profile also needs the request's network country (`cf-ipcountry`) to be open (PL078).
GitHub's runners are in the US, so the live-test workflow stores a random one-run token in
`private.config` `network_check_token`, the test sends it as the `x-pinkilock-test-token` header,
and the workflow clears it at the end, pass or fail. If a cancelled run left one behind, clear it:
`select private.set_config('network_check_token', '')`. Opening a country is only the migration
above (D063).

When the link gate is on, the live test links its test people in the database right after they
set up (address `test-<id>@e2e.pinkilock.invalid`, a domain that never receives mail) and deletes
them at the end. A cancelled run can leave some behind: `delete from auth.users where email like
'%@e2e.pinkilock.invalid'`.

### Spicy call times

Nothing to set up: the migration schedules `pinkilock-calls` (every minute, `private.call_sweep()`).
To look at a disputed call, in the SQL editor: `select id, status, outcome, fault, answer_a, answer_b,
starts_at from private.spicy_calls where outcome in ('disputed', 'unsettled') order by settled_at desc`.
The timer rows are `private.spicy_call_minutes` (minutes only, nothing of the call). A missed call
shows on the Trust Score as `call_missed` events once the analytics worker has run.

**The voice call (D111).** Spicy calls use the same LiveKit project and secrets as Talk mode (below):
`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Without them, **Join the call** says in-app
calls are not switched on yet (PL179). Two more steps in LiveKit Cloud:

1. **Settings, Webhooks, Add**: URL `https://<project ref>.supabase.co/functions/v1/voice`, signed
   with the same API key. This is the one webhook for the project (Spicy and Talk rooms both). Without
   it, calls still work but their minutes fall back to the app's check-ins.
2. Keep recording (egress) and ingress off. Nothing in Pinkilock starts one.

A phone build made before this change has no voice module: build a new APK (EAS) after merging.
To see a call's sessions in the SQL editor: `select user_id, joined_at, left_at from
private.spicy_call_voice where call_id = '<id>' order by joined_at`.

### Wallet

Credits (D104) are a closed loop: nothing in the app or the database can pay a person, and
credits never turn back into money. Top-ups go through Razorpay and stay off until its keys are
GitHub secrets. Use **test keys first**: they move no money.

1. Make an account at [dashboard.razorpay.com](https://dashboard.razorpay.com) (business type, PAN,
   bank account; KYC is needed only for live mode). Keep it in **Test mode** for now.
2. **Account & Settings, API Keys, Generate Test Key.** Copy the Key Id (`rzp_test_...`) and the Key
   Secret (shown once).
3. GitHub, **Settings, Secrets and variables, Actions, New repository secret**: `RAZORPAY_KEY_ID`
   and `RAZORPAY_KEY_SECRET`. Never paste them in a chat, an issue or a file: the repository is public.
4. Razorpay, **Account & Settings, Webhooks, Add New Webhook**: URL
   `https://<project ref>.supabase.co/functions/v1/wallet`, a secret you make up (save it as the
   GitHub secret `RAZORPAY_WEBHOOK_SECRET`), events `payment.captured`, `order.paid` and
   `refund.processed`.
5. Razorpay, **Account & Settings, Payment capture**: automatic capture on (credits are added only
   for captured payments).
6. Run **Supabase deploy** (Actions). Its summary says "Wallet top-ups: on, test mode". On the
   website, Me, Wallet, tap a pack and pay with Razorpay's test UPI id `success@razorpay` or a test card.
7. Live: after Razorpay's KYC and the legal and tax review (O16), make live keys (`rzp_live_...`),
   put them in the same secrets (or `PROD_RAZORPAY_KEY_ID`, `PROD_RAZORPAY_KEY_SECRET` and
   `PROD_RAZORPAY_WEBHOOK_SECRET` for production only), add the webhook in live mode too, and deploy.

The phone apps show no top-up: Google Play requires its own billing for digital goods (O15).

**A refund:** refund the payment in the Razorpay dashboard. The `refund.processed` webhook takes
back what is left of those credits (`wallet_refunded`). **A partner café or cinema** for Treat the
plan: add a row by hand, `insert into public.treat_partners (id, name, city, items) values
('cafe_id', 'Name', 'Mumbai', '{coffee,dessert}')`; switch it off with `active = false`, never
delete it. Until a partner till exists, a voucher is checked with `select redeem_treat('cafe_id',
'CODE')` as the service role, and the partner is settled outside the app.

Checks, read-only:

```sql
-- Orders paid today, and any still waiting (abandoned checkouts are normal).
select status, count(*), sum(paise) / 100 as rupees from private.wallet_orders where created_at > now() - interval '1 day' group by status;
-- Bought credits held by everyone: what Pinkilock owes in service, for the books.
select sum(paid) as bought, sum(earned) as earned from private.wallets;
```

### Talk mode

Talk mode (D108) has three parts, each off until its keys are GitHub secrets. The repository is
public: never paste a key in a chat, an issue or a file.

1. **The AI companion** uses `ANTHROPIC_API_KEY` (already a secret for review lines). Optional:
   the variable `TALK_MODEL` picks another model (the default is Haiku 5.5, D114). It is paid in credits:
   60 for up to 15 minutes, and 60 more to continue (D114).
2. **Voice calls**: make a project at [cloud.livekit.io](https://cloud.livekit.io) (Mumbai region),
   **Settings, Keys, Create key**, and add the secrets `LIVEKIT_URL` (the `wss://` address),
   `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET`. Turn off recording (egress) in the project. Spicy calls
   use the same keys, and need the webhook from "Spicy call times" above (D111).
3. **Listener sign-up and payouts** use Razorpay Route on the same Razorpay account as the wallet:
   ask Razorpay to activate **Route** (Dashboard, Route), then add the secret `TALK_ROUTE` = `on`.
   Optional variables `TALK_ROUTE_CATEGORY` and `TALK_ROUTE_SUBCATEGORY` set the business type sent
   for each listener (Razorpay's list). Test mode first; live only after the CA's view (O17).
4. Run **Supabase deploy**. Its summary says which parts are on.

**Approving a listener.** After Razorpay has checked the KYC, the application waits for a person.
In the SQL editor, as the service role, read it and decide:

```sql
select user_id, first_name, sex, accepts, topics, status, applied_at from private.talk_listeners where status = 'checking';
select public.talk_listener_decide('<user id>', 'verified');   -- or 'paused' / 'removed'
```

**Reports.** A report ends the call, blocks the pair in Talk mode, and holds the listener's payout
for that call. Read them with `select * from private.talk_reports where handled_at is null`. Pause a
listener with `talk_listener_decide(..., 'paused')`. A self-harm flag on an AI chat stores no words;
nobody can read what was said.

Checks, read-only:

```sql
-- Calls today by how they ended, and payouts waiting or sent.
select status, end_reason, count(*) from private.talk_calls where rang_at > now() - interval '1 day' group by 1, 2;
select status, count(*), sum(payout) / 100 as rupees from private.talk_payouts group by status;
```

### Pink Gold

Pink Gold (D115) is the name for paid members, shown as a badge on their card. People buy it on the
website (D116): the plans (`g1`, `g3`, `g6`, `g12`) and Boost packs (`b1`, `b6`) go through the same
`wallet` Edge Function, Razorpay keys and webhook as credit top-ups ("Wallet" above), so there is
nothing more to set up. Phone apps wait for Play Billing (O15). A refund from the Razorpay dashboard
takes the plan's months off the end, or the Boosts not used yet. A member's free Saathi session a
month needs nothing set up: it rides the Saathi switches in "Talk mode".

The team can also make someone a member in the SQL editor (it runs as the owner; no app role can
call these):

```sql
select private.pink_gold_grant('<user id>');                                -- a member until ended
select private.pink_gold_grant('<user id>', now() + interval '30 days', 'founding member');  -- with an end date and a note
select private.pink_gold_end('<user id>');                                  -- the badge comes off now
select user_id, since, until, note from private.pink_gold order by since desc;   -- who is, and was
select pack, status, count(*), sum(paise) / 100 as rupees from private.wallet_orders
  where pack ~ '^[gb][0-9]+$' group by 1, 2 order by 1;                       -- plans and Boosts sold
```

Running the grant again changes the end date. The note is only for the team; nobody sees it in the
app or in their download.

### Retention

`private.retention()` runs daily (pg_cron): finished plans lose their place and line after 90 days,
notifications go after 30, accounts that never finished setting up after 30. Deleting inactive
accounts is off until `private.config` has `retention_inactive_months` (the lawyer sets the number).

### A secret leaks

1. Rotate it at once (section 3), then revoke the old value at its source.
2. If the leak is the database password or a Supabase access token, check the Supabase logs
   for access you don't recognise.
3. If it was committed, rotating it is the fix. Rewriting git history does not help, because
   the value has already been exposed.

## 8. Rolling back

- **Database:** forward only. Undo a migration with a new migration that reverses it, through a PR.
  Supabase keeps daily backups on paid plans. Point-in-time recovery is a paid add-on, and is
  worth turning on before production.
- **Push function:** revert the commit on `main`. The deploy that follows ships the old code.
- **App:** earlier builds stay on the EAS builds page, and testers can reinstall one. Make sure
  the old build still works with the current schema before you point people at it.
- **Analytics:** revert the commit. The next scheduled run uses the old code.

## 9. Working with Claude Code

- **Local sessions** read `CLAUDE.md` automatically, which holds the same rules as this file.
- **Cloud sessions** (claude.ai/code) work on a branch and open a PR. They never merge, never
  deploy, and never add temporary trigger files or branch triggers to workflows to get around
  that. Phase 2 needed that workaround once, and PR #2 removed it.
- **Prompts:** start a session by telling it to read `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`,
  `ROADMAP.md` and this file. `ROADMAP.md` holds the prompt for the next phase.
- **Ask Claude to check before trusting:** state in GitHub (PRs, runs, branches) changes outside
  the session, so have it read the current state rather than assume it.

## 10. Before adding real users

From `ROADMAP.md`, Phase 3. All of these must be true first:

- [ ] Reporting and blocking shipped, enforced by RLS (built in PR #3; ships to staging on merge)
- [ ] Email and phone sign-in, account deletion and data export (built in PR #3; email needs an SMTP sender, phone needs Twilio)
- [ ] A production Supabase project, separate from staging, with backups (and ideally PITR); the
      workflows are ready for it (`docs/phase-3-checklist.md`, step 3)
- [ ] `PROD_*` variables set, and a `production` build tested on Android and iOS
- [ ] Push checked on real devices on both platforms
- [ ] A privacy policy published, and store data-safety forms filled in
- [ ] Every language offered has been read by a native speaker (D102, O13), or is taken out of
      `src/i18n/languages.ts` for launch
- [ ] Before live Razorpay keys: the legal and tax view on the wallet and the Spicy unlock (O16),
      and terms that say credits are never cash and what happens to unused ones

### Languages

The translations in `src/i18n/langs/` are machine drafts (D102). To sign one off: a native speaker
reads every string in the running app (`?lang=hi` on the web build, or the picker), fixes the
file, fills the keys it leaves out, and then `reviewed` goes to true in `src/i18n/languages.ts`
with a row in `docs/decisions.md` naming the reviewer. `npm run test:unit` checks that every
string keeps the English placeholders. Nothing about languages needs a secret or a workflow.
