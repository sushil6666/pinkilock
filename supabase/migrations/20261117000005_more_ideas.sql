-- More of the catalogue: thirteen newer micro-dates (same rows as src/domain/ideas.ts).
-- Safe to run again: an id that already exists is left as it is.

insert into public.ideas (id, title, emoji, minutes, kind, blurb) values
  ('photo_booth', 'Photo booth strip', '📸', 15, 'irl', 'Four frames, one strip, no retakes.'),
  ('thrift_dare', 'Thrift dare', '🛍️', 30, 'irl', 'Pick one loud thing for each other. Trying it on is the deal.'),
  ('pani_puri_duel', 'Pani puri face-off', '🌶️', 15, 'irl', 'Six each, spicy water, first to tap out pays.'),
  ('arcade_round', 'Arcade round', '🕹️', 25, 'irl', 'Three games, best of three. Loser picks the next plan.'),
  ('matcha_run', 'Matcha run', '🍃', 20, 'irl', 'Iced or hot, oat or not. Judge quietly.'),
  ('dog_park_lap', 'Dog park lap', '🐕', 20, 'irl', 'Borrow joy from other people''s dogs. One lap.'),
  ('fit_check', 'Fit check', '👟', 10, 'video', 'Show today''s fit, rate it out of ten, be kind.'),
  ('study_sprint', 'Study sprint', '📖', 25, 'video', 'Cameras on, mics off for twenty. Talk for the last five.'),
  ('pet_cam', 'Pet cam', '🐾', 10, 'video', 'Introduce the pet, the plant or the plushie.'),
  ('trailer_reacts', 'Trailer reacts', '🍿', 15, 'video', 'Three trailers, live reactions, pick one to watch someday.'),
  ('hot_takes', 'Hot takes', '🔥', 10, 'game', 'Five spicy opinions each. Agree or defend.'),
  ('two_truths', 'Two truths, one lie', '🤥', 10, 'game', 'Three rounds. Catch the lie, earn a question.'),
  ('green_flags', 'Green flag check', '✅', 10, 'game', 'Trade three green flags and one harmless ick.')
on conflict (id) do nothing;
