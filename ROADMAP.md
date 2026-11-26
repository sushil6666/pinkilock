# Pinkilock roadmap

Where the app is, what comes next, and what each phase must prove before the next one starts.
`README.md` says how to run and deploy it; `ARCHITECTURE.md` says how it fits together.

| Phase | Goal | Status |
| --- | --- | --- |
| 1. MVP | The full promise flow on mock data, with a tested schema | Done |
| 2. Cloud | The same flow live on Supabase, with push, CI and installable builds | Deployed; device checks open ([checklist](docs/phase-2-checklist.md)) |
| 3. Real users | Safety and identity, so that strangers can use it | Built, not deployed ([checklist](docs/phase-3-checklist.md)) |
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
- The analytics worker on a 6-hourly GitHub Actions schedule; a failed run opens an issue.
- EAS profiles (development, preview, production), CI on every pull request and push to `main`, an installable Android
  preview APK, placeholder icon and splash.

**Done when** every box in [docs/phase-2-checklist.md](docs/phase-2-checklist.md) is ticked: the
first cloud analytics run, Firebase for Android push, and a two-phone run on real devices.

## Phase 3: Real users (built, waiting on accounts)

The gate before anyone outside the team signs up. Built on 2026-11-17 and verified on a local
Supabase stack and in CI; it reaches the real project when the PR merges.

- [x] **Reporting and blocking.** Enforced by RLS: a blocked pair lose each other's card, every
  shared invite and the reveal; live plans end as `ended` with no flake for anyone. Reports go to
  a table no client can read, and always block. Mirrored in the mock.
- [x] **Account deletion and data export**, through `security definer` functions. The events log
  keeps its rows with the person's id removed; Trust Scores now count kept promises from the log.
- [x] **Phone-number sign-in**, linked to the anonymous user so that the id and history are kept,
  behind the Backend interface. Sign-in on a new phone, and sign-out once a number is linked.
- [x] **Email sign-in codes**, the free alternative to SMS, the same way: link keeps the id, sign
  in on a new phone, code-only templates. On once an SMTP sender (e.g. Resend) is configured.
- [ ] A mail sender (`SMTP_*`), then email sign-in tried on a real phone.
- [ ] WhatsApp codes, cheaper than SMS in India: needs a Meta-approved WhatsApp Business sender,
  then either Twilio's WhatsApp channel or Supabase's send-SMS hook calling Meta directly.
- [x] **A production project, prepared**: the deploy and analytics workflows take a target, and
  nothing touches production until `PROD_SUPABASE_PROJECT_REF` exists.
- [ ] Twilio Verify keys, then phone sign-in tried on a real phone.
- [ ] The production Supabase project itself, with backups (point-in-time recovery needs the Pro
  plan) and monitoring.
- [ ] iOS: Apple developer account, the first iOS build, and APNs push. (Skipped for now.)
- [ ] Store readiness: privacy policy, age rating, data-safety forms, TestFlight and Play internal
  testing. (Skipped for now.)
- [x] A way to review reports other than the SQL editor: `scripts/moderate.sh` (reports, lines,
  photos, appeals), with the database role and a reason for every action.
- [x] **Contact handles that work** (D077): each app's format checked in the app and on the
  server, a "Check it" link, and a flag after a kept plan when a handle did not work, which counts
  against the owner's Trust Score unless they verify or fix it within 7 days (D079).
- [x] **Hardening left from WP5** (D093): shipped dependency advisories patched in place (16 high
  or critical down to 4, all build-time), the live feed sends no deletes (G24), and production
  bundles print nothing.
- [x] **Expo SDK 58** (D094): React Native 0.88, React 19, Expo Router 58. No high or critical
  advisory left in what ships; batch 8's patches are gone. App version 0.3.0.
- [ ] A 0.3.0 build tried on a real Android phone (EAS preview build), then shipped.
- [ ] **Proved handles** (D078): built (code, `contact-verify` function, Verified tick). Needs a
  Pinkilock WhatsApp Business number and an Instagram professional account on a Meta app
  (OPERATIONS.md, "Turning on contact proofs").

**Done when** a stranger can keep their account with an email or a phone number on a store test build, block or report
someone, and delete their account, on both platforms, against the production project.

## Phase 4: The date itself (planned)

- [x] **Plan options explained, and local ones** (D096): every option shows its summary and opens
  what, where, cost and why on sign-up and Me; each open city has in-person options of its own.
