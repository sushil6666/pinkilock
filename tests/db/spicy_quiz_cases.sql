-- Generated from SPICY_QUIZ and QUIZ_CASES in src/domain/spicyQuiz.ts. Do not edit: UPDATE_CASES=1 npm run test:unit
create temp table spicy_quiz (version int, ids text[], key text[]);
insert into spicy_quiz values (1, array['phone', 'camera', 'photos', 'threat', 'stop']::text[], array['b', 'c', 'a', 'b', 'c']::text[]);
create temp table spicy_quiz_cases (version int, agree boolean, answers text[], want text);
insert into spicy_quiz_cases (version, agree, answers, want) values
  (1, true, array['b', 'c', 'a', 'b', 'c']::text[], 'pass'),
  (1, true, array['a', 'c', 'a', 'b', 'c']::text[], 'phone'),
  (1, true, array['b', 'a', 'a', 'b', 'c']::text[], 'camera'),
  (1, true, array['b', 'c', 'b', 'b', 'c']::text[], 'photos'),
  (1, true, array['b', 'c', 'a', 'a', 'c']::text[], 'threat'),
  (1, true, array['b', 'c', 'a', 'b', 'a']::text[], 'stop'),
  (1, true, array['a', 'a', 'b', 'a', 'a']::text[], 'phone,camera,photos,threat,stop'),
  (1, true, array['c', 'b', 'c', 'c', 'b']::text[], 'phone,camera,photos,threat,stop'),
  (1, false, array['b', 'c', 'a', 'b', 'c']::text[], 'PL156'),
  (0, true, array['b', 'c', 'a', 'b', 'c']::text[], 'PL155'),
  (2, true, array['b', 'c', 'a', 'b', 'c']::text[], 'PL155'),
  (1, true, array['b', 'c', 'a', 'b']::text[], 'PL157'),
  (1, true, array['b', 'c', 'a', 'b', 'c', 'a']::text[], 'PL157'),
  (1, true, array['b', 'c', 'a', 'b', 'd']::text[], 'PL157'),
  (1, true, array['b', 'c', 'a', 'b', '']::text[], 'PL157'),
  (1, true, array['B', 'C', 'A', 'B', 'C']::text[], 'PL157'),
  (1, true, array[]::text[], 'PL157');
