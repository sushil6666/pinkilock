-- Generated from MATCH_CASES, HARM_CASES and SPLIT_CASES in src/domain/talk.ts. Do not edit: UPDATE_CASES=1 npm run test:unit
create temp table match_cases (caller_sex text, want text, listener_sex text, accepts text, ok boolean);
insert into match_cases (caller_sex, want, listener_sex, accepts, ok) values
  ('woman', 'opposite', 'man', 'anyone', true),
  ('woman', 'opposite', 'woman', 'anyone', false),
  ('woman', 'same', 'woman', 'women', true),
  ('woman', 'same', 'man', 'anyone', false),
  ('man', 'opposite', 'woman', 'anyone', true),
  ('man', 'opposite', 'woman', 'women', false),
  ('man', 'same', 'man', 'men', true),
  ('man', 'anyone', 'woman', 'men', true),
  ('man', 'anyone', 'man', 'women', false),
  ('woman', 'anyone', 'unsaid', 'anyone', true),
  ('woman', 'opposite', 'unsaid', 'anyone', false),
  ('unsaid', 'anyone', 'woman', 'anyone', true),
  ('unsaid', 'opposite', 'man', 'anyone', false),
  ('unsaid', 'anyone', 'woman', 'women', false),
  ('unsaid', 'same', 'unsaid', 'anyone', false);
create temp table harm_cases (body text, harm boolean);
insert into harm_cases (body, harm) values
  ('I feel like I want to die', true),
  ('sometimes I think about suicide.', true),
  ('I might hurt myself tonight', true),
  ('KMS lol this exam', true),
  ('main marna chahta hoon', true),
  ('मुझे आत्महत्या के ख़याल आते हैं', true),
  ('I dont want to live like this', true),
  ('This traffic is killing me', false),
  ('my phone died, so annoying', false),
  ('I want to diet before the wedding', false),
  ('skills are important', false),
  ('I feel lonely in this new city', false);
create temp table split_cases (minutes int, gross int, host int, pinkilock int, gst int, tds int, payout int);
insert into split_cases (minutes, gross, host, pinkilock, gst, tds, payout) values
  (0, 0, 0, 0, 0, 0, 0),
  (1, 760, 456, 304, 46, 1, 455),
  (5, 3800, 2280, 1520, 232, 4, 2276),
  (15, 11400, 6840, 4560, 696, 12, 6828),
  (30, 22800, 13680, 9120, 1391, 23, 13657);
