-- Talk mode (D107), the free first call (D108). "Feeling alone? Talk to someone": an AI companion
-- and verified listeners, next to Self love. The same rules are in src/domain/talk.ts (the mock
-- follows it); tests/db/talk_cases.sql runs the shared tables through both.
--
--   * Nothing here reads or writes Spicy mode, Discover, cards, invites or Trust Scores, and nothing
--     here reaches the analytics worker. Talk mode is never shown to anyone else.
--   * The AI companion: the `talk` Edge Function asks Claude, after talk_ai_turn (service role only)
--     has said yes and charged. A minute costs 3 credits when I sent something in it (earned
--     credits first), or a day pass is 49. A mention of self-harm (private.mentions_harm, or the AI
--     noticing, talk_ai_flag) stops charging for the rest of that chat. The words are never stored
--     here: only the chat's id, its minutes and whether it was flagged.
--   * Listeners: a verified adult (18+, a phone or an email on the account) who applied with a
--     first name, whom they take calls from and what they can talk about, agreed to the listener
--     code, passed Razorpay Route's KYC (PAN and bank, through the Edge Function; only the last four
--     digits of the account are kept) and was checked by a person (talk_listener_verify).
--   * A call: bought credits for the longest length are held; the timer counts a minute when both
--     apps checked in during it (every 20 seconds); only those minutes are charged. Nobody answers
--     in 60 seconds, or nobody checks in for 90: it ends. Either can end, report or block at any
--     time. A report blocks the pair in Talk mode, goes where no client can read it, and holds the
--     listener's payout for a person.
--   * Payouts: 60% of what a call is worth to the listener, less TDS (194-O), through Razorpay
--     Route; 40% to Pinkilock, GST included (private.talk_split). Held for 7 days first. Payout rows
--     stay for the books when an account goes, without the person's id.
--   * The free first call (D108): once, up to 15 minutes, unlocked by a friend who joined with my
--     link and verified (a phone or an email), or by a finished profile (a checked face photo, a
--     verified handle, a plan I am up for). Pinkilock pays the listener for it. Never for a rating.
--   * Credits move only through private.wallet_move (20261125000003_wallet.sql).
--   * Everything about me is in the data download (format 11) and goes with the account.

create table private.talk_people (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sex text check (sex in ('woman', 'man', 'unsaid')),
  want text not null default 'anyone' check (want in ('opposite', 'same', 'anyone')),
  pass_until timestamptz,
  free_call text not null default 'locked' check (free_call in ('locked', 'ready', 'used')),
  free_reason text check (free_reason in ('referral', 'profile')),
  free_at timestamptz,
  last_ai_at timestamptz
);

create table private.talk_referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$')
);

-- One referrer per friend, ever.
create table private.talk_referrals (
  friend uuid primary key references auth.users (id) on delete cascade,
  referrer uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  check (friend <> referrer)
);
create index talk_referrals_referrer_idx on private.talk_referrals (referrer);

-- An AI chat: its minutes and whether it was flagged. Never its words.
create table private.talk_ai_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  messages int not null default 0,
  harm boolean not null default false
);
create index talk_ai_chats_user_idx on private.talk_ai_chats (user_id, last_at desc);
create table private.talk_ai_minutes (
  chat_id uuid not null references private.talk_ai_chats (id) on delete cascade,
  minute timestamptz not null,
  credits int not null,
  primary key (chat_id, minute)
);
create table private.talk_ai_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  messages int not null default 0,
  primary key (user_id, day)
);

create table private.talk_listeners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status text not null default 'applied' check (status in ('applied', 'checking', 'verified', 'paused', 'removed')),
  first_name text not null check (char_length(first_name) between 2 and 20 and first_name !~ '[0-9@:/\s]'),
  sex text not null check (sex in ('woman', 'man', 'unsaid')),
  accepts text not null check (accepts in ('women', 'men', 'anyone')),
  topics text[] not null check (cardinality(topics) between 1 and 4 and topics <@ array['lonely', 'stress', 'breakup', 'family', 'work', 'exams', 'new_city', 'just_talk']),
  code_version int not null,
  available_until timestamptz,
  route_account text check (route_account ~ '^acc_[A-Za-z0-9]{6,30}$'),
  bank_last4 text check (bank_last4 ~ '^[0-9]{4}$'),
  applied_at timestamptz not null default now(),
  verified_at timestamptz
);

