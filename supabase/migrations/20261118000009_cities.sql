-- Cities across India (decision D080). Pinkilock opens in the eight metros and twelve tier-2 cities,
-- each with its list of areas and a catalogue of busy, public places to meet. India stays the only
-- open country (D006, D054); a city inside it needs no separate legal review.
--
--   * cities: the twenty open cities, all in Asia/Kolkata (the zone column comes from 20261118000006).
--     "Delhi" (listed, never open, so no profile has it) becomes
--     "Delhi NCR", which takes in Gurugram, Noida, Ghaziabad and Faridabad.
--   * areas and venues for every new city. Mumbai's are unchanged.
--   * save_profile: a person can move city later (Me), not only at sign-up.
--       - Moving needs an area from the new city's list. Before, an unchanged area passed even when
--         the city changed, so "Bandra West" could follow someone to Delhi NCR (PL095).
--       - A move once in 7 days (the first city is free), so nobody hops cities to look through
--         everyone in each (PL105). profiles.city_changed_at is the server's alone.
-- The app's copies are CITIES (src/domain/countries.ts), AREAS (src/domain/areas.ts) and VENUES
-- (src/domain/venues.ts); tests/unit/countries.test.ts, areas.test.ts and venues.test.ts keep them in step.

insert into public.cities (name, country, active, time_zone) values
  ('Mumbai', 'IN', true, 'Asia/Kolkata'),
  ('Delhi NCR', 'IN', true, 'Asia/Kolkata'),
  ('Bengaluru', 'IN', true, 'Asia/Kolkata'),
  ('Hyderabad', 'IN', true, 'Asia/Kolkata'),
  ('Chennai', 'IN', true, 'Asia/Kolkata'),
  ('Kolkata', 'IN', true, 'Asia/Kolkata'),
  ('Pune', 'IN', true, 'Asia/Kolkata'),
  ('Ahmedabad', 'IN', true, 'Asia/Kolkata'),
  ('Bhubaneswar', 'IN', true, 'Asia/Kolkata'),
  ('Chandigarh', 'IN', true, 'Asia/Kolkata'),
  ('Coimbatore', 'IN', true, 'Asia/Kolkata'),
  ('Goa', 'IN', true, 'Asia/Kolkata'),
  ('Indore', 'IN', true, 'Asia/Kolkata'),
  ('Jaipur', 'IN', true, 'Asia/Kolkata'),
  ('Kochi', 'IN', true, 'Asia/Kolkata'),
  ('Lucknow', 'IN', true, 'Asia/Kolkata'),
  ('Nagpur', 'IN', true, 'Asia/Kolkata'),
  ('Surat', 'IN', true, 'Asia/Kolkata'),
  ('Vadodara', 'IN', true, 'Asia/Kolkata'),
  ('Visakhapatnam', 'IN', true, 'Asia/Kolkata')
on conflict (name) do update set active = excluded.active, time_zone = excluded.time_zone;

