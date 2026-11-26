-- Spicy mode (D103), after self_love.sql. People of their own: A and B (shown to each other on
-- Discover, no plan, day one), C (shares an ask with A, not yet met), E (on, but A was never shown
-- E), D (an account with no phone or email), and N (no profile yet).
\set ON_ERROR_STOP on
\pset tuples_only on
\ir spicy_cases.sql
\set a '00000000-0000-0000-0000-00000005c1c1'
\set b '00000000-0000-0000-0000-00000005c1c2'
\set c '00000000-0000-0000-0000-00000005c1c3'
\set d '00000000-0000-0000-0000-00000005c1c4'
\set n '00000000-0000-0000-0000-00000005c1c5'
\set e '00000000-0000-0000-0000-00000005c1c6'
insert into auth.users (id, email) values (:'a', 'a@example.test'), (:'b', 'b@example.test'), (:'c', 'c@example.test'), (:'n', 'n@example.test'), (:'e', 'e@example.test');
insert into auth.users (id, is_anonymous) values (:'d', true);
insert into public.profiles (id, name, age, area) values (:'a', 'Asha', 25, 'Bandra'), (:'b', 'Bilal', 26, 'Khar'), (:'c', 'Chirag', 27, 'Juhu'), (:'d', 'Dia', 24, 'Juhu'), (:'e', 'Esha', 23, 'Juhu');
-- Day one: Discover showed A and B to each other. C asked A out; nothing is kept yet.
insert into private.discover_seen (user_id, card_id) values (:'a', :'b'), (:'b', :'a');
-- D107: the quiz on the Spicy terms comes before any of this (tests/db/spicy_quiz.sql checks it);
-- these people passed it for the terms in force.
insert into public.consents (user_id, kind, version) select u, 'spicy', 'spicy-' || private.spicy_terms_version() from unnest(array[:'a', :'b', :'c', :'d', :'e']::uuid[]) u;
insert into public.invites (from_id, to_id, idea_id, minutes, starts_at, expires_at, place, status)
  values (:'c', :'a', 'boba_run', 25, now() + interval '2 days', now() + interval '1 day', 'Carter Road', 'sent');

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


-- Only one of two on: nothing shows.
select t.as_user(:'b');
select t.ok((select spicy_with(:'a')) = '{"open": false}'::jsonb, 'B (off) sees nothing on A''s card');
select t.ok(t.sqlstate(format('select spicy_yes(%L, true)', :'a')) = 'PL130', 'and cannot say yes (PL130)');
select t.as_user(:'a');
select t.ok((select spicy_with(:'b')) = '{"open": false}'::jsonb, 'A (on) is not told whether B has it on');
select save_spicy(true, true, '', 'asha_tg', '', '{words_only}');
select t.ok((select my_spicy() @> '{"discord": null, "telegram": "asha_tg", "boundaries": ["words_only"]}'::jsonb), 'saving while on replaces the usernames and boundaries');
select save_spicy(true, true, 'asha.k', 'asha_k', '', '{ask_first,slow}');

-- Both on, from day one with no plan: boundaries show, usernames wait for both yeses.
select t.as_user(:'b');
select save_spicy(true, true, 'bilal.b', '', 'Bilal.07', '{no_photos}');
select t.ok((select spicy_with(:'a') @> '{"open": true, "my_yes": false, "mutual": false, "their_boundaries": ["ask_first", "slow"], "discord": null}'::jsonb), 'both on, day one: B sees A''s boundaries, not A''s usernames');
select spicy_yes(:'a', true);
select t.ok((select spicy_with(:'a') @> '{"my_yes": true, "mutual": false, "discord": null, "telegram": null, "signal": null}'::jsonb), 'one yes: still no usernames');
select t.as_user(:'a');
select t.ok((select spicy_with(:'b') @> '{"open": true, "my_yes": false, "mutual": false}'::jsonb), 'A is not told that B said yes');
select spicy_yes(:'b', true);
-- D105: both yes, and the usernames wait for the 600-credit unlock (one pays all, or 300 each).
select t.ok((select spicy_with(:'b') @> '{"mutual": true, "discord": null, "signal": null, "unlock": {"mine": 0, "theirs": 0, "done": false}}'::jsonb), 'both yes: still no usernames until the match is unlocked');
reset role;
insert into private.wallets (user_id, paid) values (:'a', 600);
set role authenticated;
select t.as_user(:'a');
select spicy_pay(:'b', 'full');
select t.ok((select spicy_with(:'b') @> '{"mutual": true, "discord": "bilal.b", "telegram": null, "signal": "bilal.07", "their_boundaries": ["no_photos"]}'::jsonb), 'both yes and unlocked: A gets B''s Discord and Signal');
select t.as_user(:'b');
select t.ok((select spicy_with(:'a') @> '{"mutual": true, "discord": "asha.k", "telegram": "asha_k"}'::jsonb), 'and B gets A''s Discord and Telegram');
select spicy_yes(:'a', false);
select t.ok((select spicy_with(:'a') @> '{"my_yes": false, "mutual": false, "discord": null}'::jsonb), 'B takes the yes back: the usernames are hidden again');
select spicy_yes(:'a', true);

