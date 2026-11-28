-- Question of the day (D125): one light question a day for a couple in Couple mode (D120). Each
-- answers in their own words; an answer shows to the other only once both have answered, so neither
-- copies. Private to the two, like the rest of Couple mode. The relationship tip of the day is in
-- the app only (src/domain/daily.ts).
--
--   * The day is the asker's city day (private.local_today of `a`), as for the weekly challenge.
--   * The question is picked from the couple and the day, walking the list in order from a
--     per-couple start, so none comes back for 40 days.
--   * One answer each a day, 1 to 300 characters, kept as written. No pushes; the gentle reminders
--     (D124) are unchanged.

-- The same ids, in the same order, as COUPLE_QUESTIONS in src/domain/daily.ts (tests/unit/daily.test.ts
-- checks). The words are in src/i18n (`daily.questions`).
create or replace function private.couple_question_ids()
returns text[] language sql immutable as $$
  select array[
    'never_share_snack', 'childhood_hero', 'perfect_sunday', 'song_on_repeat', 'first_impression',
    'proud_of_this_week', 'travel_dream', 'comfort_food', 'silly_fear', 'best_gift', 'teacher_remember',
    'superpower', 'small_joy', 'family_tradition', 'last_laugh', 'skill_to_learn', 'favourite_festival',
    'movie_cry', 'morning_or_night', 'chai_or_coffee', 'dream_job_kid', 'thing_about_me', 'best_trip',
    'monsoon_memory', 'grateful_today', 'rainy_day_plan', 'cook_signature', 'book_or_show', 'kindest_stranger',
    'one_rule', 'date_to_repeat', 'city_secret', 'old_photo', 'hidden_talent', 'calm_place', 'look_forward',
    'little_habit', 'win_this_month', 'make_you_smile', 'next_adventure']::text[];
$$;
revoke all on function private.couple_question_ids() from public, anon, authenticated;

create table private.couple_answers (
  couple_id uuid not null references private.couples (id) on delete cascade,
  day date not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  body text not null check (char_length(body) between 1 and 300),
  at timestamptz not null default now(),
  primary key (couple_id, day, user_id)
);
alter table private.couple_answers enable row level security;
revoke all on private.couple_answers from public, anon, authenticated, service_role;

create or replace function private.couple_question_of(c private.couples, d date)
returns text language sql immutable as $$
  select (private.couple_question_ids())[1 + ((abs(hashtext(c.id::text)) + (d - date '2026-01-01')) % array_length(private.couple_question_ids(), 1))];
$$;
revoke all on function private.couple_question_of(private.couples, date) from public, anon, authenticated;

-- What one person sees: today's question, my answer, theirs once I have answered, the last 14 days
-- both answered, and how many days in a row both have.
create or replace function private.couple_question_state(p_user uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c private.couples := private.couple_on(p_user);
  other uuid := case when c.a = p_user then c.b else c.a end;
  today date := private.local_today(c.a);
  both_days date[];
  streak int := 0;
  d date;
begin
  select coalesce(array_agg(x.day order by x.day desc), '{}') into both_days
  from (select a.day from private.couple_answers a where a.couple_id = c.id group by a.day having count(*) = 2) x;
  d := case when today = any (both_days) then today else today - 1 end;
  while d = any (both_days) loop streak := streak + 1; d := d - 1; end loop;
  return jsonb_build_object(
    'today', jsonb_build_object(
      'day', today,
      'question', coalesce((select a.question from private.couple_answers a where a.couple_id = c.id and a.day = today limit 1), private.couple_question_of(c, today)),
      'mine', (select a.body from private.couple_answers a where a.couple_id = c.id and a.day = today and a.user_id = p_user),
      'theirs', (select a.body from private.couple_answers a where a.couple_id = c.id and a.day = today and a.user_id = other
                   and exists (select 1 from private.couple_answers m where m.couple_id = c.id and m.day = today and m.user_id = p_user)),
      'they_answered', exists (select 1 from private.couple_answers a where a.couple_id = c.id and a.day = today and a.user_id = other)),
    'past', coalesce((select jsonb_agg(jsonb_build_object('day', x.day, 'question', x.question, 'mine', x.mine, 'theirs', x.theirs, 'they_answered', true) order by x.day desc)
      from (select a.day, min(a.question) question, max(a.body) filter (where a.user_id = p_user) mine, max(a.body) filter (where a.user_id = other) theirs
            from private.couple_answers a where a.couple_id = c.id and a.day < today
            group by a.day having count(*) = 2 order by a.day desc limit 14) x), '[]'),
    'streak', streak);
end $$;
revoke all on function private.couple_question_state(uuid) from public, anon, authenticated;

create or replace function public.couple_question()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return private.couple_question_state(private.couple_me());
end $$;

create or replace function public.couple_question_answer(p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := private.couple_me();
  c private.couples := private.couple_on(me);
  today date := private.local_today(c.a);
  b text := btrim(coalesce(p_body, ''));
begin
  if char_length(b) < 1 or char_length(b) > 300 then
    raise exception using errcode = 'PL235', message = 'Write an answer of up to 300 characters.';
  end if;
  insert into private.couple_answers (couple_id, day, user_id, question, body)
  values (c.id, today, me, private.couple_question_of(c, today), b)
  on conflict (couple_id, day, user_id) do nothing;
  if not found then
    raise exception using errcode = 'PL236', message = 'You have answered today''s question. A new one comes tomorrow.';
  end if;
  return private.couple_question_state(me);
end $$;
revoke all on function public.couple_question(), public.couple_question_answer(text) from public, anon;
grant execute on function public.couple_question(), public.couple_question_answer(text) to authenticated;

-- The data download: my own answers (theirs are theirs to download).
do $$ begin
  execute 'alter function public.export_my_data() rename to export_before_daily';
  execute 'alter function public.export_before_daily() set schema private';
end $$;
revoke all on function private.export_before_daily() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return private.export_before_daily() || jsonb_build_object(
    'couple_answers', coalesce((select jsonb_agg(jsonb_build_object('day', a.day, 'question', a.question, 'answer', a.body) order by a.day)
      from private.couple_answers a where a.user_id = auth.uid()), '[]'));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
