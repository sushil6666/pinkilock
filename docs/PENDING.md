# Pending tasks

One list of everything still to do, in the order to do it. Work down it one item at a time.
It is a living list: when a task is done, tick it, add the date, and move it to "Done" at the end.
A Claude thread that finishes a task, or adds one, updates this file in the same PR.

**Who:** **You** = Sushil (accounts, secrets, merges, phones, people to hire). **Code** = a Claude
thread builds it on a branch and opens a PR. Most items are You first, then a quick Code step.

**Secrets:** paste secret values only in GitHub (Settings, Secrets and variables, Actions, New
repository secret). Never in a chat, an issue or a file: the repository is public.

**"Run Supabase deploy"** always means: GitHub, Actions, Supabase deploy, Run workflow, branch
`main`, target `preview`. Its run summary says what is on.

Last checked against the repo and the deploy runs: 2026-11-27.

---

## 1. Merge the open pull requests (You, 5 minutes)

Merge in this order, one at a time, and wait for **CI** to be green before each one. After each
merge, **Supabase deploy** and **Web deploy** run on their own; check they go green.

- [x] **#100** Pause payments, keep the paid features (D117). Merged 2026-11-27.
- [x] **#101** Bring a friend: referral rewards (D118). Merged 2026-11-27.
- [x] **#102** Couple mode after a match (D120). Merged 2026-11-27.
- [x] **#103** This week on Plans: three plan ideas each Monday and city events (D121). Merged 2026-11-27.
- [x] **#104** This list. Merged 2026-11-27.
- [x] **#105** Your record: kept-plan streak and private city standing (D122). Merged 2026-11-27.
- [x] **#106** With friends in Couple mode (D123). Merged 2026-11-27.
- [x] **#107** Gentle reminders, at most 3 pushes a week (D124). Merged 2026-11-27. The real push
      test on a phone (step 3) checks it too.

How: open the PR on GitHub, "Merge pull request", "Confirm merge". If GitHub says the branch is out
of date or has conflicts, tell the thread that made it; do not fix it in the browser.

## 2. Attach the website's own domain (You, 10 minutes)

The site is live at pinkilock.pages.dev, but pinkilock.com does not answer yet (the Web deploy on
2026-11-27 warned for `/`, `/plans` and `/share.png`).

1. dash.cloudflare.com, Workers & Pages, `pinkilock`, Custom domains, Set up a custom domain.
2. Add `pinkilock.com`, confirm. Then add `www.pinkilock.com` the same way.
3. Leave every `mail.pinkilock.com` record alone (Resend email uses them).
4. Wait until both show Active, then GitHub, Actions, Web deploy, Run workflow. Its last step should
   show 200 for all three pages.

Details: `OPERATIONS.md`, "The website".

## 3. New Android build, then the two-phone test (You)

The last Android build is from 2026-11-17. Everything since (location, city search, camera photo,
languages, in-app voice, calendar export) needs a new build: an over-the-air update is not enough.

1. Merge step 1 first.
2. GitHub, Actions, **EAS build**, Run workflow, profile `preview`, platform `android`.
3. The run summary has the install link. Install the APK on two Android phones.
4. Go through `docs/phase-2-checklist.md` step 4 and `docs/phase-3-checklist.md` step 4, and tick
   each box. Tell a thread about anything that looks wrong, with a screenshot.

If the build fails: `OPERATIONS.md`, "The EAS build fails".

## 4. Phone sign-in with a WhatsApp code (You, then Code)

Codes on WhatsApp are cheaper than SMS in India. Phone sign-in is off today (the TWILIO_VERIFY_*
secrets are not set).

You:
1. Get a phone number that is not on any WhatsApp app (a new SIM works) for Pinkilock's
   WhatsApp Business sender.