insert into public.areas (city, name) values
  ('Delhi NCR', 'Chanakyapuri'),
  ('Delhi NCR', 'Chandni Chowk'),
  ('Delhi NCR', 'Civil Lines'),
  ('Delhi NCR', 'Connaught Place'),
  ('Delhi NCR', 'Defence Colony'),
  ('Delhi NCR', 'Dwarka'),
  ('Delhi NCR', 'Faridabad'),
  ('Delhi NCR', 'Ghaziabad'),
  ('Delhi NCR', 'Greater Kailash'),
  ('Delhi NCR', 'Greater Noida'),
  ('Delhi NCR', 'Gurugram'),
  ('Delhi NCR', 'Hauz Khas'),
  ('Delhi NCR', 'INA'),
  ('Delhi NCR', 'Janakpuri'),
  ('Delhi NCR', 'Kalkaji'),
  ('Delhi NCR', 'Kamla Nagar'),
  ('Delhi NCR', 'Karol Bagh'),
  ('Delhi NCR', 'Kartavya Path'),
  ('Delhi NCR', 'Khan Market'),
  ('Delhi NCR', 'Lajpat Nagar'),
  ('Delhi NCR', 'Laxmi Nagar'),
  ('Delhi NCR', 'Lodhi Road'),
  ('Delhi NCR', 'Malviya Nagar'),
  ('Delhi NCR', 'Mayur Vihar'),
  ('Delhi NCR', 'Mehrauli'),
  ('Delhi NCR', 'Nehru Place'),
  ('Delhi NCR', 'Nizamuddin'),
  ('Delhi NCR', 'Noida'),
  ('Delhi NCR', 'Pitampura'),
  ('Delhi NCR', 'Preet Vihar'),
  ('Delhi NCR', 'Punjabi Bagh'),
  ('Delhi NCR', 'Rajouri Garden'),
  ('Delhi NCR', 'Rohini'),
  ('Delhi NCR', 'Saket'),
  ('Delhi NCR', 'Shahpur Jat'),
  ('Delhi NCR', 'Vasant Kunj'),
  ('Bengaluru', 'Banashankari'),
  ('Bengaluru', 'Basavanagudi'),
  ('Bengaluru', 'Bellandur'),
  ('Bengaluru', 'BTM Layout'),
  ('Bengaluru', 'Electronic City'),
  ('Bengaluru', 'Frazer Town'),
  ('Bengaluru', 'Hebbal'),
  ('Bengaluru', 'HSR Layout'),
  ('Bengaluru', 'Indiranagar'),
  ('Bengaluru', 'Jayanagar'),
  ('Bengaluru', 'JP Nagar'),
  ('Bengaluru', 'Koramangala'),
  ('Bengaluru', 'Malleshwaram'),
  ('Bengaluru', 'Marathahalli'),
  ('Bengaluru', 'MG Road'),
  ('Bengaluru', 'Rajajinagar'),
  ('Bengaluru', 'Sadashivanagar'),
  ('Bengaluru', 'Sarjapur Road'),
  ('Bengaluru', 'Shivajinagar'),
  ('Bengaluru', 'Ulsoor'),
  ('Bengaluru', 'Whitefield'),
  ('Bengaluru', 'Yelahanka'),
  ('Hyderabad', 'Abids'),
  ('Hyderabad', 'Ameerpet'),
  ('Hyderabad', 'Banjara Hills'),
  ('Hyderabad', 'Begumpet'),
  ('Hyderabad', 'Charminar'),
  ('Hyderabad', 'Dilsukhnagar'),
  ('Hyderabad', 'Gachibowli'),
  ('Hyderabad', 'Golconda'),
  ('Hyderabad', 'HITEC City'),
  ('Hyderabad', 'Himayatnagar'),
  ('Hyderabad', 'Jubilee Hills'),
  ('Hyderabad', 'Kondapur'),
  ('Hyderabad', 'Kukatpally'),
  ('Hyderabad', 'Madhapur'),
  ('Hyderabad', 'Manikonda'),
  ('Hyderabad', 'Mehdipatnam'),
  ('Hyderabad', 'Miyapur'),
  ('Hyderabad', 'Secunderabad'),
  ('Hyderabad', 'Somajiguda'),
  ('Hyderabad', 'Tank Bund'),
  ('Hyderabad', 'Tarnaka'),
  ('Hyderabad', 'Uppal'),
  ('Chennai', 'Adyar'),
  ('Chennai', 'Alwarpet'),
  ('Chennai', 'Anna Nagar'),
  ('Chennai', 'Besant Nagar'),
  ('Chennai', 'Chromepet'),
  ('Chennai', 'Egmore'),
  ('Chennai', 'Guindy'),
  ('Chennai', 'Kilpauk'),
  ('Chennai', 'Kodambakkam'),
  ('Chennai', 'Mylapore'),
  ('Chennai', 'Nungambakkam'),
  ('Chennai', 'OMR'),
  ('Chennai', 'Perungudi'),
  ('Chennai', 'Porur'),
  ('Chennai', 'Royapettah'),
  ('Chennai', 'Saidapet'),
  ('Chennai', 'T Nagar'),
  ('Chennai', 'Tambaram'),
  ('Chennai', 'Teynampet'),
  ('Chennai', 'Thiruvanmiyur'),
  ('Chennai', 'Triplicane'),
  ('Chennai', 'Vadapalani'),
  ('Chennai', 'Velachery'),
  ('Kolkata', 'Alipore'),
  ('Kolkata', 'Ballygunge'),
  ('Kolkata', 'BBD Bagh'),
  ('Kolkata', 'Behala'),
  ('Kolkata', 'Bhowanipore'),
  ('Kolkata', 'College Street'),
  ('Kolkata', 'Dhakuria'),
  ('Kolkata', 'Dum Dum'),
  ('Kolkata', 'Esplanade'),
  ('Kolkata', 'Garia'),
  ('Kolkata', 'Gariahat'),
  ('Kolkata', 'Howrah'),
  ('Kolkata', 'Jadavpur'),
  ('Kolkata', 'Kasba'),
  ('Kolkata', 'Lake Gardens'),
  ('Kolkata', 'Maidan'),
  ('Kolkata', 'New Town'),
  ('Kolkata', 'Park Street'),
  ('Kolkata', 'Salt Lake'),
  ('Kolkata', 'Shyambazar'),
  ('Kolkata', 'Tollygunge'),
  ('Pune', 'Aundh'),
  ('Pune', 'Baner'),
  ('Pune', 'Bavdhan'),
  ('Pune', 'Camp'),
  ('Pune', 'Chinchwad'),
  ('Pune', 'Deccan'),
  ('Pune', 'Erandwane'),
  ('Pune', 'Hadapsar'),
  ('Pune', 'Hinjewadi'),
  ('Pune', 'Kalyani Nagar'),
  ('Pune', 'Kasba Peth'),
  ('Pune', 'Kharadi'),
  ('Pune', 'Kondhwa'),
  ('Pune', 'Koregaon Park'),
  ('Pune', 'Kothrud'),
  ('Pune', 'Magarpatta'),
  ('Pune', 'Model Colony'),
  ('Pune', 'Pimple Saudagar'),
  ('Pune', 'Pimpri'),
  ('Pune', 'Sadashiv Peth'),
  ('Pune', 'Shivajinagar'),
  ('Pune', 'Sinhagad Road'),
  ('Pune', 'Viman Nagar'),
  ('Pune', 'Wakad'),
  ('Pune', 'Wanowrie'),
  ('Pune', 'Yerawada'),
  ('Ahmedabad', 'Ambawadi'),
  ('Ahmedabad', 'Bodakdev'),
  ('Ahmedabad', 'Bopal'),
  ('Ahmedabad', 'Chandkheda'),
  ('Ahmedabad', 'Ellisbridge'),
  ('Ahmedabad', 'Gandhinagar'),
  ('Ahmedabad', 'Gota'),
  ('Ahmedabad', 'Gurukul'),
  ('Ahmedabad', 'Maninagar'),
  ('Ahmedabad', 'Memnagar'),
  ('Ahmedabad', 'Naranpura'),
  ('Ahmedabad', 'Navrangpura'),
  ('Ahmedabad', 'Old City'),
  ('Ahmedabad', 'Paldi'),
  ('Ahmedabad', 'Prahlad Nagar'),
  ('Ahmedabad', 'Sabarmati'),
  ('Ahmedabad', 'Satellite'),
  ('Ahmedabad', 'SG Highway'),
  ('Ahmedabad', 'Thaltej'),
  ('Ahmedabad', 'Vastrapur'),
  ('Ahmedabad', 'Vejalpur'),
  ('Bhubaneswar', 'Acharya Vihar'),
  ('Bhubaneswar', 'Bapuji Nagar'),
  ('Bhubaneswar', 'Chandrasekharpur'),
  ('Bhubaneswar', 'Infocity'),
  ('Bhubaneswar', 'Jaydev Vihar'),
  ('Bhubaneswar', 'Khandagiri'),
  ('Bhubaneswar', 'Kharavela Nagar'),
  ('Bhubaneswar', 'Laxmisagar'),
  ('Bhubaneswar', 'Mancheswar'),
  ('Bhubaneswar', 'Nayapalli'),
  ('Bhubaneswar', 'Old Town'),
  ('Bhubaneswar', 'Patia'),
  ('Bhubaneswar', 'Pokhariput'),
  ('Bhubaneswar', 'Rasulgarh'),
  ('Bhubaneswar', 'Saheed Nagar'),
  ('Bhubaneswar', 'Satya Nagar'),
  ('Bhubaneswar', 'Sundarpada'),
  ('Bhubaneswar', 'Vani Vihar'),
  ('Chandigarh', 'Industrial Area'),
  ('Chandigarh', 'Kharar'),
  ('Chandigarh', 'Manimajra'),
  ('Chandigarh', 'Mohali'),
  ('Chandigarh', 'New Chandigarh'),
  ('Chandigarh', 'Panchkula'),
  ('Chandigarh', 'Sector 1'),
  ('Chandigarh', 'Sector 7'),
  ('Chandigarh', 'Sector 8'),
  ('Chandigarh', 'Sector 9'),
  ('Chandigarh', 'Sector 10'),
  ('Chandigarh', 'Sector 11'),
  ('Chandigarh', 'Sector 15'),
  ('Chandigarh', 'Sector 16'),
  ('Chandigarh', 'Sector 17'),
  ('Chandigarh', 'Sector 22'),
  ('Chandigarh', 'Sector 26'),
  ('Chandigarh', 'Sector 34'),
  ('Chandigarh', 'Sector 35'),
  ('Chandigarh', 'Sector 43'),
  ('Chandigarh', 'Zirakpur'),
  ('Coimbatore', 'Avinashi Road'),
  ('Coimbatore', 'Gandhipuram'),
  ('Coimbatore', 'Ganapathy'),
  ('Coimbatore', 'Kalapatti'),
  ('Coimbatore', 'Kuniyamuthur'),
  ('Coimbatore', 'Peelamedu'),
  ('Coimbatore', 'Podanur'),
  ('Coimbatore', 'Race Course'),
  ('Coimbatore', 'Ramanathapuram'),
  ('Coimbatore', 'RS Puram'),
  ('Coimbatore', 'Saibaba Colony'),
  ('Coimbatore', 'Saravanampatti'),
  ('Coimbatore', 'Singanallur'),
  ('Coimbatore', 'Sowripalayam'),
  ('Coimbatore', 'Thudiyalur'),
  ('Coimbatore', 'Town Hall'),
  ('Coimbatore', 'Ukkadam'),
  ('Coimbatore', 'Vadavalli'),
  ('Goa', 'Anjuna'),
  ('Goa', 'Assagao'),
  ('Goa', 'Baga'),
  ('Goa', 'Benaulim'),
  ('Goa', 'Calangute'),
  ('Goa', 'Candolim'),
  ('Goa', 'Colva'),
  ('Goa', 'Dona Paula'),
  ('Goa', 'Mapusa'),
  ('Goa', 'Margao'),
  ('Goa', 'Miramar'),
  ('Goa', 'Old Goa'),
  ('Goa', 'Palolem'),
  ('Goa', 'Panaji'),
  ('Goa', 'Ponda'),
  ('Goa', 'Porvorim'),
  ('Goa', 'Siolim'),
  ('Goa', 'Vasco da Gama'),
  ('Indore', 'AB Road'),
  ('Indore', 'Annapurna'),
  ('Indore', 'Bengali Square'),
  ('Indore', 'Bhawarkua'),
  ('Indore', 'Khajrana'),
  ('Indore', 'Mahalaxmi Nagar'),
  ('Indore', 'MG Road'),
  ('Indore', 'Navlakha'),
  ('Indore', 'Nipania'),
  ('Indore', 'Old Palasia'),
  ('Indore', 'Palasia'),
  ('Indore', 'Rajwada'),
  ('Indore', 'Rau'),
  ('Indore', 'Saket Nagar'),
  ('Indore', 'Sapna Sangeeta'),
  ('Indore', 'Sarafa'),
  ('Indore', 'Super Corridor'),
  ('Indore', 'Vijay Nagar'),
  ('Jaipur', 'Amer'),
  ('Jaipur', 'Bani Park'),
  ('Jaipur', 'C Scheme'),
  ('Jaipur', 'Civil Lines'),
  ('Jaipur', 'Jagatpura'),
  ('Jaipur', 'Jawahar Nagar'),
  ('Jaipur', 'Malviya Nagar'),
  ('Jaipur', 'Mansarovar'),
  ('Jaipur', 'MI Road'),
  ('Jaipur', 'Old City'),
  ('Jaipur', 'Raja Park'),
  ('Jaipur', 'Sanganer'),
  ('Jaipur', 'Sodala'),
  ('Jaipur', 'Tonk Road'),
  ('Jaipur', 'Vaishali Nagar'),
  ('Jaipur', 'Vidhyadhar Nagar'),
  ('Kochi', 'Aluva'),
  ('Kochi', 'Edappally'),
  ('Kochi', 'Ernakulam North'),
  ('Kochi', 'Ernakulam South'),
  ('Kochi', 'Fort Kochi'),
  ('Kochi', 'Kadavanthra'),
  ('Kochi', 'Kakkanad'),
  ('Kochi', 'Kalamassery'),
  ('Kochi', 'Kaloor'),
  ('Kochi', 'Maradu'),
  ('Kochi', 'Mattancherry'),
  ('Kochi', 'MG Road'),
  ('Kochi', 'Palarivattom'),
  ('Kochi', 'Panampilly Nagar'),
  ('Kochi', 'Thrippunithura'),
  ('Kochi', 'Vyttila'),
  ('Lucknow', 'Alambagh'),
  ('Lucknow', 'Aliganj'),
  ('Lucknow', 'Aminabad'),
  ('Lucknow', 'Ashiyana'),
  ('Lucknow', 'Charbagh'),
  ('Lucknow', 'Chowk'),
  ('Lucknow', 'Gomti Nagar'),
  ('Lucknow', 'Gomti Nagar Extension'),
  ('Lucknow', 'Hazratganj'),
  ('Lucknow', 'Indira Nagar'),
  ('Lucknow', 'Jankipuram'),
  ('Lucknow', 'Kaiserbagh'),
  ('Lucknow', 'Kapoorthala'),
  ('Lucknow', 'Mahanagar'),
  ('Lucknow', 'Rajajipuram'),
  ('Lucknow', 'Sushant Golf City'),
  ('Lucknow', 'Vikas Nagar'),
  ('Nagpur', 'Ambazari'),
  ('Nagpur', 'Bajaj Nagar'),
  ('Nagpur', 'Besa'),
  ('Nagpur', 'Civil Lines'),
  ('Nagpur', 'Dharampeth'),
  ('Nagpur', 'Gandhibagh'),
  ('Nagpur', 'Hingna'),
  ('Nagpur', 'Itwari'),
  ('Nagpur', 'Laxmi Nagar'),
  ('Nagpur', 'Mahal'),
  ('Nagpur', 'Manish Nagar'),
  ('Nagpur', 'Mankapur'),
  ('Nagpur', 'Nandanvan'),
  ('Nagpur', 'Pratap Nagar'),
  ('Nagpur', 'Ramdaspeth'),
  ('Nagpur', 'Sadar'),
  ('Nagpur', 'Shankar Nagar'),
  ('Nagpur', 'Sitabuldi'),
  ('Nagpur', 'Trimurti Nagar'),
  ('Nagpur', 'Wardha Road'),
  ('Surat', 'Adajan'),
  ('Surat', 'Althan'),
  ('Surat', 'Athwa'),
  ('Surat', 'Bhatar'),
  ('Surat', 'Chowk Bazaar'),
  ('Surat', 'Citylight'),
  ('Surat', 'Dumas'),
  ('Surat', 'Ghod Dod Road'),
  ('Surat', 'Katargam'),
  ('Surat', 'Majura Gate'),
  ('Surat', 'Nanpura'),
  ('Surat', 'Pal'),
  ('Surat', 'Parle Point'),
  ('Surat', 'Piplod'),
  ('Surat', 'Rander'),
  ('Surat', 'Udhna'),
  ('Surat', 'Varachha'),
  ('Surat', 'Vesu'),
  ('Vadodara', 'Akota'),
  ('Vadodara', 'Alkapuri'),
  ('Vadodara', 'Fatehgunj'),
  ('Vadodara', 'Gorwa'),
  ('Vadodara', 'Gotri'),
  ('Vadodara', 'Harni'),
  ('Vadodara', 'Karelibaug'),
  ('Vadodara', 'Makarpura'),
  ('Vadodara', 'Manjalpur'),
  ('Vadodara', 'Nizampura'),
  ('Vadodara', 'Old City'),
  ('Vadodara', 'Race Course'),
  ('Vadodara', 'Sama'),
  ('Vadodara', 'Sayajigunj'),
  ('Vadodara', 'Subhanpura'),
  ('Vadodara', 'Tarsali'),
  ('Vadodara', 'Vasna'),
  ('Vadodara', 'Waghodia Road'),
  ('Visakhapatnam', 'Akkayyapalem'),
  ('Visakhapatnam', 'Asilmetta'),
  ('Visakhapatnam', 'Beach Road'),
  ('Visakhapatnam', 'Dwaraka Nagar'),
  ('Visakhapatnam', 'Gajuwaka'),
  ('Visakhapatnam', 'Jagadamba'),
  ('Visakhapatnam', 'Kailasagiri'),
  ('Visakhapatnam', 'Lawsons Bay'),
  ('Visakhapatnam', 'Maddilapalem'),
  ('Visakhapatnam', 'Madhurawada'),
  ('Visakhapatnam', 'MVP Colony'),
  ('Visakhapatnam', 'Pendurthi'),
  ('Visakhapatnam', 'Rushikonda'),
  ('Visakhapatnam', 'Seethammadhara'),
  ('Visakhapatnam', 'Siripuram'),
  ('Visakhapatnam', 'Yendada')
