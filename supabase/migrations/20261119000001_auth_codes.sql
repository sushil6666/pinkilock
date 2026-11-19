-- Sign-in codes that say nothing about who has an account (gap G22, decision D091).
--
-- The app no longer asks Auth for a code itself. It asks the `auth-code` Edge Function, which asks
-- public.auth_code_check (service role only) whether to send, and answers the app the same way
-- whatever the answer was:
--   * signing back in: send only when an account (not an anonymous one) has that email or number;
--   * adding an email or number to my account: send only when no other account has it.
-- Either way the app shows "if it can be used, a code is on its way". A code that was never sent
-- simply never matches (PA006), exactly like a mistyped one.
--
-- Every request counts, by a hash of the address and by the caller (their account, or a hash of
-- their network address when signed out), so the function cannot be used to test many addresses or
-- to run up texts: at most 3 a quarter-hour and one a minute for an address, 10 an hour for a caller.

create table private.auth_code_requests (
  id bigint generated always as identity primary key,
  address_key text not null,
  caller_key text not null,
  at timestamptz not null default now()
);
create index auth_code_requests_address_idx on private.auth_code_requests (address_key, at);
create index auth_code_requests_caller_idx on private.auth_code_requests (caller_key, at);
revoke all on private.auth_code_requests from public, anon, authenticated;
select cron.schedule('pinkilock-auth-code-retention', '47 3 * * *', $$delete from private.auth_code_requests where at < now() - interval '1 day'$$);

create or replace function public.auth_code_check(p_kind text, p_address text, p_mode text, p_caller text, p_user uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_address text := lower(trim(coalesce(p_address, '')));
  v_key text;
  v_owner uuid;
begin
  if p_kind not in ('email', 'phone') or p_mode not in ('sign_in', 'link') or v_address = '' or coalesce(p_caller, '') = '' then
    raise exception using errcode = 'PL111', message = 'That sign-in request was not valid.';
  end if;
  if p_mode = 'link' and p_user is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  -- Auth keeps phone numbers without the +.
  if p_kind = 'phone' then v_address := regexp_replace(v_address, '^\+', ''); end if;
  -- The address is never stored, only a hash of it.
  v_key := encode(sha256(convert_to(p_kind || ':' || v_address, 'UTF8')), 'hex');

  perform pg_advisory_xact_lock(hashtext('auth-code:' || v_key));
  if exists (select 1 from private.auth_code_requests where address_key = v_key and at > now() - interval '1 minute')
     or (select count(*) from private.auth_code_requests where address_key = v_key and at > now() - interval '15 minutes') >= 3
     or (select count(*) from private.auth_code_requests where caller_key = p_caller and at > now() - interval '1 hour') >= 10 then
    raise exception using errcode = 'PL112', message = 'Wait a few minutes before asking for another code.';
  end if;
  insert into private.auth_code_requests (address_key, caller_key) values (v_key, p_caller);

  select u.id into v_owner from auth.users u
  where not coalesce(u.is_anonymous, false)
    and case when p_kind = 'email' then lower(u.email) = v_address else u.phone = v_address end
  limit 1;

  if p_mode = 'sign_in' then
    return case when v_owner is not null then 'send' else 'skip' end;
  end if;
  -- Linking: someone else's address gets nothing; my own, or a free one, gets a code.
  return case when v_owner is null or v_owner = p_user then 'send' else 'skip' end;
end $$;
revoke all on function public.auth_code_check(text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.auth_code_check(text, text, text, text, uuid) to service_role;
