# Pinkilock

A one-on-one pre-dating app built on a pinky promise. No swiping deck, no chat: you ask one person
to one tiny plan with a time on it, you both lock pinkies, you both show up. Android and iOS from
one Expo codebase.

- `ARCHITECTURE.md`: how the app, Supabase and the DuckDB worker fit together
- `DESIGN_SYSTEM.md`: colours, type, components and the exact spec of the lock gesture
- `ROADMAP.md`: the phases, what each must prove, and what is next
- `docs/phase-2-checklist.md`: the steps left to finish Phase 2 (accounts and real phones)
- `CLAUDE.md`: the project rules, for Claude Code sessions

## Run it on your phone (mock data, no accounts needed)

Needs Node 18.18 or newer and the Expo Go app (SDK 52) on the phone.

```bash
npm install
npx expo start          # scan the QR code with Expo Go (Android) or the Camera app (iOS)
```

On WSL, the phone cannot reach the laptop's dev server directly: use `npx expo start --tunnel`.
Push notifications do not work in Expo Go; they need a preview or development build (below).

With no keys set, the app runs on ten made-up people who answer by themselves. A good first pass:

1. Onboard (five short steps, ends with a hold to swear the promise).
2. **Asks**: open Aanya's boba run, tap **Lock it**, slide your pinky in. She seals it about two
   seconds later.
3. **Plans**: the plan with Ira starts in four minutes, so check-in is already open. Check in,
   Ira follows, and the reveal opens.
4. **Discover**: send someone a vibe check. They answer in about seven seconds; then you seal.
   Nikhil always passes, so you can see that too.
5. On any locked plan: **Can't make it** shows what a bail costs. **Me** has the reset.

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
| Variable | `SUPABASE_POOLER_HOST` | Printed by the first deploy run, e.g. `aws-0-ap-south-1.pooler.supabase.com` |

The service role key is not needed anywhere and must not be added.

**2. Deploy the backend.** Run the **Supabase deploy** workflow (it also runs on every push to
`main` that touches `supabase/`). It turns on anonymous sign-ins, applies the migrations (schema,
RLS, the every-minute `sweep_invites` schedule, push), deploys the `push` Edge Function, connects
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

The **Me** tab shows which backend is in use and whether push is on for this phone. A live
project starts empty: people appear in Discover as they onboard, so try it with two phones.

## Push notifications

Sent only by the server: a database trigger queues them, an Edge Function delivers them through
Expo. The app registers its device token and nothing else. You get one for a new ask, the other
person's pinky, the lock, check-in opening, and a bail or a no-show. See `ARCHITECTURE.md`
section 6.

## Analytics worker (DuckDB)

In the cloud it runs every 5 minutes as the **Analytics worker** workflow, with the restricted
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
pip install pgserver duckdb && python tests/db/run.py   # migrations, RLS, functions, push outbox, pipeline (Python 3.12)
npm run test:live:local     # two users through the live backend, against `supabase start`
npm run test:push:local     # the push chain with a stand-in for Expo (setup: top of tests/live/local_push.sh)
npm run test:app:local      # the real screens in two browser sessions (npx playwright install chromium)
npm run test:live           # the two-user test against EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY
```

CI runs all but the last on every push. The last runs against the real project after each deploy,
and on demand as the **Live two-user test** workflow.

## Status

**Verified locally** (a full Supabase stack in Docker, and in CI on every push): the migrations
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

**Not verified:** a real push delivery (needs Firebase for Android, see Go live step 4), the
analytics worker's first cloud run (needs `ANALYTICS_DB_PASSWORD` and `SUPABASE_POOLER_HOST`), and
anything on a physical phone. That means a push actually arriving (the last
hop, Expo to APNs or FCM to the device), tapping one to open the right screen, the permission
prompt, haptics, safe areas, and 60fps on the lock gesture. iOS builds have not been attempted.

The icon and splash are placeholders drawn from the lock mark. The video room named in video
plans is not built.
