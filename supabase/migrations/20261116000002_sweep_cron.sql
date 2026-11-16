-- The clock, as code: run sweep_invites() every minute with pg_cron, so that asks expire and
-- missed check-ins become flakes without anyone clicking in the dashboard.
--
-- pg_cron ships with Supabase (hosted and `supabase start`). The throwaway Postgres in tests/db
-- has no such extension; there tests/db/supabase_shim.sql provides a stand-in `cron.schedule`
-- that records the job, so this file runs unchanged in both places.

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
  end if;
end $$;

-- Naming the job makes this idempotent: scheduling the same name again replaces it.
select cron.schedule('pinkilock-sweep', '* * * * *', 'select public.sweep_invites()');
