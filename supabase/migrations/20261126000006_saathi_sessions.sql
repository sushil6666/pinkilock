-- Saathi sessions (D114, Sushil 2026-11-26). Talking with Saathi is paid up front: 60 credits (about
-- ₹60) for up to 15 minutes, from the wallet. In the last 2 minutes, or once the time is up, the
-- person can continue for another 15 minutes for 60 more, from the wallet or after a top-up, and
-- the chat carries on where it was. This replaces the per-minute charge (3 a minute) of D108. The
-- day pass still covers every chat that day.
--
-- Never cut off for money: a chat that has mentioned self-harm is free from then on and never needs
-- a session, and a message that mentions it goes through even when the time is up.
--
-- The same numbers are AI_SESSION_CREDITS, AI_SESSION_MINUTES and AI_CONTINUE_MINUTES in
-- src/domain/talk.ts.

alter table private.talk_ai_chats
  add column paid_until timestamptz,
  add column sessions int not null default 0;

-- Start, or continue, a 15-minute session on a chat (a new chat when p_chat is null or old).
create or replace function public.talk_ai_session(p_chat uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  p private.talk_people;
  ch private.talk_ai_chats;
  cost int := 0;
begin
  p := private.talk_person(me);
  select * into ch from private.talk_ai_chats where id = p_chat and user_id = me and last_at > now() - interval '6 hours' for update;
  if not found then
    insert into private.talk_ai_chats (user_id) values (me) returning * into ch;
  end if;
  -- Free: a chat that mentioned self-harm, or a day pass. Nothing to buy.
  if ch.harm or coalesce(p.pass_until > now(), false) then
    return jsonb_build_object('chat', ch.id, 'paid_until', ch.paid_until, 'charged', 0, 'free', true);
  end if;
  if ch.paid_until > now() + interval '2 minutes' then
    raise exception using errcode = 'PL182', message = 'You still have time with Saathi. You can continue in the last 2 minutes.';
  end if;
  perform private.wallet_spend(me, 'talk_ai', 60, ch.id || ':s' || (ch.sessions + 1));
  cost := 60;
  update private.talk_ai_chats
    set paid_until = greatest(coalesce(paid_until, now()), now()) + interval '15 minutes', sessions = sessions + 1, last_at = now()
    where id = ch.id returning * into ch;
  return jsonb_build_object('chat', ch.id, 'paid_until', ch.paid_until, 'charged', cost, 'free', false);
end $$;
revoke all on function public.talk_ai_session(uuid) from public, anon;
grant execute on function public.talk_ai_session(uuid) to authenticated;

-- One message: no charge now (the session paid for it), but it needs time left, a day pass, or a
-- chat that has mentioned self-harm (PL181 otherwise). A message that mentions self-harm always goes.
create or replace function public.talk_ai_turn(p_user uuid, p_chat uuid, p_text text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  p private.talk_people;
  ch private.talk_ai_chats;
  today date;
  n int;
  v_minute timestamptz := date_trunc('minute', now());
begin
  if p_user is null or not exists (select 1 from profiles where id = p_user) then
    raise exception using errcode = 'PL002', message = 'Finish setting up first.';
  end if;
  if p_text is null or char_length(btrim(p_text)) = 0 or char_length(p_text) > 800 then
    raise exception using errcode = 'PL162', message = 'Write something, up to 800 characters.';
  end if;
  p := private.talk_person(p_user);
  if p.last_ai_at > now() - interval '2 seconds' then raise exception using errcode = 'PL163', message = 'One message at a time.'; end if;
  today := private.local_today(p_user);
  select messages into n from private.talk_ai_days where user_id = p_user and day = today;
  if coalesce(n, 0) >= 250 then
    raise exception using errcode = 'PL175', message = 'That is a lot of talking for one day. The AI is back tomorrow, or try a listener.';
  end if;
  select * into ch from private.talk_ai_chats where id = p_chat and user_id = p_user and last_at > now() - interval '6 hours' for update;
  if not found then
    insert into private.talk_ai_chats (user_id) values (p_user) returning * into ch;
  end if;
  if not ch.harm and private.mentions_harm(p_text) then
    update private.talk_ai_chats set harm = true where id = ch.id;
    ch.harm := true;
  end if;
  if not ch.harm and not coalesce(p.pass_until > now(), false) and not coalesce(ch.paid_until > now(), false) then
    raise exception using errcode = 'PL181', message = 'Your time with Saathi is up. Continue for another 15 minutes to keep talking.';
  end if;
  insert into private.talk_ai_minutes (chat_id, minute, credits) values (ch.id, v_minute, 0) on conflict do nothing;
  update private.talk_ai_chats set last_at = now(), messages = messages + 1 where id = ch.id;
  insert into private.talk_ai_days (user_id, day, messages) values (p_user, today, 1)
    on conflict (user_id, day) do update set messages = talk_ai_days.messages + 1;
  delete from private.talk_ai_days where user_id = p_user and day < today - 30;
  update private.talk_people set last_ai_at = now() where user_id = p_user;
  return jsonb_build_object('chat', ch.id, 'harm', ch.harm, 'charged', 0, 'paid_until', ch.paid_until);
end $$;
revoke all on function public.talk_ai_turn(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.talk_ai_turn(uuid, uuid, text) to service_role;

-- The day pass is no longer sold (D114): it would undercut the 60-credit minimum. A pass already
-- bought still runs its day.
create or replace function public.talk_ai_pass()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  raise exception using errcode = 'PL183', message = 'The day pass is no longer sold. Start a 15-minute session instead.';
end $$;