- [x] **Double micro-dates** (market review, F3): duos made from a link, four people on one plan,
  check-in across sides, a flake only on whoever did not show, the reveal between people who met.
- [x] **Ready for a second country** (build plan WP9, first parts): area, pronouns and city picked
  from lists; contact apps by region; a country picker for phone sign-in; every word on screen in a
  strings file, with dates, times, numbers and distance in the phone's own format, and right to left
  wired. A real second language waits for a native speaker.
- [x] **Hindi and the languages of every state** (D102): English plus the 22 scheduled languages,
  each in its own script with a Noto font on the web, Urdu, Kashmiri and Sindhi right to left. A
  language picker on the welcome screen, the website's header and Me suggests the phone's language
  and the person's state's first. Hindi covers every screen; the others cover the first screens.
  All are machine drafts: a native speaker must review each before launch (O13). Still English:
  catalogue rows, error messages and pushes. Needs a new Android build.
- [x] **Twenty cities across India** (D083): the eight metros (Mumbai, Delhi NCR, Bengaluru,
  Hyderabad, Chennai, Kolkata, Pune, Ahmedabad) and twelve tier-2 cities, each with its areas and
  busy public places to meet (237 in all). People pick their city at sign-up and can move on Me,
  once a week. The place lists should be checked by someone who lives in each city.
- [x] **Where I am, from the phone** (D087): "Use my location" picks the city and nearest areas on
  the device and keeps no coordinates; every city lists its common neighbourhoods (about 1,330),
  typing suggests the nearest spellings, and anyone can name an area of their own within limits.
  Needs a new Android build (`expo-location`).
- [x] **Every tier-2 city** (D092): all of the government's Y class cities open, 91 cities in all,
  with about 2,290 areas and 686 places to meet. Metros stay one tap; every other city is found by
  a search (name, old name, state or area) or by picking the state, then the city. The new lists
  were written without a local check and need one before launch.

- [x] **Self love and Bounce back** (D101): a private page for the person alone (kind line, solo
  plans, mood check-in with streak and gold badge, gratitude jar, boundaries) and, after a no, a kind
  note, a 3-day reset, a private journal, a pause from Discover and help lines (Tele-MANAS 14416).

- [x] **Spicy mode** (D103): an opt-in for two adults, off by default, with the safety rules, 18+
  and rules yeses, boundaries from a list, and from day one, with a yes from both, a hand-off to
  Discord (first), Telegram or Signal. Needs a lawyer's view before launch (O14). Since D105 a
  match unlocks for 600 credits (one pays, or 300 each). Since D107 it turns on only after the
  Spicy terms and a 5-question quiz (all right), kept by terms version.

- [x] **Credits wallet** (D104): Razorpay top-ups on the website (test mode until the keys are set),
  boosts, extra open asks, a refundable stake on a plan, Treat the plan (a voucher at a partner
  place), and rewards for kept plans, verified profiles, ratings, vouches and streaks. Never cash.
  Waiting on Razorpay keys, Play Billing for the apps (O15) and a legal and tax view (O16).
- [ ] **Spicy call times**: both pick times and a minimum call length, the app confirms an overlap,
  then both say whether the call happened; a no-show loses their share of the unlock (next PR).

- [x] **Photos behind the lock** (D088): up to three photos on Me, stored in a private Supabase
  Storage bucket by the `photo` Edge Function, which strips their metadata and draws the picture
  again from its pixels (D098). A person checks each one
  before anyone sees it (`scripts/moderate.sh photos`); then it shows only after a kept promise, like
  the handle. Picking needs the next binary. AI review (O04) comes later.
- [x] **Your face on your card** (D095): one optional photo taken in the app with the front camera
  (never from the gallery), checked by a person, then shown on the card instead of the drawn
  portrait to whoever is shown the card, never across a block. Once a week. Needs the 0.3.0 binary
  (`expo-camera`); selfie verification (F2, O11) can reuse the camera step.
- The video room named in video plans.
- [x] **Calendar export**: "Add to calendar" on a locked plan makes an `.ics` file on the phone and
  hands it over (a download in a browser, the share sheet on a phone). It reaches phones with the next
  binary, since it adds `expo-sharing`; older builds hide the button.
- [x] **Distance in live mode** (D089): a card shows how far apart two people's areas are, in whole
  kilometres (or miles by the profile's country), from the area centres that "Use my location"
  brought. Nothing is shown for another city, the same area, or an area of someone's own.
