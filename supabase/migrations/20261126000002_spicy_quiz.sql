-- Spicy terms and quiz (D107). The same rules are in src/domain/spicyQuiz.ts (the mock follows it).
--
--   * Before Spicy mode turns on, the person reads the Spicy terms, agrees to them, and answers
--     five questions about them. Only all five right is a pass. A miss says which questions were
--     wrong, and the person may read the terms again and retry.
--   * A pass is kept by version, as a row in public.consents (kind 'spicy', version 'spicy-N'), so
--     it is in the data download (as every consent is) and goes with the account.
--   * When the terms change, private.spicy_terms_version() goes up in a new migration. Spicy then
--     pauses for everyone who has not passed the new version: save_spicy refuses, and spicy_with_for
--     is closed on both sides, so no yes, unlock or call goes ahead until both passed again.
--   * Nothing here goes into a log, a push, an event or the analytics worker.

create or replace function private.spicy_terms_version()
returns int language sql immutable set search_path = '' as $$ select 1 $$;
revoke all on function private.spicy_terms_version() from public, anon, authenticated;

-- The answer key, in question order: phone, camera, photos, threat, stop. As SPICY_QUIZ.
create or replace function private.spicy_quiz_key()
returns text[] language sql immutable set search_path = '' as $$ select array['b', 'c', 'a', 'b', 'c'] $$;
revoke all on function private.spicy_quiz_key() from public, anon, authenticated;

create or replace function private.spicy_quiz_ids()
returns text[] language sql immutable set search_path = '' as $$ select array['phone', 'camera', 'photos', 'threat', 'stop'] $$;
revoke all on function private.spicy_quiz_ids() from public, anon, authenticated;

alter table public.consents drop constraint consents_kind_check;
alter table public.consents add constraint consents_kind_check check (kind in ('adult', 'terms', 'privacy', 'sensitive', 'face', 'spicy'));

create or replace function private.spicy_passed(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.consents c
                 where c.user_id = p_user and c.kind = 'spicy' and c.version = 'spicy-' || private.spicy_terms_version());
$$;
revoke all on function private.spicy_passed(uuid) from public, anon, authenticated;

create or replace function private.spicy_terms_for(p_user uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version', private.spicy_terms_version(),
    'passed', private.spicy_passed(p_user),
    'passed_at', (select c.at from public.consents c where c.user_id = p_user and c.kind = 'spicy' and c.version = 'spicy-' || private.spicy_terms_version()),
    'outdated', not private.spicy_passed(p_user)
                and exists (select 1 from public.consents c where c.user_id = p_user and c.kind = 'spicy'));
$$;
revoke all on function private.spicy_terms_for(uuid) from public, anon, authenticated;

-- Where I stand: the version in force, and whether I passed it.
create or replace function public.spicy_terms()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return private.spicy_terms_for(private.self_love_me());
end $$;

