# Pinkilock

A one-on-one pre-dating app built on a pinky promise. No swiping deck, no chat: you ask one person
to one tiny plan with a time on it, you both lock pinkies, you both show up. Android and iOS from
one Expo codebase.

- `ARCHITECTURE.md`: how the app, Supabase and the DuckDB worker fit together
- `DESIGN_SYSTEM.md`: colours, type, components and the exact spec of the lock gesture

## Run it on your phone (mock data, no accounts needed)

Needs Node 18.18 or newer and the Expo Go app (SDK 52) on the phone.

```bash
npm install
npx expo start          # scan the QR code with Expo Go (Android) or the Camera app (iOS)
```

On WSL, the phone cannot reach the laptop's dev server directly: use `npx expo start --tunnel`.

With no keys set, the app runs on ten made-up people who answer by themselves. A good first pass:

1. Onboard (five short steps, ends with a hold to swear the promise).
2. **Asks**: open Aanya's boba run, tap **Lock it**, slide your pinky in. She seals it about two
   seconds later.
3. **Plans**: the plan with Ira starts in four minutes, so check-in is already open. Check in,
   Ira follows, and the reveal opens.
4. **Discover**: send someone a vibe check. They answer in about seven seconds; then you seal.
   Nikhil always passes, so you can see that too.
5. On any locked plan: **Can't make it** shows what a bail costs. **Me** has the reset.

## Go live on Supabase

1. Create a Supabase project. In Authentication, Providers, turn on **Anonymous sign-ins**.
2. Run `supabase/schema.sql` in the SQL editor.
3. Schedule the clock (Database, Extensions: enable `pg_cron`):
   `select cron.schedule('pinkilock-sweep', '* * * * *', 'select public.sweep_invites()');`
4. Copy `.env.example` to `.env`, fill in the project URL and anon key, restart `npx expo start`.

The **Me** tab shows which backend is in use. A live project starts empty: people appear in
Discover as they onboard, so try it with two phones.

## Analytics worker (DuckDB)

```bash
pip install -r analytics/requirements.txt
# once, in the Supabase SQL editor:  alter role pinkilock_analytics login password '...';
export PINKILOCK_PG_DSN="postgresql://pinkilock_analytics:...@db.<ref>.supabase.co:5432/postgres"
python analytics/duckdb_pipeline.py --dry-run     # compute and print only
python analytics/duckdb_pipeline.py               # write trust_scores and analytics.* back
```

Run it every few minutes. Trust badges in live mode read what it writes.

## Checks

```bash
npm run typecheck
pip install pgserver duckdb && python tests/db/run.py    # schema, RLS, functions, pipeline on a throwaway Postgres
```

## Status

Verified: TypeScript strict passes; Metro bundles for Android and web; the whole mock flow
(onboarding, lock by dragging, partner sealing, check-in, reveal, sending an ask, sealing, bail)
was driven end to end in headless Chromium on the web build; the database checks above pass,
including the DuckDB pipeline writing scores back.

Not yet verified: a run on a physical Android or iOS device (haptics, safe areas and 60fps can
only be judged there), and the Supabase client against a real project (`supabaseBackend.ts` is
typechecked and matches the tested schema, but has not talked to a live Supabase).

There is no app icon or splash artwork yet, and the video room named in video plans is not built.
