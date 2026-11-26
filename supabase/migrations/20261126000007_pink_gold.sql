-- Pink Gold (D115): the name for Pinkilock's paid members, and a badge on their card so others can
-- see who is a member. The app shows the badge from `Profile.pinkGold` (src/components/PinkGold.tsx);
-- the mock seeds two made-up members so the badge shows with no keys.
--
--   * There is no paid membership to buy yet (the credits wallet, D104, sells packs, not a
--     membership). Until one is built, a person on the team makes someone Pink Gold by running
--     private.pink_gold_grant in the SQL editor, and ends it with private.pink_gold_end
--     (OPERATIONS.md has the lines). No client role, not the analytics worker and not an Edge
--     Function can read the table or call either function.
--   * A card says only whether its person is Pink Gold now (`pink_gold` on public.profile_cards),
--     never since when, until when or why. The badge rides on the card, so it shows exactly where
--     the card already shows: blocks and the rest of the card's RLS apply unchanged.
--   * Pink Gold changes nothing else: not the Discover order, not limits, not trust, and nothing in
--     Spicy mode, which never reads it.
--   * My own membership (since, until) is in my data download; the note is the team's and is not.

create table private.pink_gold (
  user_id uuid primary key references auth.users (id) on delete cascade,
  since timestamptz not null default now(),
  -- Null: a member until someone ends it.
  until timestamptz,
  -- Why (for the team), e.g. 'founding member'. Never shown to anyone in the app.
  note text check (note is null or char_length(note) <= 200),
  check (until is null or until > since)
);
alter table private.pink_gold enable row level security;
revoke all on private.pink_gold from public, anon, authenticated;

-- What a card says: only whether the person is Pink Gold right now.
create or replace function private.is_pink_gold(p_person uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from private.pink_gold g where g.user_id = p_person and (g.until is null or g.until > now()));
$$;
revoke all on function private.is_pink_gold(uuid) from public, anon;
grant execute on function private.is_pink_gold(uuid) to authenticated;

-- Make someone Pink Gold from now, until p_until (null: until ended). Run again to change the end
-- date; a membership that had ended starts again from now.
create or replace function private.pink_gold_grant(p_user uuid, p_until timestamptz default null, p_note text default null)
returns void language sql security definer set search_path = '' as $$
  insert into private.pink_gold (user_id, since, until, note)
  values (p_user, now(), p_until, p_note)
  on conflict (user_id) do update
    set since = case when private.is_pink_gold(p_user) then private.pink_gold.since else now() end,
        until = excluded.until,
        note = coalesce(excluded.note, private.pink_gold.note);
$$;
revoke all on function private.pink_gold_grant(uuid, timestamptz, text) from public, anon, authenticated;

-- End someone's Pink Gold now. The row stays, so their download still says they were a member.
create or replace function private.pink_gold_end(p_user uuid)
returns void language sql security definer set search_path = '' as $$
  update private.pink_gold set since = least(since, now() - interval '1 second'), until = now()
  where user_id = p_user and (until is null or until > now());
$$;
revoke all on function private.pink_gold_end(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------
-- The card: as in 20261118000002_double_dates.sql, plus `pink_gold` at the end. Adding a column at
-- the end keeps every function that returns cards (discover and the rest) working as it is.
-- ---------------------------------------------------------------------------------------------
create or replace view public.profile_cards with (security_invoker = true) as
select p.id, p.name, p.age, p.city, p.area, p.pronouns, p.tagline, p.vibes, p.idea_ids, p.palette, p.glyph, p.photo_count, p.created_at,
       coalesce(t.score, 100) as trust_score,
       coalesce(t.kept, 0) as kept,
       coalesce(t.flaked, 0) as flaked,
       t.computed_at as trust_computed_at,
       t.median_answer_minutes,
       p.country,
       p.free_windows,
       vs.n as vouch_count,
       vs.top as vouch_phrases,
       private.has_duo(p.id) as has_duo,
       private.is_pink_gold(p.id) as pink_gold
from public.profiles p
left join public.trust_scores t on t.profile_id = p.id
cross join lateral private.vouch_summary(p.id) vs;
revoke all on public.profile_cards from anon, authenticated;
grant select on public.profile_cards to authenticated;

-- ---------------------------------------------------------------------------------------------
-- The data download: whatever came before, plus my Pink Gold membership. One key is added and the
-- format name is kept, so this sits on top of any later format without clashing with it.
-- ---------------------------------------------------------------------------------------------
alter function public.export_my_data() rename to export_before_pink_gold;
alter function public.export_before_pink_gold() set schema private;
revoke all on function private.export_before_pink_gold() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return private.export_before_pink_gold() || jsonb_build_object(
    'pink_gold', (select jsonb_build_object('since', g.since, 'until', g.until, 'now', private.is_pink_gold(me))
                  from private.pink_gold g where g.user_id = me));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
