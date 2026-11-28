-- Cosmic match (D129): the Moon-sign match of Indian tradition (Ashtakoota, the 36 gunas) and a
-- numerology number, for fun and tradition.
--
--   * Opt-in. I give my birth date (and, if I like, the time; noon India time if not). The phone
--     works out my Moon's sidereal (Lahiri) longitude (src/domain/cosmic.ts) and sends it with them.
--     Birth place is not asked. All of it is private: no client reads the table, and nobody else
--     ever sees my date, time or Moon, only our score.
--   * The score shows only between two people who matched (private.matched: a kept plan for two,
--     both want round two, no block), and only when both have it on.
--   * Never in Discover's order, never in a Trust Score, never caste or gotra, never a remedy for sale.
--   * The eight kootas here and in src/domain/cosmic.ts must agree; tests/db/cosmic.sql checks the
--     shared cases (GUNA_CASES, written by `UPDATE_CASES=1 npm run test:unit`).

create table private.cosmic (
  user_id uuid primary key references auth.users (id) on delete cascade,
  birth_date date not null,
  birth_time text check (birth_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  moon numeric(5, 2) not null check (moon >= 0 and moon < 360),
  updated_at timestamptz not null default now()
);
alter table private.cosmic enable row level security;
revoke all on private.cosmic from public, anon, authenticated, service_role;

-- The eight scores between two Moons (degrees), as kootas() in src/domain/cosmic.ts.
create or replace function private.guna(p_a numeric, p_b numeric)
returns jsonb language plpgsql immutable set search_path = public as $$
declare
  na int := floor(p_a / (360.0 / 27))::int % 27;
  nb int := floor(p_b / (360.0 / 27))::int % 27;
  ra int := floor(p_a / 30)::int % 12;
  rb int := floor(p_b / 30)::int % 12;
  varna int[] := array[3, 2, 1, 4, 3, 2, 1, 4, 3, 2, 1, 4];
  yoni int[] := array[0, 1, 2, 3, 3, 4, 5, 2, 5, 6, 6, 7, 8, 9, 8, 9, 10, 10, 4, 11, 12, 11, 13, 0, 13, 7, 1];
  lord int[] := array[2, 5, 3, 1, 0, 3, 5, 2, 4, 6, 6, 4];
  friend int[] := array[[1, 1, 1, 0, 1, -1, -1], [1, 1, 0, 1, 0, 0, 0], [1, 1, 1, -1, 1, 0, 0], [1, -1, 0, 1, 0, 1, 0],
                        [1, 1, 1, -1, 1, -1, 0], [-1, -1, 0, 1, 0, 1, 1], [-1, -1, -1, 1, 0, 1, 1]];
  vashya numeric[] := array[[2, 1, 1, 0.5, 1], [1, 2, 0.5, 0, 1], [1, 0.5, 2, 1, 1], [0.5, 0, 1, 2, 0], [1, 1, 1, 0, 2]];
  gana int[] := array[0, 1, 2, 1, 0, 1, 0, 0, 2, 2, 1, 1, 0, 2, 0, 2, 0, 2, 2, 1, 1, 0, 2, 2, 1, 1, 0];
  gana_score numeric[] := array[[6, 5.5, 0.5], [5.5, 6, 0], [0.5, 0, 6]];
  nadi int[] := array[0, 1, 2, 2, 1, 0];
  va int; vb int; ya int; yb int; x int; y int; s int; one boolean; dist int;
  m numeric; t numeric; yo numeric;
begin
  va := (array[0, 0, 1, 2, 3, 1, 1, 4, case when mod(p_a, 30) >= 15 then 0 else 1 end, case when mod(p_a, 30) >= 15 then 2 else 0 end, 1, 2])[ra + 1];
  vb := (array[0, 0, 1, 2, 3, 1, 1, 4, case when mod(p_b, 30) >= 15 then 0 else 1 end, case when mod(p_b, 30) >= 15 then 2 else 0 end, 1, 2])[rb + 1];
  ya := yoni[na + 1]; yb := yoni[nb + 1];
  yo := case when ya = yb then 4
             when array[least(ya, yb), greatest(ya, yb)] in (array[0, 8], array[1, 13], array[2, 11], array[3, 12], array[4, 10], array[5, 6], array[7, 9]) then 0
             else 2 end;
  x := lord[ra + 1]; y := lord[rb + 1];
  s := friend[x + 1][y + 1] + friend[y + 1][x + 1];
  one := friend[x + 1][y + 1] = 1 or friend[y + 1][x + 1] = 1;
  m := case when x = y or s = 2 then 5 when s = 1 then 4 when s = 0 then case when one then 1 else 3 end when s = -1 then 0.5 else 0 end;
  t := ((case when mod(mod(nb - na + 27, 27) + 1, 9) in (3, 5, 7) then 0 else 1 end)
      + (case when mod(mod(na - nb + 27, 27) + 1, 9) in (3, 5, 7) then 0 else 1 end)) * 1.5;
  dist := mod(rb - ra + 12, 12) + 1;
  return jsonb_build_object(
    'varna', case when varna[ra + 1] = varna[rb + 1] then 1 else 0.5 end,
    'vashya', vashya[va + 1][vb + 1],
    'tara', t,
    'yoni', yo,
    'maitri', m,
    'gana', gana_score[gana[na + 1] + 1][gana[nb + 1] + 1],
    'bhakoot', case when dist in (2, 12, 5, 9, 6, 8) then 0 else 7 end,
    'nadi', case when nadi[mod(na, 6) + 1] = nadi[mod(nb, 6) + 1] then 0 else 8 end);
end $$;
revoke all on function private.guna(numeric, numeric) from public, anon, authenticated;

-- The life path number: the date's digits added until one is left.
create or replace function private.life_path(p_date date)
returns int language plpgsql immutable set search_path = public as $$
declare n int := 0; s text := to_char(p_date, 'YYYYMMDD'); i int;
begin
  loop
    n := 0;
    for i in 1 .. length(s) loop n := n + substr(s, i, 1)::int; end loop;
    exit when n <= 9;
    s := n::text;
  end loop;
  return n;
end $$;
revoke all on function private.life_path(date) from public, anon, authenticated;

create or replace function public.my_cosmic()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c private.cosmic;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from profiles where id = me) then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  select * into c from private.cosmic where user_id = me;
  return jsonb_build_object(
    'me', case when c.user_id is null then jsonb_build_object('on', false)
               else jsonb_build_object('on', true, 'birth_date', c.birth_date, 'birth_time', c.birth_time, 'moon', c.moon) end,
    'pairs', coalesce((select jsonb_agg(jsonb_build_object(
        'profile_id', x.other,
        'score', case when c.user_id is not null and o.user_id is not null then (select sum(v::numeric) from jsonb_each_text(private.guna(c.moon, o.moon)) e(k, v)) end,
        'kootas', case when c.user_id is not null and o.user_id is not null then private.guna(c.moon, o.moon) end,
        'my_number', case when c.user_id is not null and o.user_id is not null then private.life_path(c.birth_date) end,
        'their_number', case when c.user_id is not null and o.user_id is not null then private.life_path(o.birth_date) end))
      from (select distinct case when i.from_id = me then i.to_id else i.from_id end as other
            from invites i
            where i.status = 'kept' and i.from_friend is null and i.to_friend is null and me in (i.from_id, i.to_id)) x
      left join private.cosmic o on o.user_id = x.other
      where private.matched(me, x.other)), '[]'));
