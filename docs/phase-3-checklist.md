# Phase 3 checklist: what is left

Phase 3 is built (see `ROADMAP.md`): blocking, reporting, data export, account deletion, phone
sign-in and a production target in the workflows. These steps need your accounts or your phones.

## 1. Merge and watch the deploy

- [ ] Merge the Phase 3 pull request. The **Supabase deploy** run on `main` applies three new
      migrations to the preview project (`20261117000001` to `20261117000003`), then runs the
      live tests there: the two-user test and the new safety test (block, report, export,
      delete; its phone part runs only on the local stack, which has test numbers).
- [ ] Check that **CI** and **Supabase deploy** are green on `main`.

## 2. Phone sign-in (Twilio Verify)

- [ ] Twilio console: create an account, then Verify, Services, create a service (name:
      Pinkilock, code length 6).
- [ ] Add three repository secrets: `TWILIO_VERIFY_ACCOUNT_SID` (starts `AC`),
      `TWILIO_VERIFY_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID` (starts `VA`).
- [ ] Run **Supabase deploy** (target `preview`). Its summary should say "Phone sign-in: on".
- [ ] On a phone: Me, Account, Add your phone number. Then Sign out, and "I already have an
      account" on the first screen with the same number: the same profile and history come back.

## 3. Production project (when you want one)

- [ ] Create a second Supabase project (Mumbai region, like the first). For backups with
      point-in-time recovery it needs the Pro plan.
- [ ] Variables `PROD_SUPABASE_PROJECT_REF`, `PROD_EXPO_PUBLIC_SUPABASE_ANON_KEY`; secrets
      `PROD_SUPABASE_DB_PASSWORD`, `PROD_ANALYTICS_DB_PASSWORD` (make one up).
- [ ] Optional: Settings, Environments, `production`, Required reviewers: yourself.
- [ ] Run **Supabase deploy** with target `production`, then set `PROD_SUPABASE_POOLER_HOST`
      to the host its summary prints.
- [ ] **EAS build** with profile `production` when you are ready for a store build.

## 4. Two phones, for real

- [ ] Phone B blocks phone A from A's profile: A's next app open shows neither B nor their plans.
- [ ] Report someone: they disappear for you; the row is in `reports` (SQL editor:
      `select * from reports order by created_at desc`).
- [ ] Me, Download my data: the share sheet offers a JSON file with your data only.
- [ ] Me, Delete my account: back to onboarding; the other phone no longer shows you.

Not in this phase yet: iOS and store submission (they need your Apple account).
