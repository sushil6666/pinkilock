-- Realtime for profiles: a live project starts empty and people appear as they onboard, so a
-- phone that is already open has to hear about the second person without a restart. RLS still
-- applies to the feed (profiles are readable by any signed-in user, nothing private is in them).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;
