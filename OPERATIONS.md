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

Version 0.3.0 is the Expo SDK 58 upgrade (React Native 0.88, D094): a new binary, and no
over-the-air update reaches 0.2.0 builds, whose native side is SDK 52. Android draws the app edge to
edge; the `expo-navigation-bar` plugin in `app.json` keeps the bar's buttons light with no scrim.
EAS builds on Node 22.13 (`eas.json`).

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
them at least daily; a person sees "Checking" on their own photo until then.

```bash
scripts/moderate.sh "$DB" photos                                  # waiting photos: id, owner, path
scripts/moderate.sh "$DB" photo <id> approve_photo "ordinary"     # show it after a kept promise
scripts/moderate.sh "$DB" photo <id> hold_photo "blurry, no face"  # show it to nobody
scripts/moderate.sh "$DB" photo <id> hold_photo_contact "handle on a card"  # nobody, and a strike
```

Look at each file in the dashboard (Storage, bucket `photos`, the path from the list). Hold
anything with readable text, a handle, a number, a QR code or a barcode as `hold_photo_contact`;
hold nudity, violence, other people's faces, or a photo of a photo as `hold_photo`. The files there
carry no metadata: the `photo` function strips it before storing. A held photo stays on the
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
