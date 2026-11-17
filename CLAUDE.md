# Pinkilock: notes for Claude Code

A one-on-one pre-dating app built on a pinky promise: Expo app, Supabase backend, push via an
Edge Function, DuckDB analytics worker, everything deployed by GitHub Actions.

Read first: `README.md` (run and deploy), `ARCHITECTURE.md` (how it fits together),
`DESIGN_SYSTEM.md` (look, motion, the lock gesture), `ROADMAP.md` (phases and what is next),
`OPERATIONS.md` (secrets, workflows, shipping changes, health checks, fixing incidents).

## Commands

```bash
npm install
npx expo start --tunnel     # WSL: the phone cannot reach the dev server otherwise
npm run typecheck
python tests/db/run.py      # migrations, RLS, functions, push outbox, pipeline on a throwaway Postgres
npm run db:start            # local Supabase in Docker
npm run test:live:local     # two users through the live backend, locally
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
  is a row in both (a new migration), and gets an opener in `OPENERS`.
- Schema changes are new migrations (`npx supabase migration new <name>`). Never edit a migration
  that has been applied.
- The reveal is enforced by RLS, not by the UI. Never fetch, cache or push a contact handle or a
  private photo that RLS would hide. Pushes are sent only by the server.
- Deploys happen through GitHub Actions from `main`, never by hand in the Supabase dashboard and
  never from a branch. Work on a branch and open a PR; do not add trigger files or branch triggers
  to workflows.
- Check GitHub state (PRs, runs, branches) before acting on it; it changes outside the session.
- No secrets in the repo. The service role key is used by nothing in the app, repo or workflows.
- When behaviour or setup changes, update `README.md`, `ARCHITECTURE.md`, `ROADMAP.md` and, for
  anything about running it live, `OPERATIONS.md`, in the same change.
