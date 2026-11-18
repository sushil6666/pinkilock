-- Fair handle flags (D079). Sushil saw that someone could flag a handle that works, out of spite,
-- and it would cost the owner at once. Now:
-- 1. A verified handle (sent a code from that account, D078) cannot be flagged (PL103).
-- 2. A flag waits 7 days. private.settle_contact_reports, hourly, then decides it:
--      cleared  the owner verified the handle or changed it in that time: nothing counts;
--      ignored  the person who flagged has flagged 3 or more times and on more than half of their
--               kept promises: their flags are not believed;
--      counted  otherwise: a `bad_contact` event on the owner, which the trust pipeline weighs 1.0.
-- 3. my_contact_flags counts only the flags still waiting on the handle I have now, so the app can
--    tell me to verify or fix it before they count.

alter table public.contact_reports add column outcome text check (outcome in ('counted', 'cleared', 'ignored'));
alter table public.contact_reports add column decided_at timestamptz;

create or replace function public.report_bad_contact(p_invite uuid, p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  v_handle text;
  v_verified timestamptz;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_owner is null or p_owner = me or private.blocked_pair(me, p_owner) or not exists (
    select 1 from invites i
    where i.id = p_invite and i.status = 'kept' and i.resolved_at > now() - interval '7 days' and (
      (i.from_friend is null and ((i.from_id = me and i.to_id = p_owner) or (i.to_id = me and i.from_id = p_owner)))
      or (i.from_friend is not null
          and me = any (i.check_ins) and p_owner = any (i.check_ins)
          and ((me in (i.from_id, i.from_friend) and p_owner in (i.to_id, i.to_friend))
               or (me in (i.to_id, i.to_friend) and p_owner in (i.from_id, i.from_friend)))))
  ) then
    raise exception using errcode = 'PL100', message = 'You can flag a handle only from a promise you kept this week.';
  end if;
  select contact_handle, contact_verified_at into v_handle, v_verified from profile_private where profile_id = p_owner;
  if v_verified is not null then
    raise exception using errcode = 'PL103', message = 'Their handle is verified: it was proved from that account.';
  end if;
  -- Nothing counts yet: settle_contact_reports decides after 7 days.
  insert into contact_reports (invite_id, reporter_id, owner_id, handle) values (p_invite, me, p_owner, coalesce(v_handle, ''))
  on conflict do nothing;
end $$;
revoke all on function public.report_bad_contact(uuid, uuid) from public, anon;
grant execute on function public.report_bad_contact(uuid, uuid) to authenticated;

-- Waiting flags on the handle I have now. Who flagged it is never said.
create or replace function public.my_contact_flags()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int from contact_reports r join profile_private p on p.profile_id = r.owner_id
  where r.owner_id = auth.uid() and r.handle = p.contact_handle and r.outcome is null and p.contact_verified_at is null;
$$;
revoke all on function public.my_contact_flags() from public, anon;
grant execute on function public.my_contact_flags() to authenticated;

create or replace function private.settle_contact_reports()
returns integer language plpgsql security definer set search_path = public as $$
declare
  r contact_reports;
  v_outcome text;
  n int := 0;
begin
  for r in select * from contact_reports where outcome is null and at < now() - interval '7 days' for update skip locked loop
    if not exists (select 1 from profile_private p where p.profile_id = r.owner_id and p.contact_handle = r.handle and p.contact_verified_at is null) then
      v_outcome := 'cleared';
    elsif (select count(*) from contact_reports x where x.reporter_id = r.reporter_id) >= 3
          and (select count(*) from contact_reports x where x.reporter_id = r.reporter_id)
              > (select count(*) from events e where e.actor_id = r.reporter_id and e.type = 'kept') / 2.0 then
      v_outcome := 'ignored';
    else
      v_outcome := 'counted';
      insert into events (actor_id, invite_id, type, props) values (r.owner_id, r.invite_id, 'bad_contact', '{}');
    end if;
    update contact_reports set outcome = v_outcome, decided_at = now()
    where invite_id = r.invite_id and reporter_id = r.reporter_id and owner_id = r.owner_id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function private.settle_contact_reports() from public, anon, authenticated;

select cron.schedule('pinkilock-settle-contact-reports', '47 * * * *', 'select private.settle_contact_reports()');
