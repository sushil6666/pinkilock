-- Sign-in codes that say nothing about who has an account (G22, D090), after photos.sql.
-- K has an account with an email and a phone; L is anonymous; M signs in fresh.
\set ON_ERROR_STOP on
\pset tuples_only on
\set k '00000000-0000-0000-0000-0000000a0001'
\set l '00000000-0000-0000-0000-0000000a0002'
insert into auth.users (id, email, phone) values (:'k', 'kavya@example.com', '919800000001');
insert into auth.users (id, email, is_anonymous) values (:'l', 'ghost@example.com', true);

set role authenticated;
select t.as_user(:'k');
select t.ok(t.sqlstate($$select auth_code_check('email', 'kavya@example.com', 'sign_in', 'c1', null)$$) = '42501', 'no signed-in person can ask who has an account');
reset role;
set role anon;
select t.ok(t.sqlstate($$select auth_code_check('email', 'kavya@example.com', 'sign_in', 'c1', null)$$) = '42501', 'nor can anyone signed out');
reset role;

set role service_role;
select t.ok(auth_code_check('email', 'Kavya@Example.com ', 'sign_in', 'c1', null) = 'send', 'signing in: an account''s email gets a code (any case, any spaces)');
select t.ok(auth_code_check('phone', '+919800000001', 'sign_in', 'c1', null) = 'send', 'and its number, with or without the +');
select t.ok(auth_code_check('email', 'nobody@example.com', 'sign_in', 'c1', null) = 'skip', 'an address with no account gets nothing');
select t.ok(auth_code_check('email', 'ghost@example.com', 'sign_in', 'c1', null) = 'skip', 'nor does one held only by an anonymous account');
reset role;
delete from private.auth_code_requests;
set role service_role;
select t.ok(auth_code_check('email', 'kavya@example.com', 'link', 'c2', :'l') = 'skip', 'linking someone else''s email gets nothing');
select t.ok(auth_code_check('email', 'new@example.com', 'link', 'c2', :'l') = 'send', 'linking a free email gets a code');
select t.ok(t.sqlstate($$select auth_code_check('email', 'new2@example.com', 'link', 'c2', null)$$) = 'PL001', 'linking needs an account (PL001)');
select t.ok(t.sqlstate($$select auth_code_check('fax', 'x', 'sign_in', 'c2', null)$$) = 'PL111', 'only email and phone (PL111)');

reset role;
delete from private.auth_code_requests;
set role service_role;
-- Limits: one a minute and three a quarter-hour per address, ten an hour per caller, and the
-- same answer whether the address has an account or not.
select auth_code_check('email', 'kavya@example.com', 'sign_in', 'c9', null), auth_code_check('email', 'nobody@example.com', 'sign_in', 'c9', null);
select t.ok(t.sqlstate($$select auth_code_check('email', 'kavya@example.com', 'sign_in', 'c9', null)$$) = 'PL112', 'a second code for one address within a minute waits (PL112)');
select t.ok(t.sqlstate($$select auth_code_check('email', 'nobody@example.com', 'sign_in', 'c9', null)$$) = 'PL112', 'the same for an address with no account');
reset role;
update private.auth_code_requests set at = at - interval '2 minutes';
set role service_role;
select t.ok(t.sqlstate($$select auth_code_check('email', 'kavya@example.com', 'sign_in', 'c9', null)$$) is null, 'a minute later, a second one is sent');
reset role;
update private.auth_code_requests set at = at - interval '2 minutes';
set role service_role;
select t.ok(t.sqlstate($$select auth_code_check('email', 'kavya@example.com', 'sign_in', 'c9', null)$$) is null, 'and a third');
reset role;
update private.auth_code_requests set at = at - interval '2 minutes';
set role service_role;
select t.ok(t.sqlstate($$select auth_code_check('email', 'kavya@example.com', 'sign_in', 'c9', null)$$) = 'PL112', 'three in a quarter-hour is the most for one address');
select t.ok((select count(*) from generate_series(1, 9) n where auth_code_check('email', 'a' || n || '@example.com', 'sign_in', 'c10', null) = 'skip') = 9, 'one caller tries nine addresses');
select t.ok(t.sqlstate($$select auth_code_check('email', 'a10@example.com', 'sign_in', 'c10', null)$$) is null, 'the tenth is allowed');
select t.ok(t.sqlstate($$select auth_code_check('email', 'a11@example.com', 'sign_in', 'c10', null)$$) = 'PL112', 'the eleventh in an hour waits');
reset role;
select t.ok(not exists (select 1 from private.auth_code_requests where address_key like '%@%' or address_key like '%kavya%'), 'addresses are kept only as hashes');
select t.ok(exists (select 1 from cron.job where jobname = 'pinkilock-auth-code-retention'), 'requests are cleared after a day');