create table private.talk_calls (
  id uuid primary key default gen_random_uuid(),
  caller uuid not null references auth.users (id) on delete cascade,
  listener uuid not null references auth.users (id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing', 'live', 'done')),
  length int not null check (length in (10, 15, 20, 30)),
  free boolean not null default false,
  hold int not null default 0 check (hold >= 0),
  rang_at timestamptz not null default now(),
  started_at timestamptz,
  beat_caller timestamptz,
  beat_listener timestamptz,
  ended_at timestamptz,
  end_reason text check (end_reason in ('talked', 'missed', 'declined', 'ended_early', 'reported', 'blocked', 'gone')),
  ended_by uuid,
  together int not null default 0,
  charged int not null default 0,
  refunded int not null default 0,
  check (caller <> listener),
  check ((status = 'done') = (end_reason is not null)),
  check (not free or hold = 0)
);
-- One open call each, on either side.
create unique index talk_calls_caller_open_idx on private.talk_calls (caller) where status <> 'done';
create unique index talk_calls_listener_open_idx on private.talk_calls (listener) where status <> 'done';
create index talk_calls_listener_idx on private.talk_calls (listener, rang_at desc);
create index talk_calls_caller_idx on private.talk_calls (caller, rang_at desc);

create table private.talk_minutes (
  call_id uuid not null references private.talk_calls (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  minute timestamptz not null,
  primary key (call_id, user_id, minute)
);

-- A payout record. The listener's id goes when the account does; the rest stays for the books.
create table private.talk_payouts (
  call_id uuid primary key,
  listener uuid references auth.users (id) on delete set null,
  route_account text,
  minutes int not null,
  free boolean not null,
  gross int not null,
  host int not null,
  pinkilock int not null,
  gst int not null,
  tds int not null,
  payout int not null,
  status text not null default 'waiting' check (status in ('waiting', 'held', 'sending', 'sent', 'failed')),
  transfer_id text,
  due_at timestamptz not null default now() + interval '7 days',
  at timestamptz not null default now(),
  sent_at timestamptz
);

create table private.talk_blocks (
  user_id uuid not null references auth.users (id) on delete cascade,
  other uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  primary key (user_id, other)
);

-- Read by no client role; a person at Pinkilock reads them.
create table private.talk_reports (
  id bigint generated always as identity primary key,
  call_id uuid,
  reporter uuid references auth.users (id) on delete set null,
  reported uuid references auth.users (id) on delete set null,
  reporter_was text not null check (reporter_was in ('caller', 'listener')),
  reason text not null check (reason in ('sexual', 'contact', 'meet', 'money', 'abuse', 'unsafe', 'other')),
  at timestamptz not null default now(),
  handled_at timestamptz
);

alter table private.talk_people enable row level security;
alter table private.talk_referral_codes enable row level security;
alter table private.talk_referrals enable row level security;
alter table private.talk_ai_chats enable row level security;
alter table private.talk_ai_minutes enable row level security;
alter table private.talk_ai_days enable row level security;
alter table private.talk_listeners enable row level security;
alter table private.talk_calls enable row level security;
alter table private.talk_minutes enable row level security;
alter table private.talk_payouts enable row level security;
alter table private.talk_blocks enable row level security;
alter table private.talk_reports enable row level security;
revoke all on private.talk_people, private.talk_referral_codes, private.talk_referrals, private.talk_ai_chats, private.talk_ai_minutes, private.talk_ai_days,
  private.talk_listeners, private.talk_calls, private.talk_minutes, private.talk_payouts, private.talk_blocks, private.talk_reports
  from public, anon, authenticated, service_role;

-- The wallet learns four kinds of row.
alter table private.wallet_ledger drop constraint wallet_ledger_kind_check;
alter table private.wallet_ledger add constraint wallet_ledger_kind_check check (kind in (
  'spicy_unlock', 'spicy_back', 'topup', 'topup_refund', 'boost', 'extra_ask', 'stake', 'stake_back', 'stake_lost', 'treat', 'treat_back', 'reward',
  'talk_ai', 'talk_pass', 'talk_hold', 'talk_back'));

-- ---------------------------------------------------------------------------------------------
-- The shared rules, as talkMatch, mentionsHarm and talkSplit in src/domain/talk.ts.
-- ---------------------------------------------------------------------------------------------
create or replace function private.talk_match(p_caller_sex text, p_want text, p_listener_sex text, p_accepts text)
returns boolean language sql immutable set search_path = '' as $$
  select case
    when p_accepts = 'women' and p_caller_sex is distinct from 'woman' then false
    when p_accepts = 'men' and p_caller_sex is distinct from 'man' then false
    when p_want = 'anyone' then true
    when p_caller_sex not in ('woman', 'man') or p_listener_sex not in ('woman', 'man') then false
    when p_want = 'same' then p_caller_sex = p_listener_sex
    else p_caller_sex <> p_listener_sex
  end;
$$;

create or replace function private.harm_text(p_text text)
returns text language sql immutable set search_path = '' as $$
  select ' ' || btrim(regexp_replace(regexp_replace(lower(coalesce(p_text, '')),
    '[^a-z0-9\u0080-￿]|[ ‘’“”…।॥]', ' ', 'g'), ' +', ' ', 'g')) || ' ';
$$;

-- The list is HARM_PHRASES in src/domain/talk.ts; the unit test checks this copy matches it.
create or replace function private.mentions_harm(p_text text)
returns boolean language sql immutable set search_path = '' as $$
  select exists (select 1 from unnest(array[
    'suicide', 'suicidal', 'kill myself', 'killing myself', 'end my life', 'end it all', 'take my life', 'take my own life',
    'want to die', 'wanna die', 'better off dead', 'no reason to live', 'dont want to live', 'don t want to live', 'do not want to live',
    'hurt myself', 'hurting myself', 'harm myself', 'self harm', 'selfharm', 'cut myself', 'cutting myself', 'overdose',
    'hang myself', 'jump off', 'not worth living', 'kms',
    'marna chahta', 'marna chahti', 'mar jaun', 'mar jaau', 'mar jaana', 'khudkushi', 'aatmahatya', 'atmahatya', 'jeena nahi', 'jina nahi',
    'खुदकुशी', 'आत्महत्या', 'मरना चाहता', 'मरना चाहती', 'मर जाऊं', 'मर जाऊँ', 'जीना नहीं'
  ]) p where strpos(private.harm_text(p_text), ' ' || p || ' ') > 0);
$$;

create or replace function private.talk_split(p_minutes int,
  out gross int, out host int, out pinkilock int, out gst int, out tds int, out payout int)
language plpgsql immutable set search_path = '' as $$
begin
  gross := p_minutes * 10 * 76;
  host := floor(gross * 60 / 100.0)::int;
  pinkilock := gross - host;
  gst := round(pinkilock * 18 / 118.0)::int;
  tds := ceil(gross * 10 / 10000.0)::int;
  payout := host - tds;
end $$;
revoke all on function private.talk_match(text, text, text, text), private.harm_text(text), private.mentions_harm(text), private.talk_split(int)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------------------------
create or replace function private.talk_blocked(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select private.blocked_pair(p_a, p_b)
    or exists (select 1 from private.talk_blocks where (user_id = p_a and other = p_b) or (user_id = p_b and other = p_a));
$$;
revoke all on function private.talk_blocked(uuid, uuid) from public, anon, authenticated;

-- The person's first name, for the listener to see: the first word of the card's name.
create or replace function private.talk_first_name(p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(split_part(btrim(name), ' ', 1), '') from profiles where id = p_user;
$$;
revoke all on function private.talk_first_name(uuid) from public, anon, authenticated;

-- My row, made on first use, and the free call opened when it has been earned.
create or replace function private.talk_person(p_user uuid)
returns private.talk_people language plpgsql security definer set search_path = public as $$
declare
  p private.talk_people;
  why text;
begin
  insert into private.talk_people (user_id) values (p_user) on conflict do nothing;
  select * into p from private.talk_people where user_id = p_user for update;
  if p.free_call = 'locked' then
    if exists (select 1 from private.talk_referrals r where r.referrer = p_user and private.is_linked(r.friend) and exists (select 1 from profiles where id = r.friend)) then
      why := 'referral';
    elsif exists (select 1 from photos where profile_id = p_user and kind = 'face' and status = 'approved')
      and exists (select 1 from profile_private where profile_id = p_user and contact_verified_at is not null)
      and exists (select 1 from profiles where id = p_user and cardinality(idea_ids) > 0) then
      why := 'profile';
    end if;
    if why is not null then
      update private.talk_people set free_call = 'ready', free_reason = why, free_at = now() where user_id = p_user returning * into p;
    end if;
  end if;
  return p;
end $$;
revoke all on function private.talk_person(uuid) from public, anon, authenticated;

create or replace function private.talk_code(p_user uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  c text;
  abc text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  select code into c from private.talk_referral_codes where user_id = p_user;
  while c is null loop
    c := array_to_string(array(select substr(abc, 1 + floor(random() * 31)::int, 1) from generate_series(1, 8)), '');
    begin
      insert into private.talk_referral_codes (user_id, code) values (p_user, c);
    exception when unique_violation then
      c := null;
      select code into c from private.talk_referral_codes where user_id = p_user;
    end;
  end loop;
  return c;
end $$;
revoke all on function private.talk_code(uuid) from public, anon, authenticated;

-- Minutes both apps checked in, up to the call's length.
create or replace function private.talk_together(p_call uuid)
returns int language sql stable security definer set search_path = public as $$
  select least(count(*)::int, (select length from private.talk_calls where id = p_call)) from private.talk_minutes x
  join private.talk_calls c on c.id = x.call_id and x.user_id = c.caller
  where x.call_id = p_call
    and exists (select 1 from private.talk_minutes y where y.call_id = p_call and y.user_id = c.listener and y.minute = x.minute);
$$;
revoke all on function private.talk_together(uuid) from public, anon, authenticated;

-- Ends a call: what was not talked comes back to the caller; the listener's part waits to be paid.
create or replace function private.talk_settle(p_call uuid, p_end text, p_by uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  c private.talk_calls;
  n int;
  cost int;
  s record;
begin
  select * into c from private.talk_calls where id = p_call for update;
  if not found or c.status = 'done' then return; end if;
  n := case when c.status = 'live' then private.talk_together(c.id) else 0 end;
  cost := case when c.free then 0 else n * 10 end;
  if c.hold - cost > 0 then perform private.wallet_move(c.caller, 'talk_back', c.hold - cost, 0, c.id::text); end if;
  if n > 0 then
    select * into s from private.talk_split(n);
    insert into private.talk_payouts (call_id, listener, route_account, minutes, free, gross, host, pinkilock, gst, tds, payout, status)
    select c.id, c.listener, l.route_account, n, c.free, s.gross, s.host, s.pinkilock, s.gst, s.tds, s.payout,
      case when p_end = 'reported' and p_by = c.caller then 'held' else 'waiting' end
    from private.talk_listeners l where l.user_id = c.listener
    on conflict (call_id) do nothing;
    if c.free then update private.talk_people set free_call = 'used' where user_id = c.caller; end if;
  end if;
  update private.talk_calls set status = 'done', end_reason = p_end, ended_by = p_by, ended_at = now(), together = n, charged = cost,
    refunded = greatest(c.hold - cost, 0)
  where id = c.id;
end $$;
revoke all on function private.talk_settle(uuid, text, uuid) from public, anon, authenticated;

-- Calls nobody answered, and calls everyone left. Every minute, and on each read.
create or replace function private.talk_sweep()
returns int language plpgsql security definer set search_path = public as $$
declare
  c private.talk_calls;
  n int := 0;
begin
  for c in select * from private.talk_calls where status <> 'done' and (
      (status = 'ringing' and rang_at < now() - interval '60 seconds')
      or (status = 'live' and greatest(coalesce(beat_caller, started_at), coalesce(beat_listener, started_at)) < now() - interval '90 seconds')
      or (status = 'live' and started_at < now() - make_interval(mins => length + 5)))
    for update skip locked loop
    perform private.talk_settle(c.id, case when c.status = 'ringing' then 'missed' when private.talk_together(c.id) >= c.length then 'talked' else 'gone' end);
    n := n + 1;
  end loop;
  update private.talk_listeners set available_until = null where available_until < now();
  return n;
end $$;
revoke all on function private.talk_sweep() from public, anon, authenticated;
select cron.schedule('pinkilock-talk', '* * * * *', 'select private.talk_sweep()');

-- A call, from one side.
create or replace function private.talk_call_view(p_user uuid, c private.talk_calls)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.id is null then null else jsonb_build_object(
    'id', c.id,
    'status', c.status,
    'listening', c.listener = p_user,
    'name', case when c.listener = p_user then private.talk_first_name(c.caller) else (select first_name from private.talk_listeners where user_id = c.listener) end,
    'length', c.length,
    'free', c.free,
    'started_at', c.started_at,
    'together', case when c.status = 'done' then c.together else coalesce(private.talk_together(c.id), 0) end,
    'they_here', coalesce(case when c.listener = p_user then c.beat_caller else c.beat_listener end > now() - interval '45 seconds', false),
    'end', c.end_reason,
    'charged', case when c.caller = p_user then c.charged else 0 end,
    'refunded', case when c.caller = p_user then c.refunded else 0 end) end;
$$;
revoke all on function private.talk_call_view(uuid, private.talk_calls) from public, anon, authenticated;

create or replace function private.talk_state(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p private.talk_people := private.talk_person(p_user);
  c private.talk_calls;
  l private.talk_listeners;
begin
  select * into c from private.talk_calls where p_user in (caller, listener)
    and (status <> 'done' or ended_at > now() - interval '10 minutes') order by (status <> 'done') desc, rang_at desc limit 1;
  select * into l from private.talk_listeners where user_id = p_user;
  return jsonb_build_object(
    'sex', p.sex,
    'want', p.want,
    'pass_until', case when p.pass_until > now() then p.pass_until end,
    'ai_today', coalesce((select messages from private.talk_ai_days where user_id = p_user and day = private.local_today(p_user)), 0),
    'free_call', p.free_call,
    'free_reason', p.free_reason,
    'profile', jsonb_build_object(
      'face', exists (select 1 from photos where profile_id = p_user and kind = 'face' and status = 'approved'),
      'handle', exists (select 1 from profile_private where profile_id = p_user and contact_verified_at is not null),
      'plans', exists (select 1 from profiles where id = p_user and cardinality(idea_ids) > 0)),
    'referral_code', private.talk_code(p_user),
    'friends_joined', (select count(*) from private.talk_referrals where referrer = p_user),
    'friends_verified', (select count(*) from private.talk_referrals r where r.referrer = p_user and private.is_linked(r.friend)),
    'paid', coalesce((select paid from private.wallets where user_id = p_user), 0),
    'balance', coalesce((select paid + earned from private.wallets where user_id = p_user), 0),
    'listener', case when l.user_id is null then null else jsonb_build_object(
      'status', l.status, 'first_name', l.first_name, 'sex', l.sex, 'accepts', l.accepts, 'topics', to_jsonb(l.topics),
      'available_until', case when l.available_until > now() then l.available_until end, 'code_version', l.code_version, 'bank_last4', l.bank_last4,
      'calls', (select count(*) from private.talk_calls x where x.listener = p_user and x.together > 0),
      'paid_out', coalesce((select sum(payout) from private.talk_payouts x where x.listener = p_user and x.status = 'sent'), 0),
      'pending', coalesce((select sum(payout) from private.talk_payouts x where x.listener = p_user and x.status in ('waiting', 'held', 'sending', 'failed')), 0)) end,
    'call', private.talk_call_view(p_user, c));
end $$;
revoke all on function private.talk_state(uuid) from public, anon, authenticated;

-- My open call by id, on my side: PL166 otherwise.
create or replace function private.talk_my_call(p_user uuid, p_call uuid)
returns private.talk_calls language plpgsql security definer set search_path = public as $$
declare
  c private.talk_calls;
begin
  select * into c from private.talk_calls where id = p_call and p_user in (caller, listener) and status <> 'done' for update;
  if not found then raise exception using errcode = 'PL166', message = 'There is no call to do that on right now.'; end if;
  return c;
end $$;
revoke all on function private.talk_my_call(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- For the app (signed in, with a profile)
-- ---------------------------------------------------------------------------------------------
create or replace function public.talk_state()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  perform private.talk_sweep();
  return private.talk_state(me);
end $$;

-- Who I am (to match listeners) and whom I would like to talk to. "Opposite" and "same" need woman or man.
create or replace function public.talk_settings(p_sex text, p_want text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  if p_sex is null or p_sex not in ('woman', 'man', 'unsaid') or p_want is null or p_want not in ('opposite', 'same', 'anyone')
    or (p_sex = 'unsaid' and p_want <> 'anyone') then
    raise exception using errcode = 'PL154', message = 'Tell us who you are and whom you would like to talk to.';
  end if;
  perform private.talk_person(me);
  update private.talk_people set sex = p_sex, want = p_want where user_id = me;
  return private.talk_state(me);
end $$;

-- A day of the AI companion.
create or replace function public.talk_ai_pass()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  p private.talk_people := private.talk_person(me);
begin
  if p.pass_until > now() then raise exception using errcode = 'PL172', message = 'Your day pass is still on.'; end if;
  perform private.wallet_spend(me, 'talk_pass', 49, 'pass:' || to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS'));
  update private.talk_people set pass_until = now() + interval '24 hours' where user_id = me;
  return private.talk_state(me);
end $$;

-- Listeners free now who would take a call from me, as I asked; never anyone blocked either way.
create or replace function public.talk_listeners()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  p private.talk_people := private.talk_person(me);
begin
  if p.sex is null then raise exception using errcode = 'PL154', message = 'Tell us who you are and whom you would like to talk to.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', l.user_id, 'first_name', l.first_name, 'sex', l.sex, 'topics', to_jsonb(l.topics),
      'calls', (select count(*) from private.talk_calls x where x.listener = l.user_id and x.together > 0)) order by l.verified_at)
    from private.talk_listeners l
    where l.status = 'verified' and l.available_until > now() and l.user_id <> me and l.code_version >= 1
      and private.talk_match(p.sex, p.want, l.sex, l.accepts)
      and not private.talk_blocked(me, l.user_id)
      and not exists (select 1 from private.talk_calls x where x.listener = l.user_id and x.status <> 'done')), '[]');
end $$;

-- Ring a listener. Bought credits for the whole length are held; a free call holds none.
create or replace function public.talk_call(p_listener uuid, p_length int, p_free boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  p private.talk_people := private.talk_person(me);
  l private.talk_listeners;
  len int := case when p_free then 15 else p_length end;
  cid uuid;
begin
  perform private.talk_sweep();
  if p.sex is null then raise exception using errcode = 'PL154', message = 'Tell us who you are and whom you would like to talk to.'; end if;
  if not p_free and (p_length is null or p_length not in (10, 20, 30)) then
    raise exception using errcode = 'PL156', message = 'Pick a call length: 10, 20 or 30 minutes.';
  end if;
  if p_free and p.free_call <> 'ready' then raise exception using errcode = 'PL167', message = 'Your free call is not unlocked yet.'; end if;
  if exists (select 1 from private.talk_calls where me in (caller, listener) and status <> 'done') then
    raise exception using errcode = 'PL170', message = 'You are on a call already.';
  end if;
  select * into l from private.talk_listeners where user_id = p_listener for update;
  if not found or l.status <> 'verified' or not coalesce(l.available_until > now(), false) or p_listener = me
    or not private.talk_match(p.sex, p.want, l.sex, l.accepts) or private.talk_blocked(me, p_listener)
    or exists (select 1 from private.talk_calls where listener = p_listener and status <> 'done') then
    raise exception using errcode = 'PL155', message = 'That listener is not free right now. Try another.';
  end if;
  insert into private.talk_calls (caller, listener, length, free, hold) values (me, p_listener, len, p_free, case when p_free then 0 else len * 10 end)
    returning id into cid;
  if not p_free then
    if coalesce((select paid from private.wallets where user_id = me), 0) < len * 10 then
      raise exception using errcode = 'PL139', message = 'This is paid from bought credits. Top up first.';
    end if;
    perform private.wallet_move(me, 'talk_hold', -(len * 10), 0, cid::text);
  end if;
  return private.talk_state(me);
end $$;

-- The listener picks up, or says not now (everything held comes back).
create or replace function public.talk_answer(p_call uuid, p_yes boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  c private.talk_calls := private.talk_my_call(me, p_call);
begin
  if c.listener <> me or c.status <> 'ringing' then raise exception using errcode = 'PL166', message = 'There is no call to do that on right now.'; end if;
  if p_yes then
    update private.talk_calls set status = 'live', started_at = now(), beat_listener = now() where id = c.id;
  else
    perform private.talk_settle(c.id, 'declined', me);
  end if;
  return private.talk_state(me);
end $$;

-- The open app checks in during the call; at the length, it ends.
create or replace function public.talk_beat(p_call uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  c private.talk_calls := private.talk_my_call(me, p_call);
begin
  if c.status = 'ringing' then return private.talk_state(me); end if;
  insert into private.talk_minutes (call_id, user_id, minute) values (c.id, me, date_trunc('minute', now())) on conflict do nothing;
  if me = c.caller then update private.talk_calls set beat_caller = now() where id = c.id;
  else update private.talk_calls set beat_listener = now() where id = c.id; end if;
  if private.talk_together(c.id) >= c.length then perform private.talk_settle(c.id, 'talked'); end if;
  return private.talk_state(me);
end $$;

-- Either hangs up, at any time. A caller can cancel while it rings.
create or replace function public.talk_end(p_call uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  c private.talk_calls := private.talk_my_call(me, p_call);
begin
  perform private.talk_settle(c.id, case when c.status = 'ringing' then 'missed' when private.talk_together(c.id) > 0 then 'talked' else 'ended_early' end, me);
  return private.talk_state(me);
end $$;

-- Report: ends the call, blocks the pair in Talk mode, and a person reads it. A caller's report holds the payout.
create or replace function public.talk_report(p_call uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  c private.talk_calls;
  other uuid;
begin
  if p_reason is null or p_reason not in ('sexual', 'contact', 'meet', 'money', 'abuse', 'unsafe', 'other') then
    raise exception using errcode = 'PL173', message = 'Pick what happened.';
  end if;
  -- An open call, or one that ended in the last day.
  select * into c from private.talk_calls where id = p_call and me in (caller, listener) and (status <> 'done' or ended_at > now() - interval '24 hours');
  if not found then raise exception using errcode = 'PL166', message = 'There is no call to do that on right now.'; end if;
  if (select count(*) from private.talk_reports where reporter = me and at > now() - interval '1 day') >= 5 then
    raise exception using errcode = 'PL173', message = 'Pick what happened.';
  end if;
  other := case when me = c.caller then c.listener else c.caller end;
  if exists (select 1 from private.talk_reports where call_id = c.id and reporter = me) then return private.talk_state(me); end if;
  insert into private.talk_reports (call_id, reporter, reported, reporter_was, reason) values (c.id, me, other, case when me = c.caller then 'caller' else 'listener' end, p_reason);
  insert into private.talk_blocks (user_id, other) values (me, other) on conflict do nothing;
  if c.status <> 'done' then
    perform private.talk_settle(c.id, 'reported', me);
  elsif me = c.caller then
    update private.talk_payouts set status = 'held' where call_id = c.id and status = 'waiting';
  end if;
  return private.talk_state(me);
end $$;

-- Block: ends the call and we never meet in Talk mode again.
create or replace function public.talk_block(p_call uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  c private.talk_calls;
begin
  select * into c from private.talk_calls where id = p_call and me in (caller, listener) and (status <> 'done' or ended_at > now() - interval '24 hours');
  if not found then raise exception using errcode = 'PL166', message = 'There is no call to do that on right now.'; end if;
  insert into private.talk_blocks (user_id, other) values (me, case when me = c.caller then c.listener else c.caller end) on conflict do nothing;
  if c.status <> 'done' then perform private.talk_settle(c.id, 'blocked', me); end if;
  return private.talk_state(me);
end $$;

-- Become a listener: an adult with a phone or an email on the account, the whole code agreed.
create or replace function public.talk_listener_apply(p_first_name text, p_sex text, p_accepts text, p_topics text[], p_code_version int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  name text := btrim(coalesce(p_first_name, ''));
  cur private.talk_listeners;
begin
  if not private.is_linked(me) or (select age from profiles where id = me) < 18 then
    raise exception using errcode = 'PL163', message = 'Listeners are 18 or older, with a phone or an email on the account.';
  end if;
  if name !~ '^[[:alpha:]][[:alpha:]''-]{1,19}$' or p_sex is null or p_sex not in ('woman', 'man', 'unsaid') or p_accepts is null or p_accepts not in ('women', 'men', 'anyone') then
    raise exception using errcode = 'PL160', message = 'Use your first name, and say who you are and whom you take calls from.';
  end if;
  if p_topics is null or cardinality(p_topics) not between 1 and 4 or cardinality(p_topics) <> (select count(distinct x) from unnest(p_topics) x)
    or not p_topics <@ array['lonely', 'stress', 'breakup', 'family', 'work', 'exams', 'new_city', 'just_talk'] then
    raise exception using errcode = 'PL161', message = 'Pick 1 to 4 things you can talk about.';
  end if;
  if p_code_version is distinct from 1 then raise exception using errcode = 'PL162', message = 'Agree to the listener code first.'; end if;
  select * into cur from private.talk_listeners where user_id = me;
  if cur.status = 'removed' then raise exception using errcode = 'PL165', message = 'You are not a verified listener yet.'; end if;
  insert into private.talk_listeners (user_id, first_name, sex, accepts, topics, code_version)
  values (me, name, p_sex, p_accepts, p_topics, p_code_version)
  on conflict (user_id) do update set first_name = excluded.first_name, sex = excluded.sex, accepts = excluded.accepts, topics = excluded.topics,
    code_version = excluded.code_version;
  return private.talk_state(me);
end $$;

-- Taking calls for the next two hours, or not now.
create or replace function public.talk_listener_available(p_on boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
begin
  if p_on and not exists (select 1 from private.talk_listeners where user_id = me and status = 'verified') then
    raise exception using errcode = 'PL165', message = 'You are not a verified listener yet.';
  end if;
  update private.talk_listeners set available_until = case when p_on then now() + interval '2 hours' end where user_id = me;
  return private.talk_state(me);
end $$;

-- A friend's link: within 7 days of joining, once, never my own, nobody blocked.
create or replace function public.talk_claim_referral(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  them uuid;
begin
  select user_id into them from private.talk_referral_codes where code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if them is null or them = me or private.blocked_pair(me, them)
    or exists (select 1 from private.talk_referrals where friend = me)
    or exists (select 1 from private.talk_referrals where friend = them and referrer = me)
    or (select created_at from auth.users where id = me) < now() - interval '7 days' then
    raise exception using errcode = 'PL168', message = 'That invite link does not work for this account.';
  end if;
  insert into private.talk_referrals (friend, referrer) values (me, them);
  return private.talk_state(me);
end $$;

revoke all on function public.talk_state(), public.talk_settings(text, text), public.talk_ai_pass(), public.talk_listeners(), public.talk_call(uuid, int, boolean),
  public.talk_answer(uuid, boolean), public.talk_beat(uuid), public.talk_end(uuid), public.talk_report(uuid, text), public.talk_block(uuid),
  public.talk_listener_apply(text, text, text, text[], int), public.talk_listener_available(boolean), public.talk_claim_referral(text) from public, anon;
grant execute on function public.talk_state(), public.talk_settings(text, text), public.talk_ai_pass(), public.talk_listeners(), public.talk_call(uuid, int, boolean),
  public.talk_answer(uuid, boolean), public.talk_beat(uuid), public.talk_end(uuid), public.talk_report(uuid, text), public.talk_block(uuid),
  public.talk_listener_apply(text, text, text, text[], int), public.talk_listener_available(boolean), public.talk_claim_referral(text) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- For the `talk` Edge Function only (service role)
-- ---------------------------------------------------------------------------------------------
-- One message to the AI: the checks and the charge, before the function asks Claude. The text is
-- read here for the self-harm check and never stored.
create or replace function public.talk_ai_turn(p_user uuid, p_chat uuid, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p private.talk_people;
  ch private.talk_ai_chats;
  today date;
  n int;
  v_minute timestamptz := date_trunc('minute', now());
  cost int := 0;
begin
  if p_user is null or not exists (select 1 from profiles where id = p_user) then
    raise exception using errcode = 'PL002', message = 'Finish setting up first.';
  end if;
  if p_text is null or char_length(btrim(p_text)) = 0 or char_length(p_text) > 800 then
    raise exception using errcode = 'PL158', message = 'Write something, up to 800 characters.';
  end if;
  p := private.talk_person(p_user);
  if p.last_ai_at > now() - interval '2 seconds' then raise exception using errcode = 'PL159', message = 'One message at a time.'; end if;
  today := private.local_today(p_user);
  select messages into n from private.talk_ai_days where user_id = p_user and day = today;
  if coalesce(n, 0) >= 250 then
    raise exception using errcode = 'PL171', message = 'That is a lot of talking for one day. The AI is back tomorrow, or try a listener.';
  end if;
  select * into ch from private.talk_ai_chats where id = p_chat and user_id = p_user and last_at > now() - interval '6 hours' for update;
  if not found then
    insert into private.talk_ai_chats (user_id) values (p_user) returning * into ch;
  end if;
  if not ch.harm and private.mentions_harm(p_text) then
    update private.talk_ai_chats set harm = true where id = ch.id;
    ch.harm := true;
  end if;
  if not ch.harm and not coalesce(p.pass_until > now(), false) and not exists (select 1 from private.talk_ai_minutes m where m.chat_id = ch.id and m.minute = v_minute) then
    perform private.wallet_spend(p_user, 'talk_ai', 3, ch.id || ':' || to_char(v_minute at time zone 'utc', 'YYYYMMDDHH24MI'));
    cost := 3;
  end if;
  insert into private.talk_ai_minutes (chat_id, minute, credits) values (ch.id, v_minute, cost) on conflict do nothing;
  update private.talk_ai_chats set last_at = now(), messages = messages + 1 where id = ch.id;
  insert into private.talk_ai_days (user_id, day, messages) values (p_user, today, 1)
    on conflict (user_id, day) do update set messages = talk_ai_days.messages + 1;
  delete from private.talk_ai_days where user_id = p_user and day < today - 30;
  update private.talk_people set last_ai_at = now() where user_id = p_user;
  return jsonb_build_object('chat', ch.id, 'harm', ch.harm, 'charged', cost);
end $$;

-- The AI saw something the word list did not: the rest of the chat is free and shows the help lines.
create or replace function public.talk_ai_flag(p_user uuid, p_chat uuid)
returns void language sql security definer set search_path = public as $$
  update private.talk_ai_chats set harm = true where id = p_chat and user_id = p_user;
$$;

-- For the function to make a voice room: the call must be mine and live. The room is the call's id.
create or replace function public.talk_voice_room(p_user uuid, p_call uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c private.talk_calls;
begin
  select * into c from private.talk_calls where id = p_call and p_user in (caller, listener) and status = 'live';
  if not found then raise exception using errcode = 'PL166', message = 'There is no call to do that on right now.'; end if;
  return jsonb_build_object('room', 'talk-' || c.id, 'identity', case when p_user = c.caller then 'caller' else 'listener' end,
    'name', case when p_user = c.caller then private.talk_first_name(c.caller) else (select first_name from private.talk_listeners where user_id = c.listener) end,
    'minutes', c.length);
end $$;

-- What the KYC step needs from the account: an applied listener, and an email or a phone for Razorpay.
create or replace function public.talk_kyc_start(p_user uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  l private.talk_listeners;
begin
  select * into l from private.talk_listeners where user_id = p_user;
  if not found or l.status not in ('applied', 'checking') then raise exception using errcode = 'PL165', message = 'You are not a verified listener yet.'; end if;
  return (select jsonb_build_object('first_name', l.first_name, 'email', nullif(u.email, ''), 'phone', nullif(u.phone, ''), 'account', l.route_account)
    from auth.users u where u.id = p_user);
end $$;

-- Razorpay has the linked account: a person at Pinkilock checks it next.
create or replace function public.talk_kyc_done(p_user uuid, p_account text, p_last4 text)
returns void language sql security definer set search_path = public as $$
  update private.talk_listeners set status = 'checking', route_account = p_account, bank_last4 = p_last4
  where user_id = p_user and status in ('applied', 'checking');
$$;

-- A person at Pinkilock: verified (once Route says the account is active), paused or removed.
create or replace function public.talk_listener_decide(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('verified', 'paused', 'removed') then raise exception using errcode = 'PC002', message = 'verified, paused or removed'; end if;
  if p_status = 'verified' and not exists (select 1 from private.talk_listeners where user_id = p_user and route_account is not null) then
    raise exception using errcode = 'PL165', message = 'You are not a verified listener yet.';
  end if;
  update private.talk_listeners set status = p_status, verified_at = case when p_status = 'verified' then coalesce(verified_at, now()) else verified_at end,
    available_until = case when p_status = 'verified' then available_until end
  where user_id = p_user;
end $$;

-- Payouts that are due: claimed for sending, then marked sent or failed.
create or replace function public.talk_payouts_claim(p_limit int default 20)
returns table (call_id uuid, route_account text, payout int) language sql security definer set search_path = public as $$
  update private.talk_payouts x set status = 'sending'
  where x.call_id in (select y.call_id from private.talk_payouts y where y.status in ('waiting', 'failed') and y.due_at < now() and y.route_account is not null
                      and y.payout > 0 order by y.at limit p_limit for update skip locked)
  returning x.call_id, x.route_account, x.payout;
$$;
create or replace function public.talk_payout_done(p_call uuid, p_transfer text)
returns void language sql security definer set search_path = public as $$
  update private.talk_payouts set status = case when p_transfer is null then 'failed' else 'sent' end, transfer_id = p_transfer,
    sent_at = case when p_transfer is null then null else now() end
  where call_id = p_call and status = 'sending';
$$;

revoke all on function public.talk_ai_turn(uuid, uuid, text), public.talk_ai_flag(uuid, uuid), public.talk_voice_room(uuid, uuid), public.talk_kyc_start(uuid),
  public.talk_kyc_done(uuid, text, text), public.talk_listener_decide(uuid, text), public.talk_payouts_claim(int), public.talk_payout_done(uuid, text)
  from public, anon, authenticated;
grant execute on function public.talk_ai_turn(uuid, uuid, text), public.talk_ai_flag(uuid, uuid), public.talk_voice_room(uuid, uuid), public.talk_kyc_start(uuid),
  public.talk_kyc_done(uuid, text, text), public.talk_listener_decide(uuid, text), public.talk_payouts_claim(int), public.talk_payout_done(uuid, text)
  to service_role;

-- Every hour, the function sends the payouts that are due (when Route is set up), like review-line.
create or replace function private.kick_talk_payouts()
returns void language plpgsql security definer set search_path = public as $$
declare
  url text;
  secret text;
begin
  if not exists (select 1 from private.talk_payouts where status in ('waiting', 'failed') and due_at < now()) then return; end if;
  execute $q$ select decrypted_secret from vault.decrypted_secrets where name = 'push_function_url' $q$ into url;
  execute $q$ select decrypted_secret from vault.decrypted_secrets where name = 'push_function_secret' $q$ into secret;
  if url is null or secret is null then return; end if;
  execute $q$ select net.http_post(url := $1, headers := $2, body := '{"action":"payouts"}'::jsonb, timeout_milliseconds := 10000) $q$
    using regexp_replace(url, '/push$', '/talk'), jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret);
exception when others then
  raise warning 'kick_talk_payouts: %', sqlerrm;
end $$;
revoke all on function private.kick_talk_payouts() from public, anon, authenticated;
select cron.schedule('pinkilock-talk-payouts', '17 * * * *', 'select private.kick_talk_payouts()');

-- A block anywhere in Pinkilock ends a Talk call between the two.
create or replace function private.talk_block_stop()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c private.talk_calls;
begin
  for c in select * from private.talk_calls where status <> 'done'
    and ((caller = new.blocker_id and listener = new.blocked_id) or (caller = new.blocked_id and listener = new.blocker_id)) loop
    perform private.talk_settle(c.id, 'blocked', new.blocker_id);
  end loop;
  return null;
end $$;
create trigger talk_block_stop after insert on public.blocks for each row execute function private.talk_block_stop();
revoke all on function private.talk_block_stop() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The data download, format 11: format 10 (20261126000001_spicy_calls.sql), plus Talk mode.
-- ---------------------------------------------------------------------------------------------
alter function public.export_my_data() rename to export_my_data_10;
alter function public.export_my_data_10() set schema private;
revoke all on function private.export_my_data_10() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return private.export_my_data_10() || jsonb_build_object(
    'format', 'pinkilock-export-11',
    -- Talk mode (D107): my settings, AI chats (minutes and flags; the words were never kept), my
    -- calls (the other person by first name only), my listener record and payouts, referrals, blocks.
    -- Reports I made are listed; reports about me are not part of an export.
    'talk', jsonb_build_object(
      'settings', (select jsonb_build_object('sex', p.sex, 'want', p.want, 'pass_until', p.pass_until, 'free_call', p.free_call, 'free_reason', p.free_reason, 'free_at', p.free_at)
                   from private.talk_people p where p.user_id = me),
      'referral_code', (select code from private.talk_referral_codes where user_id = me),
      'joined_with_a_friends_link', exists (select 1 from private.talk_referrals where friend = me),
      'friends_joined', (select count(*) from private.talk_referrals where referrer = me),
      'ai_chats', coalesce((select jsonb_agg(jsonb_build_object('started_at', c.started_at, 'last_at', c.last_at, 'messages', c.messages, 'help_lines_shown', c.harm,
                    'credits', (select coalesce(sum(m.credits), 0) from private.talk_ai_minutes m where m.chat_id = c.id)) order by c.started_at)
                    from private.talk_ai_chats c where c.user_id = me), '[]'),
      'calls', coalesce((select jsonb_agg(jsonb_build_object('i_was', case when c.caller = me then 'caller' else 'listener' end,
                    'with', case when c.caller = me then (select first_name from private.talk_listeners where user_id = c.listener) else private.talk_first_name(c.caller) end,
                    'length', c.length, 'free', c.free, 'rang_at', c.rang_at, 'started_at', c.started_at, 'ended_at', c.ended_at, 'end', c.end_reason,
                    'minutes', c.together, 'charged', case when c.caller = me then c.charged end, 'refunded', case when c.caller = me then c.refunded end) order by c.rang_at)
                    from private.talk_calls c where me in (c.caller, c.listener)), '[]'),
      'listener', (select jsonb_build_object('status', l.status, 'first_name', l.first_name, 'sex', l.sex, 'accepts', l.accepts, 'topics', to_jsonb(l.topics),
                    'code_version', l.code_version, 'bank_last4', l.bank_last4, 'route_account', l.route_account, 'applied_at', l.applied_at, 'verified_at', l.verified_at,
                    'payouts', coalesce((select jsonb_agg(jsonb_build_object('minutes', x.minutes, 'free', x.free, 'gross_paise', x.gross, 'host_paise', x.host,
                      'tds_paise', x.tds, 'payout_paise', x.payout, 'status', x.status, 'transfer', x.transfer_id, 'at', x.at, 'sent_at', x.sent_at) order by x.at)
                      from private.talk_payouts x where x.listener = me), '[]'))
                    from private.talk_listeners l where l.user_id = me),
      'blocks', (select count(*) from private.talk_blocks where user_id = me),
      'reports_made', coalesce((select jsonb_agg(jsonb_build_object('reason', r.reason, 'at', r.at) order by r.at) from private.talk_reports r where r.reporter = me), '[]')));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
