# Pinkilock roadmap

Where the app is, what comes next, and what each phase must prove before the next one starts.
`README.md` says how to run and deploy it; `ARCHITECTURE.md` says how it fits together.

| Phase | Goal | Status |
| --- | --- | --- |
| 1. MVP | The full promise flow on mock data, with a tested schema | Done |
| 2. Cloud | The same flow live on Supabase, with push, CI and installable builds | Deployed; device checks open ([checklist](docs/phase-2-checklist.md)) |
| 3. Real users | Safety and identity, so that strangers can use it | Next |
| 4. The date itself | Photos and the video room | Planned |

## Phase 1: MVP (done)

Expo app (onboarding, Discover, asks, the lock gesture, plans, check-in, reveal), a mock backend
that plays the other person, the Supabase schema with RLS and promise functions, and the DuckDB
trust worker.

## Phase 2: Cloud (deployed, device checks open)

Built and verified against the real Supabase project on 2026-11-16:

- Schema as migrations in `supabase/migrations`, with the `pg_cron` sweep as a migration.
- Deploys from GitHub Actions only (`supabase-deploy.yml`), followed by the live two-user test,
  which passed 6 of 6 against the real project.
- Push notifications sent only by the server: a database outbox and the `push` Edge Function.
- The analytics worker on a 5-minute GitHub Actions schedule; a failed run opens an issue.
- EAS profiles (development, preview, production), CI on every push, an installable Android
  preview APK, placeholder icon and splash.

**Done when** every box in [docs/phase-2-checklist.md](docs/phase-2-checklist.md) is ticked: the
first cloud analytics run, Firebase for Android push, and a two-phone run on real devices.

## Phase 3: Real users (next)

The gate before anyone outside the team signs up.

- **Reporting and blocking.** `ARCHITECTURE.md` says these must ship before real users do.
- Phone-number sign-in, linked to the anonymous user so that the id and history are kept.
- Account deletion and data export.
- A production Supabase project separate from the current one (`PROD_SUPABASE_PROJECT_REF`),
  with backups and monitoring.
- iOS: Apple developer account, the first iOS build, and APNs push.
- Store readiness: privacy policy, age rating, data-safety forms, TestFlight and Play internal testing.

**Done when** a stranger can sign up with a phone number on a store test build, block or report
someone, and delete their account, on both platforms, against the production project.

### Prompt to start Phase 3

Run this only after the Phase 2 checklist is complete. Paste it into Claude Code in the repo root:

```text
Phase 3 of Pinkilock: make it safe for real users. Read CLAUDE.md, README.md, ARCHITECTURE.md,
DESIGN_SYSTEM.md and ROADMAP.md first. Build the Phase 3 list in ROADMAP.md in this order:
reporting and blocking; phone-number sign-in linked to the existing anonymous user; account
deletion and data export; the production Supabase project wired through the existing deploy and
EAS workflows; iOS build and push. Store listings are prepared as documents only, not submitted.

Keep the project rules in CLAUDE.md. A blocked person must disappear from Discover and lose
access to every shared invite through RLS, not only in the UI, and reports go to a table that
no client can read. Every new rule gets checks in tests/db and, where it crosses the network,
in tests/live. Ask me for accounts and keys (Apple, SMS provider, the production project) when
you reach the step that needs them, and keep building whatever does not need them meanwhile.

When you finish, update README.md, ARCHITECTURE.md and ROADMAP.md, and report what you verified
against the real projects, what you verified only locally, and what still needs a physical device.
```

## Phase 4: The date itself (planned)

- Photo upload to Supabase Storage, with extra photos still hidden until a kept promise.
- The video room named in video plans.
- Calendar export, and distance in live mode.
