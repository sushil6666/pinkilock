-- Generated from CALL_CASES and ANSWER_CASES in src/domain/calls.ts. Do not edit: UPDATE_CASES=1 npm run test:unit
create temp table call_cases (minutes int, together int, mins_a int, mins_b int, last_a numeric, last_b numeric, outcome text, fault text);
insert into call_cases (minutes, together, mins_a, mins_b, last_a, last_b, outcome, fault) values
  (15, 15, 15, 15, 16, 16, 'talked', null),
  (15, 20, 22, 21, 30, 29, 'talked', null),
  (10, 10, 12, 10, 12, 10, 'talked', null),
  (30, 29, 30, 30, 32, 31, 'unclear', null),
  (15, 0, 0, 0, null, null, 'both_missed', 'both'),
  (15, 0, 0, 12, null, 14, 'no_show', 'a'),
  (15, 0, 9, 0, 10, null, 'no_show', 'b'),
  (15, 5, 6, 20, 6, 21, 'dropped', 'a'),
  (15, 5, 20, 6, 21, 6, 'dropped', 'b'),
  (15, 5, 6, 8, 6, 8, 'unclear', null),
  (15, 5, 6, 9, 6, 9, 'dropped', 'a'),
  (15, 0, 5, 5, 4, 30, 'unclear', null),
  (30, 12, 13, 40, 13, 50, 'dropped', 'a');
create temp table answer_cases (a text, b text, serial_a boolean, serial_b boolean, closed boolean, outcome text, fault text);
insert into answer_cases (a, b, serial_a, serial_b, closed, outcome, fault) values
  ('talked', 'talked', false, false, false, 'talked', null),
  ('talked', null, false, false, false, 'wait', null),
  ('talked', null, false, false, true, 'talked', null),
  (null, null, false, false, true, 'unsettled', null),
  (null, null, false, false, false, 'wait', null),
  ('i_missed', null, false, false, false, 'no_show', 'a'),
  ('talked', 'i_missed', false, false, false, 'no_show', 'b'),
  ('i_missed', 'i_missed', false, false, false, 'no_show', 'both'),
  ('they_missed', 'talked', false, false, false, 'disputed', null),
  ('they_missed', 'they_missed', false, false, false, 'disputed', null),
  ('talked', 'they_missed', false, false, false, 'disputed', null),
  ('they_missed', null, false, false, false, 'wait', null),
  ('they_missed', null, false, false, true, 'no_show', 'b'),
  ('they_missed', null, true, false, true, 'unsettled', null),
  (null, 'they_missed', false, false, true, 'no_show', 'a'),
  (null, 'they_missed', false, true, true, 'unsettled', null),
  ('they_missed', 'i_missed', false, false, false, 'no_show', 'b');