-- The quiz. p_version is the version of the terms I read; p_answers one letter per question, in
-- quiz order. A pass is kept; a miss keeps nothing and says which questions were wrong.
create or replace function public.pass_spicy_quiz(p_version int, p_agree boolean, p_answers text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  key text[] := private.spicy_quiz_key();
  ids text[] := private.spicy_quiz_ids();
  wrong text[] := '{}';
begin
  if p_version is distinct from private.spicy_terms_version() then
    raise exception using errcode = 'PL155', message = 'The Spicy terms changed. Read them again and retake the quiz.';
  end if;
  if not coalesce(p_agree, false) then
    raise exception using errcode = 'PL156', message = 'Agree to the Spicy terms first.';
  end if;
  if p_answers is null or coalesce(array_length(p_answers, 1), 0) <> array_length(key, 1)
     or exists (select 1 from unnest(p_answers) a where a is null or a not in ('a', 'b', 'c')) then
    raise exception using errcode = 'PL157', message = 'Answer every question.';
  end if;
  for i in 1 .. array_length(key, 1) loop
    if p_answers[i] <> key[i] then wrong := wrong || ids[i]; end if;
  end loop;
  if cardinality(wrong) = 0 then
    insert into consents (user_id, kind, version) values (me, 'spicy', 'spicy-' || private.spicy_terms_version())
    on conflict do nothing;
  end if;
  return jsonb_build_object('passed', cardinality(wrong) = 0, 'wrong', to_jsonb(wrong));
end $$;

revoke all on function public.spicy_terms(), public.pass_spicy_quiz(int, boolean, text[]) from public, anon;
grant execute on function public.spicy_terms(), public.pass_spicy_quiz(int, boolean, text[]) to authenticated;

-- As in 20261125000002_spicy.sql, plus: the quiz for the current terms comes first.
create or replace function public.save_spicy(p_adult boolean, p_rules boolean, p_discord text, p_telegram text, p_signal text, p_boundaries text[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.self_love_me();
  d text;
  tg text;
  sg text;
begin
  if not coalesce(p_adult, false) or not coalesce(p_rules, false) or (select age from profiles where id = me) < 18 then
    raise exception using errcode = 'PL127', message = 'Confirm you are 18 or older and agree to the safety rules first.';
  end if;
  if not private.is_linked(me) then
    raise exception using errcode = 'PL128', message = 'Spicy mode needs a phone number or an email on your account.';
  end if;
  if not private.spicy_passed(me) then
    raise exception using errcode = 'PL154', message = 'Read the Spicy terms and pass the quiz first.';
  end if;
  d := private.spicy_username('discord', p_discord);
  tg := private.spicy_username('telegram', p_telegram);
  sg := private.spicy_username('signal', p_signal);
  if d is null and tg is null and sg is null then
    raise exception using errcode = 'PL126', message = 'Add a Discord, Telegram or Signal username.';
  end if;
  if not (coalesce(p_boundaries, '{}') <@ array['words_only', 'no_photos', 'no_video', 'face_private', 'ask_first', 'slow']) then
    raise exception using errcode = 'PL129', message = 'Pick your boundaries from the list.';
  end if;
  insert into private.spicy (user_id, discord, telegram, signal, boundaries, adult_at, rules_at)
  values (me, d, tg, sg, (select coalesce(array_agg(distinct b order by b), '{}') from unnest(coalesce(p_boundaries, '{}')) b), now(), now())
  on conflict (user_id) do update set discord = excluded.discord, telegram = excluded.telegram, signal = excluded.signal, boundaries = excluded.boundaries,
    adult_at = excluded.adult_at, rules_at = excluded.rules_at, updated_at = now();
  return private.spicy_state(me);
end $$;

-- As in 20261125000003_wallet.sql, plus: closed unless both of us passed the quiz for the current
-- terms. Same closed answer as every other reason, so it says nothing about the other person.
create or replace function private.spicy_with_for(p_user uuid, p_other uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  theirs private.spicy;
  my_yes boolean;
  their_yes boolean;
  u private.spicy_unlocks;
  mine int := 0;
  their_part int := 0;
  shown boolean;
begin
  if p_other is null or p_other = p_user then return jsonb_build_object('open', false); end if;
  select * into theirs from private.spicy where user_id = p_other;
  if not found or not exists (select 1 from private.spicy where user_id = p_user)
     or not private.spicy_passed(p_user) or not private.spicy_passed(p_other)
     or private.blocked_pair(p_user, p_other)
     or not (exists (select 1 from private.discover_seen d where d.user_id = p_user and d.card_id = p_other)
             or private.shares_invite(p_user, p_other))
     or exists (select 1 from profiles p where p.id in (p_user, p_other) and p.suspended_at is not null) then
    return jsonb_build_object('open', false);
  end if;
  my_yes := exists (select 1 from private.spicy_yes where user_id = p_user and other_id = p_other);
  their_yes := exists (select 1 from private.spicy_yes where user_id = p_other and other_id = p_user);
  select * into u from private.spicy_unlocks where a = least(p_user, p_other) and b = greatest(p_user, p_other);
  if found then
    mine := case when u.a = p_user then u.paid_a else u.paid_b end;
    their_part := case when u.a = p_user then u.paid_b else u.paid_a end;
  end if;
  shown := my_yes and their_yes and u.unlocked_at is not null;
  return jsonb_build_object('open', true, 'my_yes', my_yes, 'mutual', my_yes and their_yes,
    'their_boundaries', to_jsonb(theirs.boundaries),
    'unlock', jsonb_build_object('mine', mine, 'theirs', their_part, 'done', u.unlocked_at is not null),
    'discord', case when shown then theirs.discord end,
    'telegram', case when shown then theirs.telegram end,
    'signal', case when shown then theirs.signal end);
end $$;
revoke all on function private.spicy_with_for(uuid, uuid) from public, anon, authenticated;
