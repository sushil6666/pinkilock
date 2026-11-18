-- Limits and the link gate (docs/build-plan.md, WP2), on people of their own: L (linked), N (no email
-- or phone yet), M (linked). Runs after venues.sql.
\set ON_ERROR_STOP on
\pset tuples_only on
\set l '00000000-0000-0000-0000-0000000000b1'
\set n '00000000-0000-0000-0000-0000000000b2'
\set m '00000000-0000-0000-0000-0000000000b3'

insert into auth.users (id, is_anonymous) values (:'l', false), (:'n', true), (:'m', false);
insert into public.profiles (id, name, age, area) values (:'l', 'Lina', 25, 'Bandra'), (:'n', 'Neel', 26, 'Khar'), (:'m', 'Mira', 24, 'Juhu');
insert into public.profile_private (profile_id, contact_kind, contact_handle) values (:'l', 'Instagram', '@lina'), (:'n', 'Instagram', '@neel'), (:'m', 'Instagram', '@mira');

select t.ok((select value from private.config where key = 'require_linked') = 'false', 'the link gate starts off');
set role authenticated;
select t.as_user(:'n');
select t.ok(t.fails('select * from private.config'), 'a user cannot read the server switches');
select t.ok(t.fails($$select private.set_config('require_linked', 'false')$$), 'a user cannot flip a switch');

-- Gate off: an anonymous account can play, as before.
select (send_invite(:'l', 'boba_run', now() + interval '2 hours', '', '')).id as nl \gset
select t.ok((select status from invites where id = :'nl') = 'sent', 'gate off: an account with no email or phone can send an ask');
select decline_invite(:'nl');

-- Gate on.
reset role;
select private.set_config('require_linked', 'true');
set role authenticated;
select t.as_user(:'n');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'chai_walk', now() + interval '2 hours', '', '')$$, :'m')) = 'PL068', 'gate on: no ask without an email or phone (PL068)');
select t.as_user(:'l');
select (send_invite(:'n', 'chai_walk', now() + interval '2 hours', '', '')).id as ln \gset
select t.ok(:'ln' is not null, 'gate on: a linked account still asks');
select t.as_user(:'n');
select t.ok(t.sqlstate(format('select offer_pinky(%L)', :'ln')) = 'PL068', 'gate on: no pinky without an email or phone (PL068)');
select t.ok((decline_invite(:'ln')).status = 'declined', 'gate on: passing on an ask needs nothing');
reset role;
update auth.users set is_anonymous = false where id = :'n';
set role authenticated;
select t.as_user(:'n');
select t.ok((send_invite(:'m', 'chai_walk', now() + interval '2 hours', '', '')).status = 'sent', 'once an email or phone is linked, the same account asks');
reset role;
select private.set_config('require_linked', 'false');
set role authenticated;

-- Seven days after a pass, not before.
select t.as_user(:'l');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '3 hours', '', '')$$, :'n')) = 'PL026', 'L cannot ask N again right after N passed (PL026)');
reset role;
update public.invites set resolved_at = now() - interval '8 days', created_at = now() - interval '8 days' where id = :'ln';
set role authenticated;
select t.as_user(:'l');
select t.ok((send_invite(:'n', 'boba_run', now() + interval '3 hours', '', '')).status = 'sent', 'a week later, L can ask N again');
select t.as_user(:'n');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'momo_stop', now() + interval '3 hours', '', '')$$, :'l')) = 'PL024', 'the limit is about the asker: N is refused only because something is open');

-- Twenty profile saves a day.
select t.as_user(:'m');
select give_consents(array['adult', 'terms', 'privacy', 'sensitive']);
select save_profile('Mira', 24, 'Juhu', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@mira') from generate_series(1, 20);
select t.ok(t.sqlstate($$select save_profile('Mira', 24, 'Juhu', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$) = 'PL027', 'the 21st profile save in a day is refused (PL027)');

-- Passes are counted even when the same row is written again.
select pass_profile(:'l');
select restore_passes();
select pass_profile(:'l');
reset role;
select t.ok((select count(*) from private.actions where user_id = :'m' and kind = 'pass') = 2, 'every pass is counted, even after the row was deleted and written again');
select t.ok((select schedule from cron.job where jobname = 'pinkilock-actions-retention') = '23 3 * * *', 'the action log is cleared daily');
