-- Discover while someone deletes their account (found by CI on PR #80, local-stack, attempt 1:
-- safety.test.ts's discover() failed with PC002 while photos.test.ts deleted its users). discover()
-- picks the cards, then records each as shown in private.discover_seen, whose card_id references
-- auth.users: an account deleted in between broke the whole page with a foreign key error.
-- A test-only trigger deletes the card's account at exactly that moment.
\set ON_ERROR_STOP on
\pset tuples_only on
\set v '00000000-0000-0000-0000-0000000d0001'
\set gone '00000000-0000-0000-0000-0000000d0002'
\set stays '00000000-0000-0000-0000-0000000d0003'
insert into auth.users (id) values (:'v'), (:'gone'), (:'stays');
insert into public.profiles (id, name, age, area, city) values
  (:'v', 'Vani', 25, 'Bandra', 'Racetown'), (:'gone', 'Gopal', 26, 'Bandra', 'Racetown'), (:'stays', 'Sara', 24, 'Bandra', 'Racetown');

create function t.vanish() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.card_id = '00000000-0000-0000-0000-0000000d0002' then
    delete from auth.users where id = new.card_id;
  end if;
  return new;
end $$;
create trigger t_vanish before insert on private.discover_seen for each row execute function t.vanish();

set role authenticated;
select t.as_user(:'v');
select t.ok(t.sqlstate($$select count(*) from discover(20)$$) is null,
  'Discover still answers when an account on the page is deleted while it is being served');
select t.ok((select array_agg(id::text) from discover(20)) = array[:'stays'],
  'and shows the cards that are still there');
reset role;

drop trigger t_vanish on private.discover_seen;
drop function t.vanish();
