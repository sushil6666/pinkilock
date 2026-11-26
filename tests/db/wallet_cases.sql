-- Generated from STAKE_CASES and PACKS in src/domain/wallet.ts. Do not edit: UPDATE_CASES=1 npm run test:unit
create temp table stake_cases (status text, flaked text, hours numeric, want text);
insert into stake_cases (status, flaked, hours, want) values
  ('locked', 'nobody', 5, 'held'),
  ('kept', 'nobody', -1, 'back'),
  ('ended', 'nobody', 10, 'back'),
  ('flaked', 'them', 1, 'back'),
  ('flaked', 'them', -1, 'back'),
  ('flaked', 'me', 30, 'back'),
  ('flaked', 'me', 3, 'back'),
  ('flaked', 'me', 2, 'lost'),
  ('flaked', 'me', 0.5, 'lost'),
  ('flaked', 'me', -0.5, 'lost'),
  ('flaked', 'nobody', -0.5, 'lost'),
  ('declined', 'nobody', 4, 'back'),
  ('expired', 'nobody', 4, 'back');
create temp table pack_cases (id text, rupees int, credits int);
insert into pack_cases (id, rupees, credits) values
  ('p49', 49, 50),
  ('p99', 99, 110),
  ('p199', 199, 240),
  ('p499', 499, 650);
