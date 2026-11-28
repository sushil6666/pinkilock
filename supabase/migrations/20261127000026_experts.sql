-- Expert tips (D127): help for dating, getting ready for marriage, working through conflict, and
-- healing after a breakup, from people who know the field: licensed marriage and relationship
-- therapists, dating and relationship coaches, intimacy and relationship counsellors (educational
-- only, nothing to do with Spicy), and spiritual and philosophical guides (wellbeing perspectives,
-- open to all faiths, not therapy or medical advice).
--
--   * Until real experts are vetted, the app shows general tips written by the team, labelled so.
--     No expert name or credential is ever made up: `public.experts` starts empty and only the
--     team adds a row, after checking the licence or certificate (OPERATIONS.md, "Experts").
--   * Never listed, or taken off at once: anyone who promises guaranteed results or a "guaranteed
--     soulmate", teaches manipulation or pickup tactics, or asks for money for remedies or mystical
--     cures (Sushil's rule), or offers anything sexual.
--   * Anyone signed in can report an expert; the report goes to the team, like report_user.
--   * Experts can ask to join (`expert_apply`): a pitch page and a short form. Sessions with
--     experts come later, with the CA's and lawyer's sign-off; nothing is booked or paid here.

create table public.experts (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  kind text not null check (kind in ('therapist', 'coach', 'intimacy', 'spiritual')),
  credential text not null check (char_length(credential) between 2 and 160),
  city text,
  languages text[] not null default '{}',
  bio text not null default '' check (char_length(bio) <= 600),
  verified_at timestamptz not null default now(),
  active boolean not null default true
);
create table public.expert_tips (
  id bigint generated always as identity primary key,
  expert_id uuid not null references public.experts (id),
  topic text not null check (topic in ('dating', 'premarital', 'conflict', 'breakup')),
  title text not null check (char_length(title) between 2 and 120),
  body text not null check (char_length(body) between 2 and 1200),
  lang text not null default 'en',
  active boolean not null default true,
  at timestamptz not null default now()
);
create table private.expert_reports (
  id bigint generated always as identity primary key,
  expert_id uuid not null references public.experts (id),
  reporter uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('guaranteed', 'manipulation', 'money_cures', 'sexual', 'other')),
  detail text not null default '' check (char_length(detail) <= 500),
  at timestamptz not null default now(),
  unique (expert_id, reporter)
);
create table private.expert_applications (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  kind text not null check (kind in ('therapist', 'coach', 'intimacy', 'spiritual')),
  credential text not null check (char_length(credential) between 2 and 160),
  city text not null check (char_length(city) between 2 and 60),
  contact text not null check (char_length(contact) between 5 and 120),
  note text not null default '' check (char_length(note) <= 600),
  agreed_rules boolean not null check (agreed_rules),
  status text not null default 'new' check (status in ('new', 'talking', 'listed', 'declined')),
  at timestamptz not null default now(),
  unique (user_id)
);
alter table public.experts enable row level security;
alter table public.expert_tips enable row level security;
alter table private.expert_reports enable row level security;
alter table private.expert_applications enable row level security;
revoke all on public.experts, public.expert_tips, private.expert_reports, private.expert_applications from public, anon, authenticated, service_role;

-- What the app shows: active experts with their active tips, for a topic or all, in my language
-- first. Only signed-in people.
create or replace function public.expert_tips_list(p_topic text default null, p_lang text default 'en')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if p_topic is not null and p_topic not in ('dating', 'premarital', 'conflict', 'breakup') then
    raise exception using errcode = 'PL241', message = 'Pick a topic from the list.';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'topic', x.topic, 'title', x.title, 'body', x.body,
      'expert', jsonb_build_object('id', e.id, 'name', e.name, 'kind', e.kind, 'credential', e.credential, 'city', e.city, 'languages', e.languages, 'bio', e.bio))
      order by (x.lang = coalesce(p_lang, 'en')) desc, x.at desc)
    from public.expert_tips x join public.experts e on e.id = x.expert_id
    where x.active and e.active and (p_topic is null or x.topic = p_topic)), '[]');
