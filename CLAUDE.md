# Pinkilock: notes for Claude Code

A one-on-one pre-dating app built on a pinky promise: Expo app, Supabase backend, push via an
Edge Function, DuckDB analytics worker, everything deployed by GitHub Actions.

Read first: `README.md` (run and deploy), `ARCHITECTURE.md` (how it fits together),
`DESIGN_SYSTEM.md` (look, motion, the lock gesture), `ROADMAP.md` (phases and what is next),
`OPERATIONS.md` (secrets, workflows, shipping changes, health checks, fixing incidents),
`docs/phase-3-checklist.md` (what Phase 3 still needs from accounts and phones),
`docs/build-plan.md` (the hardening plan and its work packages), `docs/decisions.md` (what was
decided, when and why).

## Commands

```bash
npm install
npx expo start --tunnel     # WSL: the phone cannot reach the dev server otherwise
npm run typecheck
npm run test:unit           # error catalogue, logger, no silent failures
python tests/db/run.py      # migrations, RLS, functions, push outbox, pipeline on a throwaway Postgres
npm run db:start            # local Supabase in Docker
npm run test:live:local     # two users, then Phase 3 (block, report, export, phone, delete), locally
npm run test:push:local     # the push chain with a stand-in for Expo
npm run test:app:local      # the real screens in two browser sessions
```

## Rules

- `app/` holds routes only. Rules live in `src/domain/`, data access in `src/services/`, screen
  state in `src/state/store.ts`.
- Screens and the store know only the `Backend` interface (`src/services/backend.ts`). Whatever the
  live backend gains, the mock gains too, so that the app always runs with no keys.
- Invite writes go only through the `security definer` SQL functions. No direct table writes from
  the client, and no optimistic UI for promise state.
- The invite state machine exists twice and must match: `src/domain/invites.ts` and the SQL in
  `supabase/migrations`. Change both together and rerun `tests/db`.
- The micro-date catalogue also exists twice: `src/domain/ideas.ts` and the `ideas` table. A new idea
  is a row in both (a new migration), and gets an opener in `OPENERS`; a local one also gets its
  `countries` in both, and every country keeps at least 20 ideas.
- The profile tags also exist twice: `VIBE_GROUPS` in `src/domain/ideas.ts` and the `vibes` table. So do
  the profile and ask rules: `src/domain/profile.ts` and `save_profile` / `send_invite` /
  `private.looks_like_contact` in SQL. Change both together; `CONTACT_CASES` is the shared test table
  (`UPDATE_CASES=1 npm run test:unit` regenerates the SQL copy).
- The venue catalogue also exists twice: `VENUES` in `src/domain/venues.ts` and the `venues` table. A new
  venue is a row in both (a new migration); to retire one, set `active` to false, never delete it.
- The ask lines also exist twice: `ASK_LINES` (built from the starters in `src/domain/ideas.ts`) and the
  `ask_lines` table. A new line is a row in both. Asks never carry typed text.
- Words on screen go through `t('group.key')` with the English in `src/i18n/en.ts`, never written
  into a screen or component (`tests/unit/strings.test.ts` checks). Catalogue rows (ideas, tags, ask
  lines, venues) stay in their tables. Look at a changed screen with `?lang=en-XA` too.
- Profiles are written only through `save_profile`. No direct writes to `profiles` or `profile_private`.
- Schema changes are new migrations (`npx supabase migration new <name>`). Never edit a migration
  that has been applied.
- Blocks are enforced by RLS (`private.blocked_pair`), not by the UI. Reports are readable by no
  client role. Anything new that shows one person to another must respect both.
- The reveal is enforced by RLS, not by the UI. Never fetch, cache or push a contact handle or a
  private photo that RLS would hide. Pushes are sent only by the server.
- Deploys happen through GitHub Actions from `main`, never by hand in the Supabase dashboard and
  never from a branch. Work on a branch and open a PR; do not add trigger files or branch triggers
  to workflows.
- Check GitHub state (PRs, runs, branches) before acting on it; it changes outside the session.
- A new server rule gets a check in the attacker suite (`tests/db/attacker.sql`, `tests/live/attacker.test.ts`).
  A `gap` line that starts failing means the gap is closed: make it a plain check, never delete it.
- Errors have codes. A new `raise` in SQL uses `raise exception using errcode = 'PLnnn', message = '...'`
  and the same code and words go in `src/domain/errors.ts`. In the app throw `AppError` (or `fail(code)`),
  show errors with `shown(e, route)` and `ErrorText`, and never leave a catch empty: use `quiet(where)`.
  Logs and error reports carry ids, codes and routes only, never content.
- A bug fix starts with a test that fails for that bug, and its PR names the error reference that found it.
- A decision that shapes the product or how it is built gets a row in `docs/decisions.md` in the same
  change: what, why, who decided, where. Append; never rewrite an old row.
- A change to how the app looks is not done until it has been looked at: export the web build on
  mock data, screenshot the screens it touches at phone width, and fix what looks wrong before
  committing. Colours come only from `src/theme/tokens.ts`; `DESIGN_SYSTEM.md` changes with them.
- No secrets in the repo. The service role key is used by nothing in the app, repo or workflows.
- When behaviour or setup changes, update `README.md`, `ARCHITECTURE.md`, `ROADMAP.md` and, for
  anything about running it live, `OPERATIONS.md`, in the same change.
