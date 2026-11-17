-- Ask lines, change limits, line review and moderation (docs/build-plan.md, WP1), after limits.sql.
-- People of their own: H (has a line), K (looks at H), J (gets reported).
\set ON_ERROR_STOP on
\pset tuples_only on
\set h '00000000-0000-0000-0000-0000000000c1'
\set k '00000000-0000-0000-0000-0000000000c2'
\set j '00000000-0000-0000-0000-0000000000c3'
insert into auth.users (id) values (:'h'), (:'k'), (:'j');

set role authenticated;
select t.as_user(:'h');
select save_profile('Hana', 25, 'Bandra', '', 'Will judge your chai order.', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@hana');
select t.as_user(:'k');
select save_profile('Kian', 26, 'Khar', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@kian');
select t.as_user(:'j');
select save_profile('Jaya', 24, 'Juhu', '', '', '{}', array['boba_run','chai_walk','meme_duel'], 'Instagram', '@jaya');

-- Ask lines are picked.
select t.as_user(:'k');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', '', 'see you at 6, wear red')$$, :'h')) = 'PL069', 'a typed note is refused (PL069)');
select (send_invite(:'h', 'boba_run', now() + interval '2 hours', '', ' i will be early. it is a whole thing. ')).id as kh \gset
select t.ok((select note from invites where id = :'kh') = 'i will be early. it is a whole thing.', 'a line from the catalogue goes through');
select t.ok((select count(*) from ask_lines) = 40, 'the catalogue has all 40 lines');

-- Change limits: the first line and name are free; then a week for the line, a month for the name.
select t.as_user(:'h');
select t.ok(t.sqlstate($$select save_profile('Hana', 25, 'Bandra', '', 'my toxic trait: always early', '{}', array['boba_run','chai_walk','meme_duel'])$$) is null, 'the first change of the line after joining is free');
select t.ok(t.sqlstate($$select save_profile('Hana', 25, 'Bandra', '', 'green flag: texts back', '{}', array['boba_run','chai_walk','meme_duel'])$$) = 'PL071', 'a second change within 7 days is refused (PL071)');
select t.ok(t.sqlstate($$select save_profile('Hanna', 25, 'Bandra', '', 'my toxic trait: always early', '{}', array['boba_run','chai_walk','meme_duel'])$$) is null, 'the first name change is free');
select t.ok(t.sqlstate($$select save_profile('Hani', 25, 'Bandra', '', 'my toxic trait: always early', '{}', array['boba_run','chai_walk','meme_duel'])$$) = 'PL070', 'a second name change within 30 days is refused (PL070)');
select t.ok(t.sqlstate($$select save_profile('Hanna', 26, 'Khar', '', 'my toxic trait: always early', '{}', array['boba_run','chai_walk','meme_duel'])$$) is null, 'other fields change freely');

-- Review on: a new line waits, others keep seeing the old one.
reset role;
update public.profiles set tagline_changed_at = null where id = :'h';
select private.set_config('line_review', 'human');
set role authenticated;
select t.as_user(:'h');
select save_profile('Hanna', 26, 'Khar', '', 'shift each letter back by one: jotub tbn', '{}', array['boba_run','chai_walk','meme_duel']);
select t.ok((select (text, status) = ('shift each letter back by one: jotub tbn', 'pending') from my_line_review()), 'H sees their own line waiting for review');
select t.ok((select tagline from profiles where id = :'h') = 'my toxic trait: always early', 'the card still shows the last approved line');
select t.as_user(:'k');
select t.ok((select tagline from profile_cards where id = :'h') = 'my toxic trait: always early', 'K sees only the approved line (G18: a coded line never reaches anyone unreviewed)');
select t.ok((select count(*) from my_line_review()) = 0, 'K cannot see anyone else''s review');
select t.ok(t.fails('select count(*) from private.line_reviews'), 'no one can read the review queue');
select t.ok(t.fails($$select claim_line_reviews(5)$$), 'a user cannot claim reviews');
reset role;
select private.moderate(null, :'h', 'reject_line', 'reads like an encoded handle');
set role authenticated;
select t.as_user(:'h');
select t.ok((select status from my_line_review()) = 'rejected', 'H sees the line was not accepted');
select t.ok((select tagline from profiles where id = :'h') = 'my toxic trait: always early', 'a rejected line never shows');

-- The AI path: the service role claims and decides.
reset role;
update public.profiles set tagline_changed_at = null where id = :'h';
select private.set_config('line_review', 'ai');
set role authenticated;
select t.as_user(:'h');
select save_profile('Hanna', 26, 'Khar', '', 'ask me about my plants', '{}', array['boba_run','chai_walk','meme_duel']);
reset role;
set role service_role;
select t.ok((select count(*) from claim_line_reviews(5) where text = 'ask me about my plants') = 1, 'the review function claims the waiting line');
select finish_line_review(:'h', 'ask me about my plants', 'approved', 'ordinary line');
reset role;
select t.ok((select tagline from public.profiles where id = :'h') = 'ask me about my plants', 'an approved line goes on the card');
select private.set_config('line_review', 'off');

-- Reports and moderation: shared_contact, a strike, then a second strike suspends.
set role authenticated;
select t.as_user(:'k');
select report_user(:'j', 'shared_contact', 'their line spells out a number');
reset role;
select id as rep from public.reports where reported_id = :'j' and reason = 'shared_contact' \gset
select t.ok(private.moderate(:'rep', null, 'hide_line', 'number spelled out in the line') = 'hide_line done', 'a moderator hides the line');
select t.ok((select (tagline, contact_strikes, suspended_at is null) = ('', 1, true) from public.profiles where id = :'j'), 'the line is gone and J has one strike');
select t.ok((select reviewed_at is not null from public.reports where id = :'rep'), 'the report is marked reviewed');
set role authenticated;
select t.as_user(:'j');
select t.ok(t.sqlstate($$select save_profile('Jaya', 24, 'Juhu', '', 'new line', '{}', array['boba_run','chai_walk','meme_duel'])$$) = 'PL073', 'J cannot add a new line for 30 days (PL073)');
reset role;
select t.ok(private.moderate(null, :'j', 'hide_line', 'again') like 'hide_line done (second strike%', 'a second strike suspends');
set role authenticated;
select t.as_user(:'j');
select t.ok(t.sqlstate(format($$select send_invite(%L, 'boba_run', now() + interval '2 hours', '', '')$$, :'h')) = 'PL072', 'a suspended account cannot ask (PL072)');
select t.ok(t.sqlstate($$select save_profile('Jaya', 24, 'Juhu', '', '', '{}', array['boba_run','chai_walk','meme_duel'])$$) = 'PL072', 'or edit (PL072)');
select t.as_user(:'h');
select t.ok(not exists (select 1 from discover(20) where id = :'j'), 'a suspended account is out of Discover');
reset role;
select t.ok((select count(*) from private.moderation_actions where profile_id = :'j') = 2, 'every action is recorded with its reason');
select t.ok(t.sqlstate($$select private.moderate(null, null, 'explode', 'x')$$) = 'PL090', 'an unknown action is refused');
select private.moderate(null, :'j', 'unsuspend', 'appeal accepted');
select t.ok((select suspended_at is null from public.profiles where id = :'j'), 'a moderator can lift a suspension');
