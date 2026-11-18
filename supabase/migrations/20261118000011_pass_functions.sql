-- Passing on someone, and looking again at the people passed, become functions (docs/build-plan.md,
-- WP0b and WP1): the last direct table writes from the app. They now carry the tap's trace id like
-- every other change, and the API roles keep only the right to read their own passes. The daily
-- limit (private.count_pass, PL028) still runs on every insert.
create or replace function public.pass_profile(p_profile uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_profile is null or p_profile = me then return; end if;
  if not exists (select 1 from profiles where id = p_profile) then
    raise exception using errcode = 'PL003', message = 'That person is not around any more.';
  end if;
  insert into passes (profile_id, passed_id) values (me, p_profile) on conflict do nothing;
end $$;

create or replace function public.restore_passes()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  delete from passes where profile_id = me;
end $$;

revoke all on function public.pass_profile(uuid), public.restore_passes() from public, anon;
grant execute on function public.pass_profile(uuid), public.restore_passes() to authenticated;
revoke insert, update, delete on public.passes from authenticated;
