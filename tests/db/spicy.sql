-- Spicy mode (D103), after self_love.sql. People of their own: A and B (kept a plan), C (never met
-- A), D (an account with no phone or email), and N (no profile yet).
\set ON_ERROR_STOP on
\pset tuples_only on
\ir spicy_cases.sql
\set a '00000000-0000-0000-0000-00000005c1c1'
\set b '00000000-0000-0000-0000-00000005c1c2'
\set c '00000000-0000-0000-0000-00000005c1c3'
\set d '00000000-0000-0000-0000-00000005c1c4'
\set n '00000000-0000-0000-0000-00000005c1c5'
insert into auth.users (id, email) values (:'a', 'a@example.test'), (:'b', 'b@example.test'), (:'c', 'c@example.test'), (:'n', 'n@example.test');
insert into auth.users (id, is_anonymous) values (:'d', true);
insert into public.profiles (id, name, age, area) values (:'a', 'Asha', 25, 'Bandra'), (:'b', 'Bilal', 26, 'Khar'), (:'c', 'Chirag', 27, 'Juhu'), (:'d', 'Dia', 24, 'Juhu');
insert into public.invites (id, from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  values ('00000000-0000-0000-0000-0000005c1a01', :'b', :'a', 'boba_run', 25, now() - interval '2 days', now() - interval '3 days', 'Carter Road', 'kept'),
         ('00000000-0000-0000-0000-0000005c1a02', :'c', :'a', 'boba_run', 25, now() + interval '2 days', now() + interval '1 day', 'Carter Road', 'locked');
\set ab '00000000-0000-0000-0000-0000005c1a01'
\set ac '00000000-0000-0000-0000-0000005c1a02'

-- The username rules: SQL and src/domain/spicy.ts agree on every line of the shared table.
create function pg_temp.spicy_result(p_app text, p_typed text) returns text language plpgsql as $$
begin
  return coalesce(private.spicy_username(p_app, p_typed), '');
exception when others then
  return sqlstate;
end $$;
select t.ok(bad is null, coalesce('every shared username line gives the same answer in SQL (' || bad || ')', 'every shared username line gives the same answer in SQL'))
  from (select string_agg(format('%s %L: %s, want %s', app, typed, pg_temp.spicy_result(app, typed), want), '; ')
          filter (where pg_temp.spicy_result(app, typed) <> want) as bad from spicy_cases) c;

set role authenticated;
select t.as_user(:'n');
select t.ok(t.sqlstate('select my_spicy()') = 'PL002', 'Spicy needs a profile first (PL002)');

-- Off by default.
select t.as_user(:'a');
select t.ok((select my_spicy() ->> 'on')::boolean = false, 'Spicy is off for a new person');

-- Turning it on takes both yeses, a linked account, a username that is not a phone number, and listed boundaries.
select t.ok(t.sqlstate($$select save_spicy(false, true, 'asha.k', '', '', '{}')$$) = 'PL127'
  and t.sqlstate($$select save_spicy(true, false, 'asha.k', '', '', '{}')$$) = 'PL127'
  and t.sqlstate($$select save_spicy(null, null, 'asha.k', '', '', '{}')$$) = 'PL127', 'both the 18+ yes and the safety rules come first (PL127)');
select t.ok(t.sqlstate($$select save_spicy(true, true, '+91 98765 43210', '', '', '{}')$$) = 'PL123'
  and t.sqlstate($$select save_spicy(true, true, 'asha.k', '9876543210', '', '{}')$$) = 'PL123', 'a phone number is refused in either field (PL123)');
select t.ok(t.sqlstate($$select save_spicy(true, true, '', '', '', '{}')$$) = 'PL126', 'at least one username (PL126)');
select t.ok(t.sqlstate($$select save_spicy(true, true, 'asha.k', '', '', '{anything_goes}')$$) = 'PL129', 'boundaries come from the list (PL129)');
select t.ok((select my_spicy() ->> 'on')::boolean = false, 'a refused try leaves it off');
select save_spicy(true, true, ' Asha.K ', '@Asha_K', '', '{slow,ask_first,slow}');
select t.ok((select my_spicy() @> '{"on": true, "discord": "asha.k", "telegram": "asha_k", "signal": null, "boundaries": ["ask_first", "slow"]}'::jsonb), 'on, with the usernames stored in their plain form');
select t.ok(t.sqlstate($$select save_spicy(true, true, '', '', 'asha', '{}')$$) = 'PL131', 'a Signal username needs its dot and numbers (PL131)');

select t.as_user(:'d');
select t.ok(t.sqlstate($$select save_spicy(true, true, 'dia.x', '', '', '{}')$$) = 'PL128', 'an account with no phone or email cannot turn it on (PL128)');

-- Only one of two on: the plan says nothing.
select t.as_user(:'b');
select t.ok((select spicy_plan(:'ab')) = '{"open": false}'::jsonb, 'B (off) sees nothing on the plan with A');
select t.ok(t.sqlstate(format('select spicy_yes(%L, true)', :'ab')) = 'PL130', 'and cannot say yes (PL130)');
select t.as_user(:'a');
select t.ok((select spicy_plan(:'ab')) = '{"open": false}'::jsonb, 'A (on) is not told whether B has it on');
select save_spicy(true, true, '', 'asha_tg', '', '{words_only}');
select t.ok((select my_spicy() @> '{"discord": null, "telegram": "asha_tg", "boundaries": ["words_only"]}'::jsonb), 'saving while on replaces the usernames and boundaries');
select save_spicy(true, true, 'asha.k', 'asha_k', '', '{ask_first,slow}');

-- Both on, after a kept plan: boundaries show, usernames wait for both yeses.
select t.as_user(:'b');
select save_spicy(true, true, 'bilal.b', '', 'Bilal.07', '{no_photos}');
select t.ok((select spicy_plan(:'ab') @> '{"open": true, "my_yes": false, "mutual": false, "their_boundaries": ["ask_first", "slow"], "discord": null}'::jsonb), 'both on: B sees A''s boundaries, not A''s usernames');
select spicy_yes(:'ab', true);
select t.ok((select spicy_plan(:'ab') @> '{"my_yes": true, "mutual": false, "discord": null, "telegram": null, "signal": null}'::jsonb), 'one yes: still no usernames');
select t.as_user(:'a');
select t.ok((select spicy_plan(:'ab') @> '{"open": true, "my_yes": false, "mutual": false}'::jsonb), 'A is not told that B said yes');
select spicy_yes(:'ab', true);
select t.ok((select spicy_plan(:'ab') @> '{"mutual": true, "discord": "bilal.b", "telegram": null, "signal": "bilal.07", "their_boundaries": ["no_photos"]}'::jsonb), 'both yes: A gets B''s Discord and Signal');
select t.as_user(:'b');
select t.ok((select spicy_plan(:'ab') @> '{"mutual": true, "discord": "asha.k", "telegram": "asha_k"}'::jsonb), 'and B gets A''s Discord and Telegram');
select spicy_yes(:'ab', false);
select t.ok((select spicy_plan(:'ab') @> '{"my_yes": false, "mutual": false, "discord": null}'::jsonb), 'B takes the yes back: the usernames are hidden again');
select spicy_yes(:'ab', true);

-- A plan that was not kept, and someone A never met, see nothing.
select t.as_user(:'c');
select save_spicy(true, true, 'chirag.c', '', '', '{}');
select t.ok((select spicy_plan(:'ac')) = '{"open": false}'::jsonb and t.sqlstate(format('select spicy_yes(%L, true)', :'ac')) = 'PL130', 'a plan not yet kept stays closed (PL130)');
select t.ok((select spicy_plan(:'ab')) = '{"open": false}'::jsonb and t.sqlstate(format('select spicy_yes(%L, true)', :'ab')) = 'PL130', 'C cannot open or say yes on A and B''s plan');
select t.ok(t.fails('select * from private.spicy') and t.fails('select * from private.spicy_yes'), 'no client can read the Spicy tables');
select t.ok(t.fails(format($$insert into private.spicy_yes (invite_id, user_id) values (%L, %L)$$, :'ab', :'a')), 'or write them');
select t.ok(not (export_my_data()::text like '%asha.k%') and not (my_spicy()::text like '%asha%'), 'C''s own Spicy and export never carry A''s username');

-- One tap off wipes it, and the plan closes for both.
select t.as_user(:'a');
select spicy_off();
select t.ok((select my_spicy()) @> '{"on": false, "discord": null, "telegram": null, "boundaries": []}'::jsonb, 'one tap: off and nothing kept');
select t.as_user(:'b');
select t.ok((select spicy_plan(:'ab')) = '{"open": false}'::jsonb, 'B no longer sees anything of A''s');
reset role;
select t.ok(not exists (select 1 from private.spicy where user_id = :'a') and not exists (select 1 from private.spicy_yes where user_id = :'a'), 'no row of A''s is left');
set role authenticated;

-- A block closes it at once.
select t.as_user(:'a');
select save_spicy(true, true, 'asha.k', '', '', '{}');
select spicy_yes(:'ab', true);
select t.ok((select spicy_plan(:'ab') ->> 'mutual')::boolean, 'on again, both yes');
select block_user(:'b');
select t.as_user(:'b');
select t.ok((select spicy_plan(:'ab')) = '{"open": false}'::jsonb and t.sqlstate(format('select spicy_yes(%L, true)', :'ab')) = 'PL130', 'after a block B sees nothing and cannot say yes');
select t.as_user(:'a');
select unblock_user(:'b');

-- The export carries mine; deleting the account takes all of it.
select export_my_data() -> 'spicy' as sp, export_my_data() ->> 'format' as fmt \gset
select t.ok((:'sp'::jsonb ->> 'discord') = 'asha.k' and jsonb_array_length(:'sp'::jsonb -> 'yes') = 1 and :'sp'::jsonb ? 'adult_at', 'A''s export holds A''s usernames, yes and when A agreed');
select t.ok(not (:'sp'::text like '%bilal%'), 'but nothing of B''s');
select t.ok(:'fmt' = 'pinkilock-export-8', 'in format 8');
select delete_my_account();
reset role;
select t.ok(not exists (select 1 from private.spicy where user_id = :'a') and not exists (select 1 from private.spicy_yes where user_id = :'a'), 'deleting the account removes every Spicy row');
select t.ok(not has_table_privilege('pinkilock_analytics', 'private.spicy', 'select') and not has_table_privilege('pinkilock_analytics', 'private.spicy_yes', 'select'),
  'the analytics worker cannot read Spicy');
