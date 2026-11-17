-- Push: the outbox that the scenario filled, device tokens, and the check-in announcement.
-- Runs after scenario.sql and the analytics checks (it adds a plan of its own).
\set ON_ERROR_STOP on
\pset tuples_only on
\set a '00000000-0000-0000-0000-00000000000a'
\set b '00000000-0000-0000-0000-00000000000b'
\set c '00000000-0000-0000-0000-00000000000c'

-- What the scenario should have queued, as "kind>recipient", per invite.
create temp view queued as
  select i.from_id, i.to_id, string_agg(n.kind || '>' || right(n.recipient_id::text, 1), ' ' order by n.id) as trail
  from public.invites i join public.notifications n on n.invite_id = i.id group by i.id;
select t.ok((select trail from queued where (from_id, to_id) = (:'a', :'b')) = 'new_ask>b pinky_out>a locked>b',
  'kept plan: ask to B, pinky to A, lock to B, and nothing more');
select t.ok((select trail from queued where (from_id, to_id) = (:'a', :'c')) = 'new_ask>c pinky_out>a locked>c bailed>c',
  'bail: the person bailed on is told, the bailer is not');
select t.ok((select trail from queued where (from_id, to_id) = (:'c', :'a')) = 'new_ask>a pinky_out>c locked>a no_show>c missed>a',
  'no-show: both are told, each their own side');
select t.ok((select trail from queued where (from_id, to_id) = (:'b', :'c')) = 'new_ask>c', 'an expired ask announces nothing');
select t.ok((select title || ' / ' || body from public.notifications where kind = 'bailed') = 'Asha bailed / 10-min video coffee is off. Their score takes the hit, not yours.',
  'the bail reads as written');

-- A notification may only say what its recipient can already read.
select t.ok(not exists (select 1 from public.notifications n join public.invites i on i.id = n.invite_id where n.recipient_id not in (i.from_id, i.to_id)),
  'every recipient is one of the two people on the invite');
select t.ok(not exists (select 1 from public.notifications n, public.profile_private p where position(p.contact_handle in n.title || ' ' || n.body) > 0),
  'no notification contains a contact handle');

set role authenticated;
select t.as_user(:'a');
select t.ok(t.fails('select count(*) from notifications'), 'a user cannot read the outbox');
select t.ok(t.fails('select count(*) from push_tokens'), 'a user cannot read device tokens');
select t.ok(t.fails('select claim_notifications(10)'), 'a user cannot claim notifications');
select t.ok(t.fails($$select set_push_config('http://evil', 'x')$$), 'a user cannot point pushes elsewhere');
select t.ok(t.fails($$select queue_notification('00000000-0000-0000-0000-00000000000b', (select id from invites limit 1), 'new_ask', 'spoof', 'spoof')$$),
  'a user cannot queue a notification');
select t.ok(t.fails($$select register_push_token('not-a-token', 'android')$$), 'a malformed token is refused');
select register_push_token('ExponentPushToken[phone-one]', 'android');
select register_push_token('ExponentPushToken[phone-one]', 'android');
select t.as_user(:'b');
select register_push_token('ExponentPushToken[phone-two]', 'ios');
reset role;
select t.ok((select count(*) from public.push_tokens) = 2, 'registering twice keeps one row per device');
-- The same phone, now signed in as B.
set role authenticated;
select register_push_token('ExponentPushToken[phone-one]', 'android');
reset role;
select t.ok((select profile_id from public.push_tokens where token = 'ExponentPushToken[phone-one]') = :'b', 'a device token follows whoever registered it last');
set role authenticated;
select t.as_user(:'a');
select unregister_push_token('ExponentPushToken[phone-one]');
reset role;
select t.ok((select count(*) from public.push_tokens) = 2, 'A cannot unregister a device that is now B''s');
set role anon;
select t.ok(t.fails($$select register_push_token('ExponentPushToken[x]', 'ios')$$), 'anon cannot register a device');
reset role;

-- Check-in opens: the sweep tells whoever has not checked in, once.
set role authenticated;
select t.as_user(:'b');
select (send_invite(:'a', 'chai_walk', now() + interval '1 hour', 'Carter Road', '')).id as ba \gset
select t.as_user(:'a');
select offer_pinky(:'ba') is not null;
select t.as_user(:'b');
select offer_pinky(:'ba') is not null;
reset role;
select public.sweep_invites() is not null;
select t.ok((select count(*) from public.notifications where invite_id = :'ba' and kind = 'checkin_open') = 0, 'no check-in push an hour early');
update public.invites set starts_at = now() + interval '9 minutes' where id = :'ba';
set role authenticated;
select t.check_in(:'ba') is not null;
reset role;
select public.sweep_invites() is not null;
select public.sweep_invites() is not null;
select t.ok((select string_agg(right(recipient_id::text, 1), ',') from public.notifications where invite_id = :'ba' and kind = 'checkin_open') = 'a',
  'check-in open goes once, and only to the one who has not checked in');
select t.ok((select body from public.notifications where invite_id = :'ba' and kind = 'checkin_open') = 'Chai and a walk with Bela. Check in when you are there, or it counts as a flake.',
  'the check-in push names the plan and the other person');

-- Claiming: one batch takes everything once; a second run finds nothing.
set role service_role;
select t.ok((select count(*) from claim_notifications(100)) = (select count(*) from notifications), 'the service role claims the whole outbox');
select t.ok((select count(*) from claim_notifications(100)) = 0, 'a second claim finds nothing to send twice');
reset role;