end $$;

create or replace function public.cosmic_save(p_date date, p_time text, p_moon numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  my_age int;
  today date;
  age int;
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  select p.age into my_age from profiles p where p.id = me;
  if my_age is null then raise exception using errcode = 'PL002', message = 'Finish setting up first.'; end if;
  today := (now() at time zone 'Asia/Kolkata')::date;
  age := extract(year from age(today, p_date))::int;
  if p_date is null or p_moon is null or p_moon < 0 or p_moon >= 360 or age < 18 or age > 99 then
    raise exception using errcode = 'PL246', message = 'That birth date does not look right.';
  end if;
  if abs(age - my_age) > 1 then raise exception using errcode = 'PL247', message = 'Your birth date does not match the age on your card.'; end if;
  if p_time is not null and p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception using errcode = 'PL248', message = 'Pick a birth time like 08:30, or leave it empty.';
  end if;
  insert into private.cosmic (user_id, birth_date, birth_time, moon) values (me, p_date, p_time, round(p_moon, 2))
  on conflict (user_id) do update set birth_date = excluded.birth_date, birth_time = excluded.birth_time, moon = excluded.moon, updated_at = now();
  return public.my_cosmic();
end $$;

-- Off: the birth details are deleted at once.
create or replace function public.cosmic_off()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  delete from private.cosmic where user_id = auth.uid();
  return public.my_cosmic();
end $$;

revoke all on function public.my_cosmic(), public.cosmic_save(date, text, numeric), public.cosmic_off() from public, anon;
grant execute on function public.my_cosmic(), public.cosmic_save(date, text, numeric), public.cosmic_off() to authenticated;

-- The data download has my birth details while it is on.
do $$ begin
  execute 'alter function public.export_my_data() rename to export_before_cosmic';
  execute 'alter function public.export_before_cosmic() set schema private';
end $$;
revoke all on function private.export_before_cosmic() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return private.export_before_cosmic() || jsonb_build_object(
    'cosmic_match', (select jsonb_build_object('birth_date', c.birth_date, 'birth_time', c.birth_time, 'moon', c.moon, 'updated_at', c.updated_at)
      from private.cosmic c where c.user_id = auth.uid()));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