-- An ask is enough too; someone A was never shown and shares nothing with sees nothing.
select t.as_user(:'c');
select save_spicy(true, true, 'chirag.c', '', '', '{}');
select t.ok((select spicy_with(:'a') ->> 'open')::boolean, 'C, who asked A out, sees Spicy on A''s card before they meet');
select t.as_user(:'e');
select save_spicy(true, true, 'esha.e', '', '', '{}');
select t.ok((select spicy_with(:'a')) = '{"open": false}'::jsonb and t.sqlstate(format('select spicy_yes(%L, true)', :'a')) = 'PL130', 'E, never shown A, cannot probe A (PL130)');
select t.ok((select spicy_with(:'e')) = '{"open": false}'::jsonb, 'and nobody opens it with themselves');
select t.ok(t.fails('select * from private.spicy') and t.fails('select * from private.spicy_yes'), 'no client can read the Spicy tables');
select t.ok(t.fails(format($$insert into private.spicy_yes (user_id, other_id) values (%L, %L)$$, :'a', :'b')), 'or write them');
select t.ok(not (export_my_data()::text like '%asha.k%') and not (my_spicy()::text like '%asha%'), 'E''s own Spicy and export never carry A''s username');

-- One tap off wipes it, and it closes for both.
select t.as_user(:'a');
select spicy_off();
select t.ok((select my_spicy()) @> '{"on": false, "discord": null, "telegram": null, "boundaries": []}'::jsonb, 'one tap: off and nothing kept');
select t.as_user(:'b');
select t.ok((select spicy_with(:'a')) = '{"open": false}'::jsonb, 'B no longer sees anything of A''s');
reset role;
select t.ok(not exists (select 1 from private.spicy where user_id = :'a') and not exists (select 1 from private.spicy_yes where :'a' in (user_id, other_id)), 'no row of A''s, or yes to A, is left');
set role authenticated;

-- A block closes it at once.
select t.as_user(:'a');
select save_spicy(true, true, 'asha.k', '', '', '{}');
select spicy_yes(:'b', true);
select t.as_user(:'b');
select spicy_yes(:'a', true);
select t.as_user(:'a');
select t.ok((select spicy_with(:'b') ->> 'mutual')::boolean, 'on again, both yes');
select block_user(:'b');
select t.as_user(:'b');
select t.ok((select spicy_with(:'a')) = '{"open": false}'::jsonb and t.sqlstate(format('select spicy_yes(%L, true)', :'a')) = 'PL130', 'after a block B sees nothing and cannot say yes');
select t.as_user(:'a');
select unblock_user(:'b');

-- The export carries mine; deleting the account takes all of it.
select export_my_data() -> 'spicy' as sp, export_my_data() ->> 'format' as fmt \gset
select t.ok((:'sp'::jsonb ->> 'discord') = 'asha.k' and jsonb_array_length(:'sp'::jsonb -> 'yes') = 1 and :'sp'::jsonb ? 'adult_at', 'A''s export holds A''s usernames, yes and when A agreed');
select t.ok(not (:'sp'::text like '%bilal%'), 'but nothing of B''s');
select t.ok(:'fmt' = 'pinkilock-export-11', 'in format 11 (the wallet, call times and Talk mode came after Spicy)');
select delete_my_account();
reset role;
select t.ok(not exists (select 1 from private.spicy where user_id = :'a') and not exists (select 1 from private.spicy_yes where user_id = :'a'), 'deleting the account removes every Spicy row');
select t.ok(not has_table_privilege('pinkilock_analytics', 'private.spicy', 'select') and not has_table_privilege('pinkilock_analytics', 'private.spicy_yes', 'select'),
  'the analytics worker cannot read Spicy');