2. twilio.com: make an account. Console, Messaging, Senders, **WhatsApp senders**: register the
   number (Twilio walks you through Meta's business check).
3. Console, **Verify**, Services, Create: name `Pinkilock`, code length 6. In the service, turn on
   the **WhatsApp** channel and pick your WhatsApp sender. Keep SMS on as the fallback.
4. GitHub secrets: `TWILIO_VERIFY_ACCOUNT_SID` (starts `AC`), `TWILIO_VERIFY_AUTH_TOKEN`,
   `TWILIO_VERIFY_SERVICE_SID` (starts `VA`).
5. Run Supabase deploy. The summary should say "Phone sign-in: on (Twilio Verify)". From here
   SMS codes already work.

Code (ask for a thread once step 5 is green):
6. Send the code on WhatsApp first, with "Send by SMS instead" as the fallback, in the app and mock.
7. Count referrals by phone again: `select private.set_config('referral_needs_phone','true')`
   in the SQL editor (it is `false` for now so a verified email counts; see #101).

You, on a phone: Me, Account, Add your phone number; sign out; "I already have an account" with
the same number: the same profile comes back. (`docs/phase-3-checklist.md`, step 2b.)

## 5. Turn on Saathi and AI line review: the Claude API key (You, 10 minutes)

Not set today, so Saathi (the AI companion) cannot answer and profile lines get only the pattern check.

1. console.anthropic.com: sign in, Billing, add a card and a small monthly spend limit
   (for example $20).
2. Settings, API keys, Create key, name `pinkilock-deploy`. Copy it once.
3. GitHub secret `ANTHROPIC_API_KEY` = that key.
4. Run Supabase deploy. The summary should say "Profile line review: ai".

Details: `OPERATIONS.md`, "Talk mode" step 1.

## 6. In-app voice for Spicy calls and Talk mode: LiveKit (You, 15 minutes, O19)

1. cloud.livekit.io: make a project, region **Mumbai**.
2. Settings, Keys, Create key. GitHub secrets: `LIVEKIT_URL` (the `wss://` address),
   `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.
3. Settings, Webhooks, Add: URL `https://rwdqzjwocdlbppotadec.supabase.co/functions/v1/voice`,
   signed with the same API key.
4. Keep recording (egress) and ingress off.
5. Run Supabase deploy. The summary should say "Talk mode: voice on".
6. Needs the new Android build from step 3 on the phones.

Details: `OPERATIONS.md`, "Spicy call times" and "Talk mode".

## 7. Proved handles: WhatsApp Business and Instagram professional (You, D078)

Today the app says "Checking handles is not switched on yet". A phone number can belong to only one
WhatsApp Business account, so use a different number from step 4 unless you set both up on the
same Meta business.

Follow `OPERATIONS.md`, "Turning on contact proofs (D078)", steps 1 to 5: a Meta app with WhatsApp,
`@pinkilock` as an Instagram professional account, the secrets `META_APP_SECRET`,
`META_VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `INSTAGRAM_TOKEN`, the variables `PINKILOCK_WHATSAPP_NUMBER`
and `PINKILOCK_INSTAGRAM`, Supabase deploy, then the webhooks in Meta. Instagram needs Meta's app
review, which can take days.

## 8. The production project (You, before real users)

Everything runs on the preview project today. `docs/phase-3-checklist.md`, step 3:

1. supabase.com: a second project, region Mumbai (ap-south-1, D099), Pro plan for backups and
   point-in-time recovery.
2. GitHub variables `PROD_SUPABASE_PROJECT_REF`, `PROD_EXPO_PUBLIC_SUPABASE_ANON_KEY`; secrets
   `PROD_SUPABASE_DB_PASSWORD`, `PROD_ANALYTICS_DB_PASSWORD` (make one up).
3. Optional: Settings, Environments, `production`, Required reviewers: yourself.
4. Run Supabase deploy with target `production`, then set the variable `PROD_SUPABASE_POOLER_HOST`
   to the host its summary prints.
5. Captcha on production sign-in (D091): Cloudflare, Turnstile, add a widget for pinkilock.com;
   variable `PROD_TURNSTILE_SITE_KEY`, secret `PROD_TURNSTILE_SECRET`; deploy production again.
6. Production needs its own phone, LiveKit and Meta settings only if you want them separate; the
   same secrets are used otherwise (`OPERATIONS.md`, section 3).
7. Then the website switches to production by itself (D062), and **EAS build** with profile
   `production` makes the store build.

## 9. Lawyer, CA and mental-health adviser (You, before public launch)

One lawyer can take all of the legal briefs together. Each item's full question is in
`docs/decisions.md`, "Waiting for the owner".

- [ ] **O10** Privacy lawyer; a named privacy contact, grievance officer and representatives;
      the privacy policy published. Also the number of months for deleting inactive accounts
      (`retention_inactive_months`, `OPERATIONS.md`, "Retention").
- [ ] **O14** Spicy mode (IT Act and Rules, POCSO, store rules, whether an ID age check is needed),
      with **O20** Spicy calls on Pinkilock's own voice service.
- [ ] **O21** Saathi's Flirty tone.
- [ ] **O22** Expert tips (D127), before the first expert is listed: the not-therapy wording,
      intimacy counselling kept educational, spiritual guides (no paid remedies or cures), how
      credentials are checked, and the terms experts agree to. **O23** with a CA, later: paid
      sessions with experts.
- [ ] **O18** Talk mode with a mental-health adviser: Saathi's instructions and labels (also the daily check-in's, D126), the
      self-harm hand-off, the listener code. The adviser also reads the Hindi version.
- [ ] **O16** Wallet and money (closed-loop credits, GST, refunds, unused credits, the Spicy unlock
      fee; covers **O12**, the refundable stake), and **O17** with a CA: listener payouts by
      Razorpay Route, GST, TDS 194-O.
- [ ] The opening of each new country (India only for now): its checklist in
      `docs/build-plan.md` WP8.

## 10. Store listing and store readiness (You)

1. Play Console: create the app `com.pinkilock.app`, then paste the text from
   `docs/store-listing.md` (English; Hindi once step 11 has checked it) and upload the screenshots
   it names.
2. Fill in the data-safety form (`docs/data-map.md` lists what is collected), the content rating
   questionnaire (Spicy mode affects it: wait for O14) and the privacy policy link.
3. Internal testing track first, with the production build from step 8.

## 11. People to check words and places (You)

- [ ] **Languages (O13).** The 22 Indian languages and Hindi are machine drafts. A native speaker
      reads every screen (`?lang=hi` on the website, or the language picker), fixes the file in
      `src/i18n/langs/`, and a thread sets `reviewed: true`. Start with Hindi, then the languages
      of the cities you open first. Unreviewed ones are taken out for launch. Also the Hindi text in
      `docs/store-listing.md`. Details: `OPERATIONS.md`, "Languages".
- [ ] **City places.** The area and meeting-place lists for the 91 cities were written without a
      local check. Someone who lives in each city reads its areas and places; a thread fixes names
      in a new migration and switches wrong places off. Start with the 8 metros. Details:
      `OPERATIONS.md`, "Opening a country or a city".

- [ ] **Experts.** Pitch counsellors, therapists, coaches and guides you know and point them to
      **Join as an expert** in the app; then check each request and list them as in `OPERATIONS.md`,
      "Experts". Nothing shows until you do.
- [ ] **City events (D121).** Plans shows what is on in each city from `public.city_events`, which
      is empty until the team adds checked events. Add each with the SQL in `OPERATIONS.md`,
      "City events (D121)"; take one down with `active = false`, never delete it.

- [ ] **Cosmic match tables.** Someone who reads kundlis compares a few real pairs' scores with
      the app's (`src/domain/cosmic.ts`), and says whether any table should change.

## 12. Decisions waiting for you

Each is in `docs/decisions.md`. Tell a thread your pick and it records and builds it.

- [ ] **D062** Confirm: the website uses the preview project until production exists (it already
      works this way; this is only your yes).
- [ ] **O09** Crash reporting: Sentry's free tier (needs a Sentry account; the website's security
      policy must name it).
- [ ] **O04** AI review of profile lines and photos (lines can use the Claude key from step 5;
      photos still checked by a person).
- [ ] **O05** A maps provider for place search, once places stop being typed.
- [ ] **O11** A selfie (liveness) check provider.

## 13. Later: when payments come back

Payments are paused (D117). None of this is needed until you want to take money.

- [ ] **Razorpay keys**, test mode first: `OPERATIONS.md`, "Wallet", steps 1 to 6 (secrets
      `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`). Live keys only after
      O16 and Razorpay's KYC.
- [ ] **Razorpay Route** for listener payouts: ask Razorpay to turn it on, then the secret
      `TALK_ROUTE` = `on` (`OPERATIONS.md`, "Talk mode" step 3). After O17.
- [ ] **Turn payments on:** GitHub variable `PAID_FEATURES` = `on`, then run Supabase deploy.
- [ ] **Play Billing (O15)** for buying inside the Android app (and Apple in-app purchase for
      iOS). Code work once you want it; until then people buy on the website.

## 14. Later: iPhone and push on real phones

- [ ] Apple developer account (99 USD a year), then an iOS build with EAS and APNs push. Code helps
      with the build settings once the account exists.
- [ ] Push checked on real phones on Android and iOS (`docs/phase-2-checklist.md`, step 4),
      including the gentle reminders from #107.

## 15. Optional

- [ ] Buy pinkilock.in and redirect it to pinkilock.com (Cloudflare, a redirect rule).
- [ ] GitHub secret `EXPO_ACCESS_TOKEN` (not set today): turns on Expo's extra push security.
      Can be the same token as `EXPO_TOKEN`; then run Supabase deploy.

---

## Done

Moved here with the date when ticked.

- By 2026-11-25 Email sign-in on: Resend sender verified, `SMTP_*` set, deploy says it is on.
- 2026-11-17 Android push: Firebase project, `GOOGLE_SERVICES_JSON`, FCM key on expo.dev.
- 2026-11-17 Website live on Cloudflare Pages (pinkilock.pages.dev).
- 2026-11-25 Repository public; Actions minutes problem gone (D100).
- 2026-11-27 Pink Gold (#98) and the store listing text (#99) merged.
- 2026-11-27 Payment pause, referrals and the retention work (#100 to #107) merged.