end $$;

create or replace function public.report_expert(p_expert uuid, p_reason text, p_detail text default '')
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not exists (select 1 from public.experts where id = p_expert) then
    raise exception using errcode = 'PL242', message = 'That expert is not listed.';
  end if;
  if p_reason is null or p_reason not in ('guaranteed', 'manipulation', 'money_cures', 'sexual', 'other') then
    raise exception using errcode = 'PL243', message = 'Pick a reason from the list.';
  end if;
  insert into private.expert_reports (expert_id, reporter, reason, detail)
  values (p_expert, me, p_reason, left(btrim(coalesce(p_detail, '')), 500))
  on conflict (expert_id, reporter) do update set reason = excluded.reason, detail = excluded.detail, at = now();
end $$;

create or replace function public.expert_apply(p_name text, p_kind text, p_credential text, p_city text, p_contact text, p_note text, p_agree boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if not coalesce(p_agree, false) then
    raise exception using errcode = 'PL244', message = 'Read and agree to the rules for experts first.';
  end if;
  if p_kind is null or p_kind not in ('therapist', 'coach', 'intimacy', 'spiritual')
     or char_length(btrim(coalesce(p_name, ''))) not between 2 and 80
     or char_length(btrim(coalesce(p_credential, ''))) not between 2 and 160
     or char_length(btrim(coalesce(p_city, ''))) not between 2 and 60
     or char_length(btrim(coalesce(p_contact, ''))) not between 5 and 120
     or char_length(coalesce(p_note, '')) > 600 then
    raise exception using errcode = 'PL245', message = 'Fill in your name, what you do, your licence or training, your city and how we can reach you.';
  end if;
  insert into private.expert_applications (user_id, name, kind, credential, city, contact, note, agreed_rules)
  values (me, btrim(p_name), p_kind, btrim(p_credential), btrim(p_city), btrim(p_contact), btrim(coalesce(p_note, '')), true)
  on conflict (user_id) do update set name = excluded.name, kind = excluded.kind, credential = excluded.credential, city = excluded.city,
    contact = excluded.contact, note = excluded.note, at = now()
  where private.expert_applications.status = 'new';
  return public.my_expert_application();
end $$;

create or replace function public.my_expert_application()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  return (select jsonb_build_object('kind', a.kind, 'status', a.status, 'at', a.at) from private.expert_applications a where a.user_id = me);
end $$;

revoke all on function public.expert_tips_list(text, text), public.report_expert(uuid, text, text),
  public.expert_apply(text, text, text, text, text, text, boolean), public.my_expert_application() from public, anon;
grant execute on function public.expert_tips_list(text, text), public.report_expert(uuid, text, text),
  public.expert_apply(text, text, text, text, text, text, boolean), public.my_expert_application() to authenticated;

-- The data download: my application and my reports.
do $$ begin
  execute 'alter function public.export_my_data() rename to export_before_experts';
  execute 'alter function public.export_before_experts() set schema private';
end $$;
revoke all on function private.export_before_experts() from public, anon, authenticated;

create or replace function public.export_my_data()
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return private.export_before_experts() || jsonb_build_object(
    'expert_application', (select jsonb_build_object('name', a.name, 'kind', a.kind, 'credential', a.credential, 'city', a.city, 'contact', a.contact,
        'note', a.note, 'status', a.status, 'at', a.at) from private.expert_applications a where a.user_id = auth.uid()),
    'expert_reports', coalesce((select jsonb_agg(jsonb_build_object('expert', r.expert_id, 'reason', r.reason, 'detail', r.detail, 'at', r.at))
      from private.expert_reports r where r.reporter = auth.uid()), '[]'));
end $$;
revoke all on function public.export_my_data() from public, anon;
grant execute on function public.export_my_data() to authenticated;
