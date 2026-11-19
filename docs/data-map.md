# Data map

What personal data Pinkilock holds, where, and which companies process it. Written for the privacy
lawyer and the data protection paperwork (docs/build-plan.md, WP8). Keep it true: a change that adds
a processor or a kind of data updates this file in the same pull request.

## What we hold

| Data | Where | Kept | Who can read it |
| --- | --- | --- | --- |
| Account: id, email or phone, sign-in sessions | Supabase Auth (`auth.users`) | Until the account is deleted; unfinished accounts 30 days | The person; operators |
| Card: first name, age, city, country, area, pronouns, line, tags, date ideas (and, for the server only, when the name, line and city last changed) | `profiles` | Until deleted | The person; people they share a plan with; up to 200 people a day through Discover |
| Device location ("Use my location") | Never stored: read once on the phone to pick a city and area, then dropped | Not kept | No one; it never leaves the phone |
| Areas named off the list: city, name, how many people, first and last time | `private.area_requests` | Until promoted to the list or cleared | No client; operators |
| Contact handle | `profile_private` | Until deleted | The person; someone they kept a promise with |
| Photos behind the lock (up to three; the file has no metadata: place, phone and time are stripped on the server) | `photos`, Storage bucket `photos` | Until removed or the account is deleted; the file within minutes after (`photo_trash`) | The person; moderators; once approved, someone they kept a promise with |
| Photo uploads, for the weekly limit | `private.photo_uploads` | 8 days | No client |
| Sign-in code requests: a hash of the address, the caller (account id, or a hash of the network address) and the time, for the limits | `private.auth_code_requests` | 1 day | No client |
| Plans: who (two people, or four on a double), idea, time, place, line, status, pinkies, check-ins | `invites` | Place and line cleared 90 days after the plan ends | The two people on it |
| Behaviour log (asks, locks, check-ins, bails) | `events` | Kept; a deleted account's rows lose its id | No client; the analytics worker |
| Trust Score | `trust_scores` | Recomputed every 6 hours | The person; people they share a plan with; Discover |
| Answers after a date | `date_ratings` | Until deleted | No client; the analytics worker |
| Consents with version and time | `consents` | Until deleted | No client; operators |
| Reports, blocks, moderation actions | `reports`, `blocks`, `private.moderation_actions` | Reports kept with ids removed on deletion | Moderators only |
| Profile line under review | `private.line_reviews` | Until decided or replaced | The person (their own); moderators |
| Requests and appeals | `privacy_requests` | Until deleted | Operators |
| Push tokens and sent notifications | `push_tokens`, `notifications` | Notifications 30 days | No client |
| Push tickets: Expo's id for a sent push, with the device token | `push_tickets` | Until Expo answers, a day at most | No client; the push function |
| Error reports: code, trace id, screen, build | `client_errors` | 30 days | Operators |
| Friend vouches: who vouched, the phrases | `vouches` | Until either account is deleted | No client; the card shows a count and the top phrases |
| Duo: who my duo partner is, and the links made to join | `duos`, `private.duo_links` | Until left, blocked or deleted | The two people in the duo; others see only that a card has one |
| Check-in codes | `private.checkin_codes` | Deleted when the plan ends | The person (their own code) |
| Flags on a contact handle: who flagged whose handle, on which plan, and when the handle was verified | `contact_reports`, `events` (`bad_contact`), `profile_private.contact_verified_at` | Until either account is deleted | The flagged person sees a count only (`my_contact_flags`). The flagger's export lists the flags they made; the flagged person's export leaves them out, since a plan names the flagger |

Dating preferences can reveal sexual orientation (special-category data under GDPR, sensitive under
other laws): they are processed only with the separate `sensitive` consent.

## Who processes it

| Company | What for | What it receives | Where |
| --- | --- | --- | --- |
| Supabase | Database, sign-in, Realtime, Edge Functions | Everything above | The project's region (decision O07) |
| Expo (EAS) | Builds, over-the-air updates, push relay | Push tokens, notification titles and bodies (names and idea titles only) | US |
| Apple (APNs), Google (FCM) | Delivering notifications | Push tokens, notification text | Global |
| Twilio Verify | Phone sign-in codes | Phone numbers | Global; Indian DLT rules apply to SMS |
| Email sender (not chosen yet) | Email sign-in codes | Email addresses | Depends on the provider |
| Anthropic (only when `ANTHROPIC_API_KEY` is set) | Reviewing profile lines | The line alone, no name or id | US |
| GitHub | CI and the analytics worker (GitHub Actions runners) | The worker reads events, invites, profiles and ratings into a runner for each run, and keeps nothing | US |

Each needs a data processing agreement before launch. Moving EU or UK users' data outside those
regions needs transfer terms; choosing an EU region for production avoids most of that.