on conflict do nothing;

insert into public.venues (id, city, area, name, kind) values
  ('del_india_gate', 'Delhi NCR', 'Kartavya Path', 'India Gate lawns', 'landmark'),
  ('del_lodhi_garden', 'Delhi NCR', 'Lodhi Road', 'Lodhi Garden', 'park'),
  ('del_khan_market', 'Delhi NCR', 'Khan Market', 'Khan Market', 'market'),
  ('del_cp_central_park', 'Delhi NCR', 'Connaught Place', 'Central Park', 'park'),
  ('del_janpath', 'Delhi NCR', 'Connaught Place', 'Janpath Market', 'market'),
  ('del_hauz_khas_lake', 'Delhi NCR', 'Hauz Khas', 'Hauz Khas Deer Park', 'park'),
  ('del_dilli_haat', 'Delhi NCR', 'INA', 'Dilli Haat', 'market'),
  ('del_sunder_nursery', 'Delhi NCR', 'Nizamuddin', 'Sunder Nursery', 'park'),
  ('del_qutub', 'Delhi NCR', 'Mehrauli', 'Qutub Minar', 'landmark'),
  ('del_chandni_chowk', 'Delhi NCR', 'Chandni Chowk', 'Chandni Chowk', 'market'),
  ('del_kamla_nagar', 'Delhi NCR', 'Kamla Nagar', 'Kamla Nagar Market', 'market'),
  ('del_select_citywalk', 'Delhi NCR', 'Saket', 'Select Citywalk', 'mall'),
  ('del_five_senses', 'Delhi NCR', 'Saket', 'Garden of Five Senses', 'park'),
  ('del_gk_m_block', 'Delhi NCR', 'Greater Kailash', 'M Block Market', 'market'),
  ('del_lajpat', 'Delhi NCR', 'Lajpat Nagar', 'Lajpat Nagar Central Market', 'market'),
  ('del_nehru_park', 'Delhi NCR', 'Chanakyapuri', 'Nehru Park', 'park'),
  ('del_dlf_promenade', 'Delhi NCR', 'Vasant Kunj', 'DLF Promenade', 'mall'),
  ('del_rajouri', 'Delhi NCR', 'Rajouri Garden', 'Rajouri Garden Main Market', 'market'),
  ('del_cyber_hub', 'Delhi NCR', 'Gurugram', 'CyberHub', 'mall'),
  ('del_ambience_gurugram', 'Delhi NCR', 'Gurugram', 'Ambience Mall', 'mall'),
  ('del_mall_of_india', 'Delhi NCR', 'Noida', 'DLF Mall of India', 'mall'),
  ('blr_cubbon_park', 'Bengaluru', 'MG Road', 'Cubbon Park', 'park'),
  ('blr_lalbagh', 'Bengaluru', 'Basavanagudi', 'Lalbagh Botanical Garden', 'park'),
  ('blr_church_street', 'Bengaluru', 'MG Road', 'Church Street', 'market'),
  ('blr_brigade_road', 'Bengaluru', 'MG Road', 'Brigade Road', 'market'),
  ('blr_ub_city', 'Bengaluru', 'MG Road', 'UB City', 'mall'),
  ('blr_ulsoor_lake', 'Bengaluru', 'Ulsoor', 'Ulsoor Lake', 'promenade'),
  ('blr_indiranagar_12th', 'Bengaluru', 'Indiranagar', '12th Main Road', 'market'),
  ('blr_agara_lake', 'Bengaluru', 'HSR Layout', 'Agara Lake', 'promenade'),
  ('blr_phoenix_whitefield', 'Bengaluru', 'Whitefield', 'Phoenix Marketcity', 'mall'),
  ('blr_orion', 'Bengaluru', 'Rajajinagar', 'Orion Mall', 'mall'),
  ('blr_mantri_square', 'Bengaluru', 'Malleshwaram', 'Mantri Square Mall', 'mall'),
  ('blr_sankey_tank', 'Bengaluru', 'Sadashivanagar', 'Sankey Tank', 'promenade'),
  ('blr_gandhi_bazaar', 'Bengaluru', 'Basavanagudi', 'Gandhi Bazaar', 'market'),
  ('blr_jayanagar_4th', 'Bengaluru', 'Jayanagar', 'Jayanagar 4th Block Market', 'market'),
  ('blr_commercial_street', 'Bengaluru', 'Shivajinagar', 'Commercial Street', 'market'),
  ('hyd_necklace_road', 'Hyderabad', 'Tank Bund', 'Necklace Road', 'promenade'),
  ('hyd_tank_bund', 'Hyderabad', 'Tank Bund', 'Tank Bund Promenade', 'promenade'),
  ('hyd_lumbini', 'Hyderabad', 'Tank Bund', 'Lumbini Park', 'park'),
  ('hyd_sanjeevaiah', 'Hyderabad', 'Tank Bund', 'Sanjeevaiah Park', 'park'),
  ('hyd_kbr_park', 'Hyderabad', 'Jubilee Hills', 'KBR Park', 'park'),
  ('hyd_durgam_cheruvu', 'Hyderabad', 'Madhapur', 'Durgam Cheruvu Lake', 'promenade'),
  ('hyd_inorbit', 'Hyderabad', 'Madhapur', 'Inorbit Mall', 'mall'),
  ('hyd_shilparamam', 'Hyderabad', 'Madhapur', 'Shilparamam', 'market'),
  ('hyd_gvk_one', 'Hyderabad', 'Banjara Hills', 'GVK One Mall', 'mall'),
  ('hyd_sarath_city', 'Hyderabad', 'Kondapur', 'Sarath City Capital Mall', 'mall'),
  ('hyd_lulu', 'Hyderabad', 'Kukatpally', 'Lulu Mall', 'mall'),
  ('hyd_charminar', 'Hyderabad', 'Charminar', 'Charminar', 'landmark'),
  ('hyd_laad_bazaar', 'Hyderabad', 'Charminar', 'Laad Bazaar', 'market'),
  ('hyd_salar_jung', 'Hyderabad', 'Charminar', 'Salar Jung Museum', 'landmark'),
  ('hyd_golconda', 'Hyderabad', 'Golconda', 'Golconda Fort', 'landmark'),
  ('che_marina', 'Chennai', 'Triplicane', 'Marina Beach', 'promenade'),
  ('che_elliots', 'Chennai', 'Besant Nagar', 'Elliot''s Beach', 'promenade'),
  ('che_thiruvanmiyur_beach', 'Chennai', 'Thiruvanmiyur', 'Thiruvanmiyur Beach', 'promenade'),
  ('che_semmozhi', 'Chennai', 'Teynampet', 'Semmozhi Poonga', 'park'),
  ('che_nageswara_rao', 'Chennai', 'Mylapore', 'Nageswara Rao Park', 'park'),
  ('che_tower_park', 'Chennai', 'Anna Nagar', 'Anna Nagar Tower Park', 'park'),
  ('che_express_avenue', 'Chennai', 'Royapettah', 'Express Avenue', 'mall'),
  ('che_phoenix_velachery', 'Chennai', 'Velachery', 'Phoenix Marketcity', 'mall'),
  ('che_vr_chennai', 'Chennai', 'Anna Nagar', 'VR Chennai', 'mall'),
  ('che_pondy_bazaar', 'Chennai', 'T Nagar', 'Pondy Bazaar', 'market'),
  ('che_khader_nawaz', 'Chennai', 'Nungambakkam', 'Khader Nawaz Khan Road', 'market'),
  ('che_museum', 'Chennai', 'Egmore', 'Government Museum', 'landmark'),
  ('kol_victoria', 'Kolkata', 'Maidan', 'Victoria Memorial gardens', 'landmark'),
  ('kol_prinsep_ghat', 'Kolkata', 'Maidan', 'Prinsep Ghat', 'promenade'),
  ('kol_millennium_park', 'Kolkata', 'BBD Bagh', 'Millennium Park', 'promenade'),
  ('kol_rabindra_sarobar', 'Kolkata', 'Dhakuria', 'Rabindra Sarobar', 'promenade'),
  ('kol_park_street', 'Kolkata', 'Park Street', 'Park Street', 'market'),
  ('kol_indian_museum', 'Kolkata', 'Park Street', 'Indian Museum', 'landmark'),
  ('kol_college_street', 'Kolkata', 'College Street', 'College Street Boi Para', 'market'),
  ('kol_new_market', 'Kolkata', 'Esplanade', 'New Market', 'market'),
  ('kol_gariahat', 'Kolkata', 'Gariahat', 'Gariahat Market', 'market'),
  ('kol_quest', 'Kolkata', 'Ballygunge', 'Quest Mall', 'mall'),
  ('kol_south_city', 'Kolkata', 'Jadavpur', 'South City Mall', 'mall'),
  ('kol_acropolis', 'Kolkata', 'Kasba', 'Acropolis Mall', 'mall'),
  ('kol_city_centre', 'Kolkata', 'Salt Lake', 'City Centre Salt Lake', 'mall'),
  ('kol_central_park', 'Kolkata', 'Salt Lake', 'Central Park', 'park'),
  ('kol_eco_park', 'Kolkata', 'New Town', 'Eco Park', 'park'),
  ('pun_fc_road', 'Pune', 'Shivajinagar', 'FC Road', 'market'),
  ('pun_jm_road', 'Pune', 'Deccan', 'JM Road', 'market'),
  ('pun_mg_road', 'Pune', 'Camp', 'MG Road', 'market'),
  ('pun_osho_park', 'Pune', 'Koregaon Park', 'Osho Teerth Park', 'park'),
  ('pun_empress_garden', 'Pune', 'Camp', 'Empress Garden', 'park'),
  ('pun_saras_baug', 'Pune', 'Sadashiv Peth', 'Saras Baug', 'park'),
  ('pun_pu_la_garden', 'Pune', 'Sinhagad Road', 'Pu La Deshpande Garden', 'park'),
  ('pun_shaniwar_wada', 'Pune', 'Kasba Peth', 'Shaniwar Wada', 'landmark'),
  ('pun_aga_khan', 'Pune', 'Yerawada', 'Aga Khan Palace', 'landmark'),
  ('pun_phoenix_viman', 'Pune', 'Viman Nagar', 'Phoenix Marketcity', 'mall'),
  ('pun_pavillion', 'Pune', 'Shivajinagar', 'The Pavillion', 'mall'),
  ('pun_seasons', 'Pune', 'Magarpatta', 'Seasons Mall', 'mall'),
  ('pun_amanora', 'Pune', 'Hadapsar', 'Amanora Mall', 'mall'),
  ('pun_westend', 'Pune', 'Aundh', 'Westend Mall', 'mall'),
  ('amd_riverfront', 'Ahmedabad', 'Ellisbridge', 'Sabarmati Riverfront', 'promenade'),
  ('amd_atal_bridge', 'Ahmedabad', 'Ellisbridge', 'Atal Bridge', 'promenade'),
  ('amd_kankaria', 'Ahmedabad', 'Maninagar', 'Kankaria Lake', 'promenade'),
  ('amd_vastrapur_lake', 'Ahmedabad', 'Vastrapur', 'Vastrapur Lake', 'promenade'),
  ('amd_parimal', 'Ahmedabad', 'Ambawadi', 'Parimal Garden', 'park'),
  ('amd_law_garden', 'Ahmedabad', 'Navrangpura', 'Law Garden Night Market', 'market'),
  ('amd_cg_road', 'Ahmedabad', 'Navrangpura', 'CG Road', 'market'),
  ('amd_sindhu_bhavan', 'Ahmedabad', 'Bodakdev', 'Sindhu Bhavan Road', 'market'),
  ('amd_manek_chowk', 'Ahmedabad', 'Old City', 'Manek Chowk', 'market'),
  ('amd_ahmedabad_one', 'Ahmedabad', 'Vastrapur', 'Ahmedabad One Mall', 'mall'),
  ('amd_palladium', 'Ahmedabad', 'Thaltej', 'Palladium Mall', 'mall'),
  ('amd_sabarmati_ashram', 'Ahmedabad', 'Sabarmati', 'Sabarmati Ashram', 'landmark'),
  ('bbs_esplanade', 'Bhubaneswar', 'Rasulgarh', 'Esplanade One Mall', 'mall'),
  ('bbs_forum_mart', 'Bhubaneswar', 'Kharavela Nagar', 'Forum Mart', 'mall'),
  ('bbs_ekamra_kanan', 'Bhubaneswar', 'Nayapalli', 'Ekamra Kanan Botanical Gardens', 'park'),
  ('bbs_saheed_nagar', 'Bhubaneswar', 'Saheed Nagar', 'Saheed Nagar Market', 'market'),
  ('bbs_khandagiri', 'Bhubaneswar', 'Khandagiri', 'Khandagiri Caves', 'landmark'),
  ('bbs_state_museum', 'Bhubaneswar', 'Old Town', 'Odisha State Museum', 'landmark'),
  ('chd_sukhna', 'Chandigarh', 'Sector 1', 'Sukhna Lake', 'promenade'),
  ('chd_rock_garden', 'Chandigarh', 'Sector 1', 'Rock Garden', 'landmark'),
  ('chd_rose_garden', 'Chandigarh', 'Sector 16', 'Rose Garden', 'park'),
  ('chd_leisure_valley', 'Chandigarh', 'Sector 10', 'Leisure Valley', 'park'),
  ('chd_museum', 'Chandigarh', 'Sector 10', 'Government Museum and Art Gallery', 'landmark'),
  ('chd_plaza', 'Chandigarh', 'Sector 17', 'Sector 17 Plaza', 'market'),
  ('chd_sector_35', 'Chandigarh', 'Sector 35', 'Sector 35 Market', 'market'),
  ('chd_elante', 'Chandigarh', 'Industrial Area', 'Elante Mall', 'mall'),
  ('chd_cp67', 'Chandigarh', 'Mohali', 'CP67 Mall', 'mall'),
  ('chd_cactus_garden', 'Chandigarh', 'Panchkula', 'National Cactus Garden', 'park'),
  ('cbe_race_course', 'Coimbatore', 'Race Course', 'Race Course Walkway', 'promenade'),
  ('cbe_valankulam', 'Coimbatore', 'Ukkadam', 'Valankulam Lake', 'promenade'),
  ('cbe_voc_park', 'Coimbatore', 'Gandhipuram', 'VOC Park', 'park'),
  ('cbe_forest_museum', 'Coimbatore', 'RS Puram', 'Gass Forest Museum', 'landmark'),
  ('cbe_cross_cut', 'Coimbatore', 'Gandhipuram', 'Cross Cut Road', 'market'),
  ('cbe_town_hall', 'Coimbatore', 'Town Hall', 'Town Hall Market', 'market'),
  ('cbe_brookefields', 'Coimbatore', 'RS Puram', 'Brookefields Mall', 'mall'),
  ('cbe_prozone', 'Coimbatore', 'Saravanampatti', 'Prozone Mall', 'mall'),
  ('cbe_fun_republic', 'Coimbatore', 'Peelamedu', 'Fun Republic Mall', 'mall'),
  ('goa_miramar', 'Goa', 'Miramar', 'Miramar Beach', 'promenade'),
  ('goa_dona_paula', 'Goa', 'Dona Paula', 'Dona Paula Viewpoint', 'promenade'),
  ('goa_fontainhas', 'Goa', 'Panaji', 'Fontainhas', 'landmark'),
  ('goa_kala_academy', 'Goa', 'Panaji', 'Kala Academy', 'landmark'),
  ('goa_panjim_market', 'Goa', 'Panaji', 'Panjim Market', 'market'),
  ('goa_caculo', 'Goa', 'Panaji', 'Caculo Mall', 'mall'),
  ('goa_mall_de_goa', 'Goa', 'Porvorim', 'Mall De Goa', 'mall'),
  ('goa_mapusa_market', 'Goa', 'Mapusa', 'Mapusa Market', 'market'),
  ('goa_anjuna_flea', 'Goa', 'Anjuna', 'Anjuna Flea Market', 'market'),
  ('goa_calangute', 'Goa', 'Calangute', 'Calangute Beach', 'promenade'),
  ('goa_colva', 'Goa', 'Colva', 'Colva Beach', 'promenade'),
  ('goa_margao_garden', 'Goa', 'Margao', 'Margao Municipal Garden', 'park'),
  ('idr_rajwada', 'Indore', 'Rajwada', 'Rajwada Palace', 'landmark'),
  ('idr_krishnapura', 'Indore', 'Rajwada', 'Krishnapura Chhatris', 'landmark'),
  ('idr_sarafa', 'Indore', 'Sarafa', 'Sarafa Bazaar', 'market'),
  ('idr_chappan', 'Indore', 'Palasia', 'Chappan Dukan', 'market'),
  ('idr_meghdoot', 'Indore', 'Vijay Nagar', 'Meghdoot Garden', 'park'),
  ('idr_treasure_island', 'Indore', 'MG Road', 'Treasure Island Mall', 'mall'),
  ('idr_c21', 'Indore', 'AB Road', 'C21 Mall', 'mall'),
  ('idr_phoenix_citadel', 'Indore', 'Nipania', 'Phoenix Citadel', 'mall'),
  ('jai_hawa_mahal', 'Jaipur', 'Old City', 'Hawa Mahal', 'landmark'),
  ('jai_johari_bazaar', 'Jaipur', 'Old City', 'Johari Bazaar', 'market'),
  ('jai_bapu_bazaar', 'Jaipur', 'Old City', 'Bapu Bazaar', 'market'),
  ('jai_albert_hall', 'Jaipur', 'MI Road', 'Albert Hall Museum', 'landmark'),
  ('jai_masala_chowk', 'Jaipur', 'MI Road', 'Masala Chowk', 'market'),
  ('jai_central_park', 'Jaipur', 'C Scheme', 'Central Park', 'park'),
  ('jai_jawahar_circle', 'Jaipur', 'Malviya Nagar', 'Jawahar Circle Garden', 'park'),
  ('jai_patrika_gate', 'Jaipur', 'Malviya Nagar', 'Patrika Gate', 'landmark'),
  ('jai_world_trade_park', 'Jaipur', 'Malviya Nagar', 'World Trade Park', 'mall'),
  ('jai_jkk', 'Jaipur', 'Jawahar Nagar', 'Jawahar Kala Kendra', 'landmark'),
  ('jai_amer_fort', 'Jaipur', 'Amer', 'Amer Fort', 'landmark'),
  ('koc_marine_drive', 'Kochi', 'MG Road', 'Marine Drive Walkway', 'promenade'),
  ('koc_bose_park', 'Kochi', 'MG Road', 'Subhash Bose Park', 'park'),
  ('koc_queens_walkway', 'Kochi', 'Ernakulam North', 'Queen''s Walkway', 'promenade'),
  ('koc_broadway', 'Kochi', 'Ernakulam South', 'Broadway Market', 'market'),
  ('koc_centre_square', 'Kochi', 'MG Road', 'Centre Square Mall', 'mall'),
  ('koc_lulu', 'Kochi', 'Edappally', 'Lulu Mall', 'mall'),
  ('koc_forum', 'Kochi', 'Maradu', 'Forum Mall', 'mall'),
  ('koc_fort_kochi_beach', 'Kochi', 'Fort Kochi', 'Fort Kochi Beach', 'promenade'),
  ('koc_fishing_nets', 'Kochi', 'Fort Kochi', 'Chinese Fishing Nets', 'landmark'),
  ('koc_jew_town', 'Kochi', 'Mattancherry', 'Jew Town', 'market'),
  ('koc_mattancherry_palace', 'Kochi', 'Mattancherry', 'Mattancherry Palace', 'landmark'),
  ('lko_hazratganj', 'Lucknow', 'Hazratganj', 'Hazratganj Market', 'market'),
  ('lko_sahara_ganj', 'Lucknow', 'Hazratganj', 'Sahara Ganj Mall', 'mall'),
  ('lko_aminabad', 'Lucknow', 'Aminabad', 'Aminabad Market', 'market'),
  ('lko_bara_imambara', 'Lucknow', 'Chowk', 'Bara Imambara', 'landmark'),
  ('lko_rumi_darwaza', 'Lucknow', 'Chowk', 'Rumi Darwaza', 'landmark'),
  ('lko_ambedkar_park', 'Lucknow', 'Gomti Nagar', 'Ambedkar Memorial Park', 'park'),
  ('lko_janeshwar_park', 'Lucknow', 'Gomti Nagar', 'Janeshwar Mishra Park', 'park'),
  ('lko_riverfront', 'Lucknow', 'Gomti Nagar', 'Gomti Riverfront', 'promenade'),
  ('lko_phoenix_palassio', 'Lucknow', 'Gomti Nagar Extension', 'Phoenix Palassio', 'mall'),
  ('lko_lulu', 'Lucknow', 'Sushant Golf City', 'Lulu Mall', 'mall'),
  ('ngp_futala', 'Nagpur', 'Dharampeth', 'Futala Lake', 'promenade'),
  ('ngp_ambazari', 'Nagpur', 'Ambazari', 'Ambazari Lake Garden', 'park'),
  ('ngp_japanese_garden', 'Nagpur', 'Civil Lines', 'Japanese Garden', 'park'),
  ('ngp_zero_mile', 'Nagpur', 'Civil Lines', 'Zero Mile Stone', 'landmark'),
  ('ngp_maharajbagh', 'Nagpur', 'Sitabuldi', 'Maharajbagh Garden', 'park'),
  ('ngp_sitabuldi', 'Nagpur', 'Sitabuldi', 'Sitabuldi Main Road', 'market'),
  ('ngp_eternity', 'Nagpur', 'Sitabuldi', 'Eternity Mall', 'mall'),
  ('ngp_empress', 'Nagpur', 'Gandhibagh', 'Empress Mall', 'mall'),
  ('srt_dumas', 'Surat', 'Dumas', 'Dumas Beach', 'promenade'),
  ('srt_athwa_chowpati', 'Surat', 'Athwa', 'Athwa Chowpati', 'promenade'),
  ('srt_gopi_talav', 'Surat', 'Chowk Bazaar', 'Gopi Talav', 'promenade'),
  ('srt_castle', 'Surat', 'Chowk Bazaar', 'Surat Castle', 'landmark'),
  ('srt_science_centre', 'Surat', 'Citylight', 'Science Centre', 'landmark'),
  ('srt_sarthana', 'Surat', 'Varachha', 'Sarthana Nature Park', 'park'),
  ('srt_vr_surat', 'Surat', 'Piplod', 'VR Surat', 'mall'),
  ('srt_rahul_raj', 'Surat', 'Piplod', 'Rahul Raj Mall', 'mall'),
  ('vad_sayaji_baug', 'Vadodara', 'Sayajigunj', 'Sayaji Baug', 'park'),
  ('vad_akota_garden', 'Vadodara', 'Akota', 'Akota Garden', 'park'),
  ('vad_sursagar', 'Vadodara', 'Old City', 'Sursagar Lake', 'promenade'),
  ('vad_mandvi', 'Vadodara', 'Old City', 'Mandvi Gate', 'landmark'),
  ('vad_mangal_bazaar', 'Vadodara', 'Old City', 'Mangal Bazaar', 'market'),
  ('vad_inorbit', 'Vadodara', 'Gorwa', 'Inorbit Mall', 'mall'),
  ('vad_seven_seas', 'Vadodara', 'Fatehgunj', 'Seven Seas Mall', 'mall'),
  ('vad_centre_square', 'Vadodara', 'Alkapuri', 'Centre Square Mall', 'mall'),
  ('vsk_rk_beach', 'Visakhapatnam', 'Beach Road', 'RK Beach', 'promenade'),
  ('vsk_submarine', 'Visakhapatnam', 'Beach Road', 'INS Kursura Submarine Museum', 'landmark'),
  ('vsk_vuda_park', 'Visakhapatnam', 'Beach Road', 'VUDA Park', 'park'),
  ('vsk_tenneti_park', 'Visakhapatnam', 'Beach Road', 'Tenneti Park', 'park'),
  ('vsk_rushikonda', 'Visakhapatnam', 'Rushikonda', 'Rushikonda Beach', 'promenade'),
  ('vsk_kailasagiri', 'Visakhapatnam', 'Kailasagiri', 'Kailasagiri Hilltop Park', 'park'),
  ('vsk_cmr_central', 'Visakhapatnam', 'Maddilapalem', 'CMR Central', 'mall'),
  ('vsk_jagadamba', 'Visakhapatnam', 'Jagadamba', 'Jagadamba Centre', 'market')
