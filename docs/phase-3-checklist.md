# Phase 3 checklist: what is left

Phase 3 is built (see `ROADMAP.md`): blocking, reporting, data export, account deletion, email
and phone sign-in and a production target in the workflows. These steps need your accounts or your phones.

## 1. Merge and watch the deploy

- [x] Merge the Phase 3 pull request (#3). The **Supabase deploy** run on `main` applied
      `20261117000001` to `20261117000003` to the preview project and the live tests passed there.
- [ ] Merge the email sign-in pull request. Its deploy applies `20261117000004` (the export
      names the account's email) and sets up email sign-in if the `SMTP_*` settings exist. The
      safety test's email and phone parts run only on the local stack (local mailbox, test
      numbers), so nobody real is mailed or texted.
- [ ] Check that **CI** and **Supabase deploy** are green on `main`, and that the deploy summary
      says "Email sign-in: on".

## 2. Email sign-in (free; do this first)

- [ ] resend.com: sign up, Domains, add your domain and set the DNS records it shows until it
      says Verified. Then API Keys, create one with "Sending access".
- [ ] Repository variables: `SMTP_HOST` = `smtp.resend.com`, `SMTP_USER` = `resend`,
      `SMTP_SENDER_EMAIL` = e.g. `codes@yourdomain`. Secret: `SMTP_PASSWORD` = the API key.
- [ ] Run **Supabase deploy** (target `preview`). Its summary should say "Email sign-in: on".
- [ ] On a phone: Me, Account, Add your email. Then Sign out, and "I already have an account"
      with the same email: the same profile and history come back.

## 2b. Phone sign-in (Twilio Verify, optional)

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
