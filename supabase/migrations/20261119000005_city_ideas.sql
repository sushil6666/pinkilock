-- City ideas: an in-person idea local to one city, offered only to people who live there. The same
-- rows are IDEAS in src/domain/ideas.ts (with `cities`; a state's dish lists every open city in it), checked by tests/unit/ideas_by_region.test.ts.
-- Like a country idea, one already saved stays when someone moves; a new pick from another city is
-- refused (PL104). The places named are a starting point and need a local check before launch.
alter table public.ideas add column cities text[];

insert into public.ideas (id, title, emoji, minutes, kind, blurb) values
  ('mumbai_sea_wall', 'Vada pav on the sea wall', '🌊', 30, 'irl', 'One vada pav each, one stretch of the sea wall.'),
  ('delhi_chaat_crawl', 'Two-stall chaat crawl', '🥙', 25, 'irl', 'Two chaat stalls, one plate at each. Pick a winner.'),
  ('blr_darshini_coffee', 'Darshini filter coffee', '☕', 20, 'irl', 'Stand-up filter coffee and one masala dosa to split.'),
  ('hyd_irani_chai', 'Irani chai and Osmania biscuits', '🫖', 20, 'irl', 'Two chais, a plate of biscuits. Dunk and talk.'),
  ('chennai_beach_sundal', 'Beach walk and sundal', '🏖️', 30, 'irl', 'A paper cone of sundal and a slow walk by the sea.'),
  ('kol_phuchka_bhaar', 'Phuchka and bhaar chai', '🍵', 20, 'irl', 'Phuchka till one taps out, then chai in clay cups.'),
  ('misal_stop', 'Misal pav stop', '🌶️', 25, 'irl', 'One plate each, pick your spice, extra pav allowed.'),
  ('amd_riverfront_walk', 'Riverfront sunset walk', '🌉', 30, 'irl', 'One stretch of the riverfront at sunset, a cold drink each.'),
  ('bbsr_dahibara', 'Dahibara aloodum stop', '🥣', 20, 'irl', 'One plate each from a street cart. Rate the spice.'),
  ('chd_sukhna_lake', 'Sukhna Lake walk', '🌅', 30, 'irl', 'One lap of the lake path, then a chai.'),
  ('cbe_bakery_puff', 'Bakery puff break', '🥐', 20, 'irl', 'Hot puffs and tea at a local bakery. Split two kinds.'),
  ('goa_shack_sunset', 'Beach shack sunset', '🌴', 30, 'irl', 'A soft drink each at a shack. Stay till the sun goes.'),
  ('indore_poha_jalebi', 'Poha jalebi breakfast', '🥞', 20, 'irl', 'Poha and jalebi from a morning stall. Sweet first or savoury?'),
  ('jaipur_kachori_chai', 'Pyaaz kachori and chai', '🧅', 20, 'irl', 'One kachori each, one chai. Find the best stall.'),
  ('kochi_pazham_pori', 'Chai and pazham pori', '🍌', 20, 'irl', 'Banana fritters and chai at a tea shop. Split the plate.'),
  ('lko_basket_chaat', 'Basket chaat stop', '🧺', 20, 'irl', 'One basket chaat to share. Two spoons, no fighting.'),
  ('ngp_tarri_poha', 'Tarri poha stop', '🍛', 20, 'irl', 'Spicy poha with chana curry from a morning cart.'),
  ('surat_locho', 'Locho stop', '🫓', 20, 'irl', 'One plate of locho to split. Extra sev is the rule.'),
  ('vdr_sev_usal', 'Sev usal stop', '🍲', 20, 'irl', 'One plate each, pick your spice, a cold drink after.'),
  ('vizag_beach_road', 'Beach road corn walk', '🐚', 30, 'irl', 'A slow walk on the beach road, a corn cob each.'),
  ('andhra_punugulu', 'Punugulu and chai', '🍘', 20, 'irl', 'A paper plate of punugulu and a chai each.'),
  ('ghy_lal_cha', 'Lal cha and pitha', '🍵', 20, 'irl', 'Red tea and a plate of pitha at a tea stall.'),
  ('patna_litti', 'Litti chokha stop', '🔥', 20, 'irl', 'One plate of litti chokha each, straight off the coals.'),
  ('cg_gupchup', 'Gupchup face-off', '🥟', 15, 'irl', 'Six gupchup each. First to tap out pays.'),
  ('gujarat_fafda', 'Fafda jalebi morning', '🥨', 20, 'irl', 'Fafda, jalebi and chutney from a morning farsan shop.'),
  ('jh_dhuska', 'Dhuska and chai', '🍩', 20, 'irl', 'A plate of dhuska with aloo and a chai each.'),
  ('jk_kahwa', 'Kahwa and a walk', '🫖', 25, 'irl', 'A cup of kahwa each and a short walk.'),
  ('pdy_promenade', 'Promenade sea walk', '🌊', 30, 'irl', 'One stretch of the sea front, one cold drink each.'),
  ('punjab_lassi', 'Lassi stop', '🥛', 20, 'irl', 'One tall lassi each. Sweet or salty, no judging.'),
  ('tn_jigarthanda', 'Jigarthanda stop', '🥤', 20, 'irl', 'One jigarthanda each, extra ice cream on top.'),
  ('doon_bakery', 'Bakery rusk and chai', '🍪', 20, 'irl', 'Fresh rusks or buns and a chai at an old bakery.'),
  ('up_kulhad_samosa', 'Kulhad chai and samosa', '🫖', 20, 'irl', 'Chai in clay cups and one samosa each.');

update public.ideas set countries = array['IN'] where id = 'mumbai_sea_wall';
update public.ideas set countries = array['IN'] where id = 'delhi_chaat_crawl';
update public.ideas set countries = array['IN'] where id = 'blr_darshini_coffee';
update public.ideas set countries = array['IN'] where id = 'hyd_irani_chai';
update public.ideas set countries = array['IN'] where id = 'chennai_beach_sundal';
update public.ideas set countries = array['IN'] where id = 'kol_phuchka_bhaar';
update public.ideas set countries = array['IN'] where id = 'misal_stop';
update public.ideas set countries = array['IN'] where id = 'amd_riverfront_walk';
update public.ideas set countries = array['IN'] where id = 'bbsr_dahibara';
update public.ideas set countries = array['IN'] where id = 'chd_sukhna_lake';
update public.ideas set countries = array['IN'] where id = 'cbe_bakery_puff';
update public.ideas set countries = array['IN'] where id = 'goa_shack_sunset';
update public.ideas set countries = array['IN'] where id = 'indore_poha_jalebi';
update public.ideas set countries = array['IN'] where id = 'jaipur_kachori_chai';
update public.ideas set countries = array['IN'] where id = 'kochi_pazham_pori';
update public.ideas set countries = array['IN'] where id = 'lko_basket_chaat';
update public.ideas set countries = array['IN'] where id = 'ngp_tarri_poha';
update public.ideas set countries = array['IN'] where id = 'surat_locho';
update public.ideas set countries = array['IN'] where id = 'vdr_sev_usal';
update public.ideas set countries = array['IN'] where id = 'vizag_beach_road';
update public.ideas set countries = array['IN'] where id = 'andhra_punugulu';
update public.ideas set countries = array['IN'] where id = 'ghy_lal_cha';
update public.ideas set countries = array['IN'] where id = 'patna_litti';
update public.ideas set countries = array['IN'] where id = 'cg_gupchup';
update public.ideas set countries = array['IN'] where id = 'gujarat_fafda';
update public.ideas set countries = array['IN'] where id = 'jh_dhuska';
update public.ideas set countries = array['IN'] where id = 'jk_kahwa';
update public.ideas set countries = array['IN'] where id = 'pdy_promenade';
update public.ideas set countries = array['IN'] where id = 'punjab_lassi';
update public.ideas set countries = array['IN'] where id = 'tn_jigarthanda';
update public.ideas set countries = array['IN'] where id = 'doon_bakery';
update public.ideas set countries = array['IN'] where id = 'up_kulhad_samosa';
update public.ideas set cities = array['Mumbai'] where id = 'mumbai_sea_wall';
update public.ideas set cities = array['Delhi NCR'] where id = 'delhi_chaat_crawl';
update public.ideas set cities = array['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi-Dharwad', 'Belagavi', 'Kalaburagi'] where id = 'blr_darshini_coffee';
update public.ideas set cities = array['Hyderabad', 'Warangal'] where id = 'hyd_irani_chai';
update public.ideas set cities = array['Chennai'] where id = 'chennai_beach_sundal';
update public.ideas set cities = array['Kolkata', 'Siliguri', 'Asansol', 'Durgapur'] where id = 'kol_phuchka_bhaar';
update public.ideas set cities = array['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Chhatrapati Sambhajinagar', 'Solapur', 'Kolhapur', 'Amravati', 'Nanded', 'Sangli', 'Malegaon'] where id = 'misal_stop';
update public.ideas set cities = array['Ahmedabad'] where id = 'amd_riverfront_walk';
update public.ideas set cities = array['Bhubaneswar', 'Cuttack', 'Rourkela'] where id = 'bbsr_dahibara';
update public.ideas set cities = array['Chandigarh'] where id = 'chd_sukhna_lake';
update public.ideas set cities = array['Coimbatore', 'Tiruppur', 'Erode', 'Salem'] where id = 'cbe_bakery_puff';
update public.ideas set cities = array['Goa'] where id = 'goa_shack_sunset';
update public.ideas set cities = array['Indore', 'Bhopal', 'Gwalior', 'Jabalpur', 'Ujjain'] where id = 'indore_poha_jalebi';
update public.ideas set cities = array['Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer'] where id = 'jaipur_kachori_chai';
update public.ideas set cities = array['Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Malappuram'] where id = 'kochi_pazham_pori';
update public.ideas set cities = array['Lucknow'] where id = 'lko_basket_chaat';
update public.ideas set cities = array['Nagpur', 'Amravati'] where id = 'ngp_tarri_poha';
update public.ideas set cities = array['Surat'] where id = 'surat_locho';
update public.ideas set cities = array['Vadodara'] where id = 'vdr_sev_usal';
update public.ideas set cities = array['Visakhapatnam'] where id = 'vizag_beach_road';
update public.ideas set cities = array['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore'] where id = 'andhra_punugulu';
update public.ideas set cities = array['Guwahati'] where id = 'ghy_lal_cha';
update public.ideas set cities = array['Patna'] where id = 'patna_litti';
update public.ideas set cities = array['Raipur', 'Bhilai'] where id = 'cg_gupchup';
update public.ideas set cities = array['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Jamnagar', 'Bhavnagar'] where id = 'gujarat_fafda';
update public.ideas set cities = array['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro'] where id = 'jh_dhuska';
update public.ideas set cities = array['Srinagar', 'Jammu'] where id = 'jk_kahwa';
update public.ideas set cities = array['Puducherry'] where id = 'pdy_promenade';
update public.ideas set cities = array['Ludhiana', 'Amritsar', 'Jalandhar', 'Chandigarh'] where id = 'punjab_lassi';
update public.ideas set cities = array['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tiruppur', 'Erode'] where id = 'tn_jigarthanda';
update public.ideas set cities = array['Dehradun'] where id = 'doon_bakery';
update public.ideas set cities = array['Lucknow', 'Kanpur', 'Agra', 'Varanasi', 'Prayagraj', 'Meerut', 'Bareilly', 'Aligarh', 'Moradabad', 'Gorakhpur', 'Saharanpur', 'Jhansi', 'Firozabad'] where id = 'up_kulhad_samosa';

-- save_profile writes the city and the ideas together, so a check on the row catches both a new
-- pick from another city and a move. Only newly added ideas are checked.
create or replace function private.check_city_ideas() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from unnest(new.idea_ids) i join ideas d on d.id = i
             where d.cities is not null and not (new.city = any (d.cities))
               and (tg_op = 'INSERT' or not (i = any (coalesce(old.idea_ids, '{}'))))) then
    raise exception using errcode = 'PL104', message = 'Pick things that are on offer where you live.';
  end if;
  return new;
end $$;
revoke all on function private.check_city_ideas() from public, anon, authenticated;

create trigger profiles_city_ideas before insert or update of idea_ids, city on public.profiles
  for each row execute function private.check_city_ideas();
