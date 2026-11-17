# Phase 2 checklist: what is left

Phase 2 is built and deployed (see `README.md`, Status). These steps need your accounts or your
phones, so the code cannot do them for you. Tick them off in order.

## 1. GitHub settings

Settings, Secrets and variables, Actions.

- [x] Secret `SUPABASE_ACCESS_TOKEN`
- [x] Secret `SUPABASE_DB_PASSWORD`
- [x] Secret `ANALYTICS_DB_PASSWORD`
- [x] Secret `EXPO_TOKEN`
- [x] Secret `EXPO_ACCESS_TOKEN` (optional; passed to the `push` Edge Function for Expo's
      enhanced push security; can be the same token as `EXPO_TOKEN`)
- [x] Variable `SUPABASE_PROJECT_REF`
- [x] Variable `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Variable `SUPABASE_POOLER_HOST`: open the latest **Supabase deploy** run in the Actions tab
      and copy the pooler host it prints, for example `aws-0-ap-south-1.pooler.supabase.com`
- [ ] Secret `GOOGLE_SERVICES_JSON`: see step 3

Never add the service role key anywhere.

## 2. Analytics worker

- [ ] After `SUPABASE_POOLER_HOST` is set, run **Analytics worker** from the Actions tab and check
      that it goes green. From then on it runs every 5 minutes on its own.
- [ ] If it fails, an issue labelled `analytics-worker` is opened. The next good run closes it.

## 3. Android push (Firebase)

- [ ] Firebase console: create a project and add an Android app with package `com.pinkilock.app`.
- [ ] Download `google-services.json` and paste its contents into the `GOOGLE_SERVICES_JSON` secret.
- [ ] Firebase, Project settings, Service accounts: generate a private key and upload it on
      expo.dev under the project's Credentials, Android, FCM V1 service account key.
- [ ] Run **EAS build** (profile `preview`, platform `android`) so that the APK includes Firebase.

Do not commit `google-services.json` or the private key. Both are ignored by git.

## 4. Two phones, for real

Install the new preview APK on two Android phones (the install link is in the EAS build run summary).

- [ ] Both onboard; **Me** shows the live backend and push on.
- [ ] Phone A sends an ask; phone B gets the push, and tapping it opens the ask.
- [ ] B locks, A seals; both get the lock push; the lock gesture feels smooth (60 fps, haptics).
- [ ] At check-in time both get the push, both check in, and the reveal opens.
- [ ] A bail on another plan sends the bail push, and the trust badge changes after the next
      analytics run.
- [ ] Safe areas look right on both phones (notch, gesture bar, 3-button navigation).

When every box is ticked, mark Phase 2 done in `ROADMAP.md` and start Phase 3 with the prompt there.
