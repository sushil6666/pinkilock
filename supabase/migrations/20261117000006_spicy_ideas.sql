-- Spicier micro-dates: thirteen more (same rows as src/domain/ideas.ts).
-- Safe to run again: an id that already exists is left as it is.

insert into public.ideas (id, title, emoji, minutes, kind, blurb) values
  ('red_flag_roast', 'Red flag roast', '🚩', 10, 'game', 'Confess three red flags each. Roast gently, laugh loudly.'),
  ('would_you_rather', 'Would you rather, spicy', '😈', 10, 'game', 'Ten rounds. "It depends" is banned. Pick and defend.'),
  ('rizz_off', 'Rizz-off', '😏', 10, 'game', 'Trade your worst pickup lines. First to laugh loses.'),
  ('never_have_i', 'Never have I ever', '🙈', 10, 'game', 'Ten fingers up. Keep it honest, keep it kind.'),
  ('ick_or_not', 'Ick or not', '🫣', 10, 'game', 'Ten habits, instant verdicts. Find the dealbreakers early.'),
  ('truth_or_dare', 'Truth or dare, lite', '🎲', 15, 'game', 'Three rounds each. Either of you can skip once.'),
  ('stare_down', 'Staring contest', '👀', 10, 'video', 'Cameras on, eyes locked. First to blink or laugh loses.'),
  ('karaoke_duet', 'Karaoke duet', '🎤', 15, 'video', 'One song, both of you, no skill required.'),
  ('after_hours', 'After-hours call', '🌙', 15, 'video', 'After ten, lights low, fifteen minutes. Then sleep.'),
  ('night_market', 'Night market lap', '🏮', 30, 'irl', 'One lap, three stalls, share everything.'),
  ('photo_walk', 'Golden hour photoshoot', '🤳', 20, 'irl', 'Shoot each other''s next profile picture. Hype is mandatory.'),
  ('kulfi_gossip', 'Kulfi and gossip', '🍡', 20, 'irl', 'One kulfi each. Trade your best harmless gossip.'),
  ('dress_up_coffee', 'Overdressed coffee', '✨', 25, 'irl', 'Both overdress for a very ordinary coffee. Commit to it.')
on conflict (id) do nothing;
