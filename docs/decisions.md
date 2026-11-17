# Pinkilock decision log

Every decision that shapes the product or how it is built, in the order it was taken. Add to the
end; never rewrite an old entry. When a decision is reversed, add a new entry that says so and
set the old one's status to `Superseded by D0nn`.

**How to add one:** take the next number, give the date, say what was decided in one sentence,
why, who decided, and where it lives (a pull request, a file, a section of the build plan).
"Owner" means the person who owns the product decided it. "Claude, accepted" means Claude
proposed it and the owner merged the work without changing it.

Decisions still waiting for the owner are in the second table. When one is taken, move it to the
first table with its date.

## Decided

| # | Date | Decision | Why | Decided by | Where | Status |
| --- | --- | --- | --- | --- | --- | --- |
| D001 | 2026-11-17 | Flirty and "naughty" content teases and never gets explicit | A stranger reads it before saying yes, and the store age rating is still open | Claude, accepted | PR #10, `src/domain/ideas.ts` | In force |
| D002 | 2026-11-17 | There is still no chat before the date; "naughty chat" became tones for the one ask line | No chat is what makes the promise and the reveal mean something | Claude, accepted | PR #10 | In force |
| D003 | 2026-11-17 | The early "aha moment" is the spark card: what two cards have in common, worked out on the phone from public data, with no reordering of Discover | A new user had nothing early that said "this person is your kind"; nothing new is stored or exposed | Claude, accepted | PR #10, `src/domain/spark.ts` | In force |
| D004 | 2026-11-17 | The security target is "someone who has fully taken the app apart gains nothing", not "cannot be reverse engineered" | The second is impossible for any app; the first can be tested | Claude, accepted | PR #11, build plan section 1 | In force |
| D005 | 2026-11-17 | Satisfaction is measured as the share of "Yes" to "Worth showing up?" after kept dates, over 28 days, with at least 50 answers; target 96% | The owner's target needed a definition that can be measured | Owner (target), Claude (definition) | PR #11, build plan section 1 and WP7 | In force; not built |
| D006 | 2026-11-17 | "Global" means a country allow-list that grows one region at a time, each after its checklist and a lawyer's sign-off | Privacy and dating-safety rules differ by country | Owner (goal), Claude (approach) | PR #11, build plan WP8 | In force; not built |
| D007 | 2026-11-17 | Early contact sharing is stopped by removing free-form fields, not by filtering them; the one free line is reviewed before anyone sees it | Any filter loses to an invented code | Owner (raised it), Claude (approach) | PR #11, build plan WP1 | In force; not built |
| D008 | 2026-11-17 | Photo upload ships only together with the photo checks: in-app camera for the public photo, server check for a face and no readable text or QR code, metadata stripped | A public photo is the widest channel for a handle | Owner (raised it), Claude (approach) | PR #11, build plan WP7b | In force; not built |
| D009 | 2026-11-17 | Known security gaps are written as tests that pass while the gap is open and fail the day it closes | A closed gap must become a permanent check, not a forgotten note | Claude, accepted | PR #12, `tests/db/attacker.sql` | In force |
| D010 | 2026-11-17 | The 16 high or critical dependency advisories already present are recorded as a baseline; CI blocks only new ones | Clearing them needs an Expo SDK upgrade; blocking on them would have stopped all work | Claude, accepted | PR #12, `security/audit-baseline.json` | In force; debt to clear in WP5 |
| D011 | 2026-11-17 | The database lint and Supabase's security advisor report only, until each has had one clean run | They could not be run before merging, and an unproven gate that blocks every change is worse than none | Claude, accepted | PR #12, CI and deploy workflows | In force; revisit after first runs |
| D012 | 2026-11-17 | Hosted sign-in settings are set by the deploy workflow, not the dashboard: 30 anonymous sign-ups an hour per address, email codes valid 10 minutes, 1-hour tokens with rotation | Settings that exist only in a dashboard cannot be reviewed or restored | Claude, accepted | PR #12, `OPERATIONS.md` "Auth settings" | In force |
| D013 | 2026-11-17 | No root or jailbreak detection and no certificate pinning for now | Both break for honest users more often than they stop an attacker, and protect nothing the server does not | Claude, accepted | PR #11, build plan WP5 | In force; revisit after WP6 |
| D014 | 2026-11-17 | Bug tracing is built before the feature packages (WP0b before WP1) | Every later package adds server rules and error cases; they should start with codes and trace ids | Owner (asked for traceable bugs), Claude (order) | Build plan WP0b | In force |
| D015 | 2026-11-17 | Every error has a stable code (`PL` database, `PA` sign-in, `PC` app) kept in SQL and in `src/domain/errors.ts`; the app decides on the code, never on message text | Message text changes; a code can be searched and tested | Claude | WP0b branch, `src/domain/errors.ts` | In force once merged |
| D016 | 2026-11-17 | Logs and error reports hold ids, codes, routes and times only, never content; a server error that is not one of ours is shown as `PC002` and its text is dropped | Tracing must not become a second copy of private data; database error text can quote row values | Claude | WP0b branch, `src/lib/log.ts` | In force once merged |
| D017 | 2026-11-17 | Phone error reports are kept 30 days, capped at 30 an hour per account, and readable only with the database role | Enough to see a pattern; small enough to hold little | Claude | WP0b branch, tracing migration | In force once merged |
| D018 | 2026-11-17 | Decisions are logged in this file | The owner asked for one place to see what was decided and when | Owner | `docs/decisions.md` | In force |
| D019 | 2026-11-17 | The app's black is replaced by blue: deep royal blue `#001C55` ground, royal blue `#4169E1` borders, sky blue `#A9D8F7` secondary text; pink, volt and the off-white text stay | The owner asked for royal or sky blue wherever possible; a brighter blue ground would make pink labels unreadable | Owner (colour), Claude (shades) | `theme/royal-blue` branch, `DESIGN_SYSTEM.md` | In force once merged |
| D020 | 2026-11-17 | The website is the app's own web build (`npx expo export -p web`); there is no second codebase, and anything a browser needs differently lives in `src/lib/web.ts` or the shared component | The phone app and the website can then never drift apart | Owner | The web brief; `ARCHITECTURE.md` section 9 | In force |
| D021 | 2026-11-17 | A screen reader's click commits a hold button at once in a browser; a mouse, a finger and a held Space or Enter need the full 900 ms, with reduced motion on too | A screen reader cannot hold, and without this those users could not send an ask; this is what the `activate` action already does on a phone | Claude, accepted | PR #14, `HoldButton.tsx` | In force |
| D022 | 2026-11-17 | The lock takes the keyboard in a browser: arrow keys slide the pinky a quarter at a time, the fourth commits, Enter, Space or End commit at once | The promise must not depend on a drag; quarters match the drag's four haptic steps | Claude, accepted | PR #14, `PinkyLock.tsx`, `DESIGN_SYSTEM.md` section 6 | In force |
| D023 | 2026-11-17 | The app is never drawn wider than 480: on a tablet or a wide browser window it is a centred column on `bg` with a `line` hairline down each side, set once in `Screen.tsx` | A phone layout stretched across a desktop is unusable; one place keeps every screen in step | Claude | The web pull request after #14, `Screen.tsx`, `tokens.ts` (`columnMax`) | In force once merged |
| D024 | 2026-11-17 | The page background and the browser theme colour are written by hand in `public/index.html` and `app.json` (`#001C55`), the only colours outside `src/theme/tokens.ts` | Neither file can import the tokens, and the page must not be white before the app loads | Claude | The web pull request after #14 | In force once merged |
| D025 | 2026-11-17 | WP1 is built in two parts: the server rules that need no owner decision first (write profiles only through a function, catalogues, limits, the plain contact check), the rest after O03 to O05 are answered | The first part closes four gaps without changing what the product offers | Claude | `wp1a/profile-rules` branch, build plan WP1 status | In force once merged |
| D026 | 2026-11-17 | A name is one word of letters, 2 to 16: no digits, spaces, dots, underscores, hyphens or apostrophes | A name was the easiest place to put a handle; the cost is that names like Anne-Marie or O'Neil must be written without the mark | Claude | `save_profile`, `src/domain/profile.ts` | In force once merged; revisit if real users hit it |
| D027 | 2026-11-17 | The contact check is deliberately simple (five patterns, identical in SQL and the app) and is not presented as complete | It stops the plain cases cheaply; codes are answered by review and by removing free text (D007), not by a cleverer filter | Claude | `private.looks_like_contact`, `CONTACT_CASES` | In force once merged |
| D028 | 2026-11-17 | Every route has a page title of the form `Plans · Pinkilock`, named once in `src/lib/routes.ts`; a title never carries a person's name or an id | Titles are kept in browser history, bookmarks and shared tab lists, where a name would outlive the screen; one table keeps titles and routes in step, and a unit test fails when a route has no entry | Claude | The web basics pull request, `src/lib/routes.ts`, `app/_layout.tsx`, `tests/unit/routes.test.ts` | In force once merged |
| D029 | 2026-11-17 | A visitor with no profile who opens a personal screen directly (a shared link, a bookmark after signing out) is sent to `/` by the root layout; only the start, onboarding, sign-in and not-found screens open without a profile. An address that matches nothing shows our own not-found screen | Before this only `/` led to onboarding, so a deep link showed an empty or broken screen, and an unknown address showed Expo's developer page with a sitemap. The check is a courtesy for the visitor; RLS still decides what anyone can read | Claude | The web basics pull request, `app/_layout.tsx`, `app/+not-found.tsx` | In force once merged |
| D030 | 2026-11-17 | A shared link shows a title, a description and a large-picture card, with no picture address until the site has a domain; the web manifest and home-screen icons are in `public/`, with the blue written by hand in `public/manifest.json` | Link previews need an absolute address for the picture, and the domain is the owner's decision; the manifest cannot import the tokens | Claude | The web basics pull request, `public/index.html`, `public/manifest.json`, `scripts/make-icons.mjs` | In force once merged |

## Waiting for the owner

Each has a recommendation in `docs/build-plan.md`, section 5.

| # | Decision needed | Blocks | Recommendation |
| --- | --- | --- | --- |
| O01 | Require a linked email or phone before sending or answering an ask (browsing stays open) | WP2 | Yes |
| O02 | Check in by exchanging 4-digit codes shown on each other's phones | WP4 | Yes |
| O03 | The ask line becomes pick-only, with no typing | WP1 | Yes |
| O04 | Use an AI model to review profile lines and photos (needs an account; the provider is named in the privacy policy) | WP1, WP7b | Yes |
| O05 | A maps provider for place search, once places stop being typed | WP1 | Yes |
| O06 | First launch country | WP8 | India, then one region at a time |
| O07 | Production database region | WP8 | An EU region if Europe or the UK is planned within a year |
| O08 | Captcha provider and account | WP2 | Turnstile or hCaptcha; both have free tiers |
| O09 | Crash reporting account | WP7 | Sentry's free tier |
| O10 | A privacy lawyer, and named privacy contact, grievance officer and representatives | WP8 | Before any public launch |