on conflict (id) do nothing;

delete from public.cities c where c.name = 'Delhi' and not c.active and not exists (select 1 from public.profiles p where p.city = c.name);

alter table public.profiles add column city_changed_at timestamptz;

create or replace function public.save_profile(p_name text, p_age integer, p_area text, p_pronouns text, p_tagline text, p_vibes text[], p_idea_ids text[], p_contact_kind text DEFAULT NULL::text, p_contact_handle text DEFAULT NULL::text, p_city text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
declare
  me uuid := auth.uid();
  v_name text := btrim(coalesce(p_name, ''));
  v_area text := btrim(coalesce(p_area, ''));
  v_pronouns text := btrim(coalesce(p_pronouns, ''));
  v_tagline text := btrim(coalesce(p_tagline, ''));
  v_city text;
  v_country text;
  v_vibes text[] := coalesce(p_vibes, '{}');
  v_ideas text[] := coalesce(p_idea_ids, '{}');
  v_handle text := btrim(coalesce(p_contact_handle, ''));
  cur profiles;
  seen_line text;
  line_changed boolean := false;
  line_shown text;
  palettes text[] := array['#FF2E93,#5B0F3A', '#A9D8F7,#4169E1', '#D7FF3E,#2F4A00', '#FF5A36,#5A1400', '#9AA0FF,#151845', '#FFD12E,#3F3000', '#FF2ED1,#3A0A45', '#2EE6C5,#06403A'];
begin
  if me is null then raise exception using errcode = 'PL001', message = 'Sign in first.'; end if;
  if (select count(*) from private.actions where user_id = me and kind = 'save_profile' and at > now() - interval '1 day') >= 20 then
    raise exception using errcode = 'PL027', message = 'You have changed your profile a lot today. Try again tomorrow.';
  end if;
  insert into private.actions (user_id, kind) values (me, 'save_profile');
  -- Where (WP8, WP9): the city must be open, in a country that is open. A first profile also needs
  -- the request to come from an open country (when the network says where it comes from) and the
  -- four consents at the current versions.
  v_city := coalesce(nullif(btrim(p_city), ''), (select city from profiles where id = me), 'Mumbai');
  select c.country into v_country from cities c join countries k on k.code = c.country where c.name = v_city and c.active and k.active;
  if not found then raise exception using errcode = 'PL076', message = 'Pinkilock is not open in that city yet.'; end if;
  if not exists (select 1 from profiles where id = me) then
    if private.request_country() is not null and not exists (select 1 from countries where code = private.request_country() and active) then
      raise exception using errcode = 'PL078', message = 'Pinkilock is not open in your country yet.';
    end if;
    if not private.has_consents(me) then
      raise exception using errcode = 'PL077', message = 'Agree to the terms, the privacy policy and the use of your dating preferences first.';
    end if;
  end if;
  if char_length(v_name) not between 2 and 16 or v_name ~ '[[:digit:][:space:][:punct:]]' then
    raise exception using errcode = 'PL060', message = 'Use your first name: letters only, 2 to 16.';
  end if;
  if p_age is null or p_age not between 18 and 99 then
    raise exception using errcode = 'PL061', message = 'You need to be 18 or older.';
  end if;
  if cardinality(v_vibes) > 3 or cardinality(v_vibes) <> (select count(distinct v) from unnest(v_vibes) v)
     or exists (select 1 from unnest(v_vibes) v where v not in (select label from vibes)) then
    raise exception using errcode = 'PL062', message = 'Pick up to three tags from the list.';
  end if;
  if cardinality(v_ideas) not between 3 and 6 or cardinality(v_ideas) <> (select count(distinct i) from unnest(v_ideas) i)
     or exists (select 1 from unnest(v_ideas) i where i not in (select id from ideas)) then
    raise exception using errcode = 'PL063', message = 'Pick three to six things you are up for.';
  end if;
  if char_length(v_area) > 40 or char_length(v_pronouns) > 20 or char_length(v_tagline) > 80 then
    raise exception using errcode = 'PL064', message = 'That is too long.';
  end if;
  if private.looks_like_contact(v_tagline) or private.looks_like_contact(v_area) or private.looks_like_contact(v_pronouns) then
    raise exception using errcode = 'PL065', message = 'Contacts unlock after a kept promise. Take that out.';
  end if;
  if p_contact_kind is not null or p_contact_handle is not null then
    -- A kind offered in this person's country (contact_kinds, WP9).
    if p_contact_kind is null or v_handle = ''
       or not exists (select 1 from contact_kinds k where k.kind = p_contact_kind and (k.countries is null or v_country = any (k.countries))) then
      raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.';
    end if;
    v_handle := private.normalize_contact(p_contact_kind, v_handle);
  elsif not exists (select 1 from profile_private where profile_id = me) then
    raise exception using errcode = 'PL066', message = 'Add how people reach you after a kept promise.';
  end if;
  -- Picked, not typed (WP1): the area from the city's list (when it has one), pronouns from theirs.
  -- What is already saved stays valid, so a profile from before the lists can still be edited.
  -- A move to another city needs an area from the new city's list, even one with the same name.
  if v_area <> '' and (v_area is distinct from (select area from profiles where id = me)
                       or v_city is distinct from (select city from profiles where id = me))
     and exists (select 1 from areas a where a.city = v_city)
     and not exists (select 1 from areas a where a.city = v_city and a.name = v_area) then
    raise exception using errcode = 'PL095', message = 'Pick your area from the list.';
  end if;
  if v_pronouns <> '' and v_pronouns is distinct from (select pronouns from profiles where id = me)
     and not exists (select 1 from pronoun_options o where o.label = v_pronouns) then
    raise exception using errcode = 'PL096', message = 'Pick your pronouns from the list.';
  end if;
  -- What is on offer where I live (WP9): an idea with countries is only for people in those. One
  -- already saved stays, so a profile is never locked out of editing by a change to the catalogue.
  if exists (select 1 from unnest(v_ideas) i join ideas d on d.id = i
             where d.countries is not null and not (v_country = any (d.countries))
               and not (i = any (coalesce((select idea_ids from profiles where id = me), '{}')))) then
    raise exception using errcode = 'PL104', message = 'Pick things that are on offer where you live.';
  end if;

  -- Change limits (WP1): a name once in 30 days, the line and the city once in 7 (the first ones are free). A
  -- suspended account changes nothing; a line removed by a moderator cannot be replaced for 30 days.
  select * into cur from profiles where id = me;
  seen_line := coalesce((select r.text from private.line_reviews r where r.profile_id = me and r.status in ('pending', 'held')), cur.tagline, '');
  line_changed := cur.id is not null and v_tagline <> seen_line;
  if cur.id is not null then
    if cur.suspended_at is not null then
      raise exception using errcode = 'PL072', message = 'This account is paused while we look at a report.';
    end if;
    if v_name <> cur.name and cur.name_changed_at > now() - interval '30 days' then
      raise exception using errcode = 'PL070', message = 'You changed your name recently. You can change it again 30 days after.';
    end if;
    if line_changed and v_tagline <> '' and cur.tagline_locked_until > now() then
      raise exception using errcode = 'PL073', message = 'Your line was removed after a report. You can add one again later.';
    end if;
    if v_city <> cur.city and cur.city_changed_at > now() - interval '7 days' then
      raise exception using errcode = 'PL105', message = 'You moved city this week. You can move again 7 days after.';
    end if;
    if line_changed and cur.tagline_changed_at > now() - interval '7 days' then
      raise exception using errcode = 'PL071', message = 'You changed your line this week. You can change it again 7 days after.';
    end if;
  end if;

  -- The line others see. With review on, a new line waits in private.line_reviews and the card
  -- keeps the last approved one (none for a new profile). Removing the line needs no review.
  line_shown := coalesce(cur.tagline, '');
  if cur.id is null or line_changed then
    delete from private.line_reviews where profile_id = me and status in ('pending', 'held');
    if v_tagline = '' or coalesce(private.config_text('line_review'), 'off') not in ('human', 'ai') then
      line_shown := v_tagline;
    else
      insert into private.line_reviews (profile_id, text) values (me, v_tagline)
      on conflict (profile_id) do update set text = excluded.text, status = 'pending', reason = null, created_at = now(),
        decided_at = null, decided_by = null, claimed_at = null, attempts = 0;
    end if;
  end if;

  insert into profiles (id, name, age, area, pronouns, tagline, vibes, idea_ids, palette, city, country)
  values (me, v_name, p_age, v_area, v_pronouns, line_shown, v_vibes, v_ideas,
          string_to_array(palettes[1 + abs(hashtext(me::text)) % cardinality(palettes)], ','), v_city, v_country)
  on conflict (id) do update set name = excluded.name, age = excluded.age, area = excluded.area, pronouns = excluded.pronouns,
    city = excluded.city, country = excluded.country,
    tagline = excluded.tagline, vibes = excluded.vibes, idea_ids = excluded.idea_ids,
    name_changed_at = case when excluded.name <> profiles.name then now() else profiles.name_changed_at end,
    city_changed_at = case when excluded.city <> profiles.city then now() else profiles.city_changed_at end,
    tagline_changed_at = case when line_changed then now() else profiles.tagline_changed_at end;

  if p_contact_kind is not null then
    insert into profile_private (profile_id, contact_kind, contact_handle) values (me, p_contact_kind, v_handle)
    on conflict (profile_id) do update set contact_kind = excluded.contact_kind, contact_handle = excluded.contact_handle,
      contact_verified_at = case when (profile_private.contact_kind, profile_private.contact_handle) = (excluded.contact_kind, excluded.contact_handle)
                                 then profile_private.contact_verified_at end;
  end if;
end $$;
