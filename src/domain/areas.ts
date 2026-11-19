/**
 * Areas a person picks from (docs/build-plan.md, WP1 and WP9): typed areas were a way to slip a
 * contact onto a card, and a city with a list reads as local. The same rows are the `areas` table
 * (supabase/migrations/20261118000003_picked_fields.sql); tests/unit/areas.test.ts keeps the two in
 * step. A city gets its list when it opens. The names match the venue catalogue's areas, so the
 * places nearest to someone come first in an ask.
 */
export const AREAS: Record<string, string[]> = {
  Mumbai: [
    'Airoli', 'Andheri East', 'Andheri West', 'Bandra East', 'Bandra West', 'Belapur', 'Bhandup',
    'Bhayandar', 'Bhiwandi', 'BKC', 'Borivali', 'Breach Candy', 'Byculla', 'Chandivali', 'Charni Road', 'Chembur',
    'Churchgate', 'Colaba', 'Cuffe Parade', 'Dadar', 'Dahisar', 'Deonar', 'Dombivli', 'Fort',
    'Ghansoli', 'Ghatkopar', 'Goregaon', 'Govandi', 'Grant Road', 'Jogeshwari', 'Juhu', 'Kalina',
    'Kalyan', 'Kamothe', 'Kandivali', 'Kanjurmarg', 'Khar', 'Kharghar', 'Kopar Khairane', 'Kurla',
    'Lalbaug', 'Lower Parel', 'Mahalaxmi', 'Mahim', 'Malabar Hill', 'Malad', 'Marine Lines', 'Marol',
    'Matunga', 'Mazgaon', 'Mira Road', 'Mulund', 'Mumbai Central', 'Nalasopara', 'Nariman Point',
    'Navi Mumbai', 'Nerul', 'Panvel', 'Parel', 'Peddar Road', 'Powai', 'Prabhadevi', 'Sakinaka',
    'Sanpada', 'Santacruz', 'Seawoods', 'Sewri', 'Sion', 'Tardeo', 'Thane', 'Ulwe', 'Vasai', 'Vashi',
    'Versova', 'Vikhroli', 'Vile Parle', 'Virar', 'Wadala', 'Walkeshwar', 'Worli',
  ],
  'Delhi NCR': [
    'Adarsh Nagar', 'Ashok Vihar', 'Badarpur', 'Burari', 'Chanakyapuri', 'Chandni Chowk', 'Chhatarpur',
    'Chittaranjan Park', 'Civil Lines', 'Connaught Place', 'Defence Colony', 'Dhaula Kuan',
    'Dilshad Garden', 'DLF Phase 1', 'DLF Phase 3', 'DLF Phase 5', 'Dwarka', 'East of Kailash',
    'Faridabad', 'Ghaziabad', 'Golf Course Extension', 'Golf Course Road', 'Greater Kailash',
    'Greater Noida', 'Green Park', 'Gurugram', 'Hauz Khas', 'INA', 'Indirapuram', 'Janakpuri',
    'Jangpura', 'Jasola', 'Kalkaji', 'Kamla Nagar', 'Karol Bagh', 'Kartavya Path', 'Khan Market',
    'Kirti Nagar', 'Lajpat Nagar', 'Laxmi Nagar', 'Lodhi Road', 'Malviya Nagar', 'Mayur Vihar',
    'Mehrauli', 'Model Town', 'Moti Nagar', 'Mukherjee Nagar', 'Munirka', 'Najafgarh', 'Narela',
    'Nehru Place', 'Netaji Subhash Place', 'New Friends Colony', 'Nizamuddin', 'Noida',
    'Noida Extension', 'Okhla', 'Paschim Vihar', 'Patel Nagar', 'Patparganj', 'Pitampura',
    'Preet Vihar', 'Punjabi Bagh', 'Raj Nagar Extension', 'Rajendra Place', 'Rajinder Nagar',
    'Rajouri Garden', 'Rohini', 'Safdarjung Enclave', 'Saket', 'Sarita Vihar', 'Sector 18 Noida',
    'Sector 62 Noida', 'Shahdara', 'Shahpur Jat', 'Shalimar Bagh', 'Sohna Road', 'South Extension',
    'Subhash Nagar', 'Sushant Lok', 'Tilak Nagar', 'Uttam Nagar', 'Vaishali', 'Vasant Kunj',
    'Vasant Vihar', 'Vasundhara', 'Vikaspuri', 'Yamuna Vihar',
  ],
  Bengaluru: [
    'Banashankari', 'Banaswadi', 'Bannerghatta Road', 'Basavanagudi', 'Basaveshwaranagar', 'Begur',
    'Bellandur', 'Bommanahalli', 'Brookefield', 'BTM Layout', 'Chikkalasandra', 'Cooke Town',
    'Cunningham Road', 'CV Raman Nagar', 'Domlur', 'Ejipura', 'Electronic City', 'Frazer Town',
    'Girinagar', 'HBR Layout', 'Hebbal', 'Hennur', 'Hoodi', 'Horamavu', 'HSR Layout', 'Hulimavu',
    'Indiranagar', 'Jakkur', 'Jalahalli', 'Jayanagar', 'JP Nagar', 'Kadugodi', 'Kalyan Nagar',
    'Kammanahalli', 'Kengeri', 'Koramangala', 'KR Puram', 'Kumaraswamy Layout', 'Langford Town',
    'Mahadevapura', 'Malleshwaram', 'Marathahalli', 'Mathikere', 'MG Road', 'Nagarbhavi',
    'Old Airport Road', 'Padmanabhanagar', 'Rajajinagar', 'Richmond Town', 'RR Nagar', 'RT Nagar',
    'Sadashivanagar', 'Sahakar Nagar', 'Sanjaynagar', 'Sarjapur Road', 'Seshadripuram', 'Shanthinagar',
    'Shivajinagar', 'Thanisandra', 'Ulsoor', 'Uttarahalli', 'Varthur', 'Vasanth Nagar',
    'Vidyaranyapura', 'Vijayanagar', 'Whitefield', 'Wilson Garden', 'Yelahanka', 'Yeshwanthpur',
  ],
  Hyderabad: [
    'Abids', 'Alwal', 'Ameerpet', 'AS Rao Nagar', 'Attapur', 'Bachupally', 'Bandlaguda',
    'Banjara Hills', 'Barkatpura', 'Begumpet', 'Boduppal', 'Bolarum', 'Bowenpally', 'Chanda Nagar',
    'Charminar', 'Chikkadpally', 'Dilsukhnagar', 'ECIL', 'Film Nagar', 'Financial District',
    'Gachibowli', 'Golconda', 'Habsiguda', 'Hayathnagar', 'Himayatnagar', 'HITEC City',
    'Jubilee Hills', 'Kachiguda', 'Kavadiguda', 'Khairatabad', 'Kokapet', 'Kompally', 'Kondapur',
    'Koti', 'Kukatpally', 'Lakdikapul', 'LB Nagar', 'Madhapur', 'Malakpet', 'Malkajgiri', 'Manikonda',
    'Masab Tank', 'Masjid Banda', 'Medipally', 'Mehdipatnam', 'Miyapur', 'Moosapet', 'Nallagandla',
    'Nampally', 'Narayanguda', 'Narsingi', 'Nizampet', 'Panjagutta', 'Puppalaguda', 'Raidurg',
    'Ramanthapur', 'Sainikpuri', 'Sanath Nagar', 'Saroornagar', 'Secunderabad', 'Serilingampally',
    'Shamshabad', 'Somajiguda', 'Tank Bund', 'Tarnaka', 'Tolichowki', 'Trimulgherry', 'Uppal',
    'Vanasthalipuram', 'Yousufguda',
  ],
  Chennai: [
    'Adyar', 'Alwarpet', 'Ambattur', 'Anna Nagar', 'Anna Salai', 'Arumbakkam', 'Ashok Nagar', 'Avadi',
    'Besant Nagar', 'Chetpet', 'Chintadripet', 'Choolaimedu', 'Chromepet', 'Egmore', 'Ekkatuthangal',
    'Gopalapuram', 'Guindy', 'Injambakkam', 'Karapakkam', 'Kelambakkam', 'Kilpauk', 'KK Nagar',
    'Kodambakkam', 'Kolathur', 'Kotturpuram', 'Koyambedu', 'Madipakkam', 'Mandaveli', 'Medavakkam',
    'Mogappair', 'Mylapore', 'Nanganallur', 'Navalur', 'Neelankarai', 'Nungambakkam', 'OMR', 'Padi',
    'Palavakkam', 'Pallavaram', 'Pallikaranai', 'Pammal', 'Perambur', 'Perungudi', 'Porur',
    'Purasawalkam', 'Raja Annamalai Puram', 'Royapettah', 'Saidapet', 'Santhome', 'Selaiyur',
    'Sholinganallur', 'Siruseri', 'T Nagar', 'Tambaram', 'Teynampet', 'Thiruvanmiyur', 'Thiruvottiyur',
    'Thoraipakkam', 'Tondiarpet', 'Triplicane', 'Urapakkam', 'Vadapalani', 'Valasaravakkam',
    'Velachery', 'Vepery', 'Villivakkam', 'Virugambakkam', 'Washermanpet', 'West Mambalam',
  ],
  Kolkata: [
    'Alipore', 'Anandapur', 'Bagbazar', 'Baguiati', 'Bally', 'Ballygunge', 'Bansdroni', 'Baranagar',
    'Barasat', 'BBD Bagh', 'Behala', 'Beleghata', 'Belgharia', 'Bhowanipore', 'Bidhannagar',
    'Camac Street', 'Chetla', 'Chinar Park', 'College Street', 'Dakshineswar', 'Dalhousie', 'Dhakuria',
    'Dum Dum', 'Dum Dum Park', 'Elgin Road', 'Esplanade', 'Garia', 'Gariahat', 'Golf Green', 'Golpark',
    'Hatibagan', 'Hazra', 'Howrah', 'Jadavpur', 'Jodhpur Park', 'Kalighat', 'Kankurgachi', 'Kasba',
    'Keshtopur', 'Khidirpur', 'Lake Gardens', 'Lake Town', 'Lansdowne', 'Maidan', 'Maniktala',
    'Moulali', 'Mukundapur', 'Naktala', 'New Alipore', 'New Town', 'Park Street', 'Phoolbagan',
    'Rajarhat', 'Rashbehari', 'Regent Park', 'Salt Lake', 'Santoshpur', 'Sealdah', 'Sector V',
    'Shibpur', 'Shyambazar', 'Sinthee', 'Sodepur', 'Sovabazar', 'Taltala', 'Tangra', 'Thakurpukur',
    'Tollygunge', 'Ultadanga',
  ],
  Pune: [
    'Akurdi', 'Ambegaon', 'Aundh', 'Balewadi', 'Baner', 'Bavdhan', 'Bhosari', 'Bibwewadi',
    'Boat Club Road', 'Camp', 'Chandan Nagar', 'Charholi', 'Chinchwad', 'Dapodi', 'Deccan', 'Dhanori',
    'Dhayari', 'Erandwane', 'Fatima Nagar', 'Hadapsar', 'Hinjewadi', 'Kalewadi', 'Kalyani Nagar',
    'Karve Nagar', 'Karve Road', 'Kasba Peth', 'Katraj', 'Khadki', 'Kharadi', 'Kondhwa',
    'Koregaon Park', 'Kothrud', 'Lohegaon', 'Magarpatta', 'Market Yard', 'Model Colony', 'Moshi',
    'Mundhwa', 'Nanded City', 'Narhe', 'NIBM Road', 'Nigdi', 'Parvati', 'Pashan', 'Pimple Gurav',
    'Pimple Nilakh', 'Pimple Saudagar', 'Pimpri', 'Prabhat Road', 'Pune Station', 'Rasta Peth',
    'Ravet', 'Sadashiv Peth', 'Salunke Vihar', 'Sangvi', 'Shaniwar Peth', 'Shivajinagar',
    'Sinhagad Road', 'Sus', 'Swargate', 'Tathawade', 'Undri', 'Vadgaon Sheri', 'Viman Nagar',
    'Vishrantwadi', 'Wagholi', 'Wakad', 'Wanowrie', 'Warje', 'Yerawada',
  ],
  Ahmedabad: [
    'Ambawadi', 'Ambli', 'Amraiwadi', 'Ashram Road', 'Bapunagar', 'Bodakdev', 'Bopal', 'Chandkheda',
    'Chandlodia', 'Drive In Road', 'Ellisbridge', 'Gandhinagar', 'Ghatlodia', 'Ghodasar', 'Gota',
    'Gulbai Tekra', 'Gurukul', 'Hatkeshwar', 'Infocity Gandhinagar', 'Isanpur', 'Jagatpur', 'Jodhpur',
    'Juhapura', 'Khanpur', 'Khokhra', 'Kudasan', 'Lal Darwaja', 'Makarba', 'Maninagar', 'Memnagar',
    'Mithakhali', 'Motera', 'Naranpura', 'Naroda', 'Nava Vadaj', 'Navrangpura', 'New CG Road', 'Nikol',
    'Odhav', 'Old City', 'Paldi', 'Prahlad Nagar', 'Ranip', 'Raysan', 'Sabarmati', 'Sanand',
    'Sargasan', 'Sarkhej', 'Satellite', 'Science City', 'SG Highway', 'Shahibaug', 'Shela', 'Shilaj',
    'Shyamal', 'Sindhu Bhavan', 'Sola', 'South Bopal', 'Thaltej', 'Usmanpura', 'Vadaj', 'Vasna',
    'Vastral', 'Vastrapur', 'Vatva', 'Vejalpur',
  ],
  Bhubaneswar: [
    'Acharya Vihar', 'Aiginia', 'Bapuji Nagar', 'Baramunda', 'Bhoi Nagar', 'Bomikhal', 'Chandaka',
    'Chandrasekharpur', 'Cuttack', 'Cuttack Road', 'Damana', 'Dumduma', 'Forest Park', 'Gadakana',
    'Ghatikia', 'Gothapatna', 'Infocity', 'Jagamara', 'Janpath', 'Jatni', 'Jaydev Vihar', 'Jharpada',
    'Kalinga Nagar', 'Kalpana Square', 'Kapila Prasad', 'Kesura', 'Khandagiri', 'Kharavela Nagar',
    'Laxmisagar', 'Lewis Road', 'Lingipur', 'Mahanadi Vihar', 'Mancheswar', 'Master Canteen',
    'Nalco Nagar', 'Nayapalli', 'Niladri Vihar', 'Old Station Road', 'Old Town', 'Pahala', 'Palasuni',
    'Patia', 'Patrapada', 'Pokhariput', 'Raghunathpur', 'Rasulgarh', 'Rental Colony', 'Saheed Nagar',
    'Sailashree Vihar', 'Samantarapur', 'Satya Nagar', 'Shastri Nagar', 'Siripur', 'Sishu Vihar',
    'Sundarpada', 'Tamando', 'Unit 1', 'Unit 2', 'Unit 3', 'Unit 4', 'Unit 6', 'Unit 8', 'Unit 9',
    'Vani Vihar', 'Vivekananda Marg', 'VSS Nagar',
  ],
  Chandigarh: [
    'Aerocity Mohali', 'Bhabat', 'Burail', 'Daria', 'Dera Bassi', 'Dhakoli', 'Dhanas',
    'Industrial Area', 'IT Park', 'Kharar', 'Kharar Road', 'Kishangarh', 'Landran', 'Manimajra',
    'Mohali', 'Mohali Phase 10', 'Mohali Phase 11', 'Mohali Phase 3B2', 'Mohali Phase 7',
    'Mohali Sector 70', 'Mullanpur', 'New Chandigarh', 'Panchkula', 'Panchkula Sector 20',
    'Panchkula Sector 5', 'Peer Muchalla', 'Pinjore', 'Raipur Khurd', 'Sector 1', 'Sector 10',
    'Sector 11', 'Sector 15', 'Sector 16', 'Sector 17', 'Sector 18', 'Sector 19', 'Sector 2',
    'Sector 20', 'Sector 21', 'Sector 22', 'Sector 23', 'Sector 26', 'Sector 27', 'Sector 3',
    'Sector 32', 'Sector 33', 'Sector 34', 'Sector 35', 'Sector 36', 'Sector 37', 'Sector 38',
    'Sector 4', 'Sector 40', 'Sector 43', 'Sector 44', 'Sector 45', 'Sector 46', 'Sector 47',
    'Sector 48', 'Sector 49', 'Sector 5', 'Sector 7', 'Sector 8', 'Sector 9', 'Zirakpur',
  ],
  Coimbatore: [
    'Avinashi Road', 'Bharathi Park', 'Cheran Ma Nagar', 'Chinnavedampatti', 'Chinniyampalayam',
    'Eachanari', 'Edayarpalayam', 'Ganapathy', 'Gandhi Park', 'Gandhipuram', 'Goldwins',
    'Hope College', 'Kalapatti', 'Kalveerampalayam', 'Kavundampalayam', 'Kinathukadavu', 'Kovaipudur',
    'Kuniyamuthur', 'Kurichi', 'Lakshmi Mills', 'Malumichampatti', 'Mettupalayam Road',
    'Nanjundapuram', 'Narasimhanaickenpalayam', 'Neelambur', 'Ondipudur', 'Othakalmandapam',
    'Pappanaickenpalayam', 'Peelamedu', 'Perur', 'Podanur', 'Pollachi Road', 'Puliakulam',
    'Race Course', 'Ram Nagar', 'Ramanathapuram', 'Rathinapuri', 'RS Puram', 'Saibaba Colony',
    'Saravanampatti', 'Selvapuram', 'Singanallur', 'Sitra', 'Sowripalayam', 'Sundarapuram', 'Tatabad',
    'Thadagam Road', 'Thondamuthur', 'Thudiyalur', 'Town Hall', 'Trichy Road', 'Ukkadam',
    'Uppilipalayam', 'Vadavalli', 'Variety Hall Road', 'Vellalore', 'Vilankurichi',
  ],
  Goa: [
    'Agonda', 'Aldona', 'Altinho', 'Anjuna', 'Arambol', 'Arpora', 'Ashwem', 'Assagao', 'Baga',
    'Bambolim', 'Benaulim', 'Betalbatim', 'Bicholim', 'Bogmalo', 'Calangute', 'Canacona', 'Candolim',
    'Cansaulim', 'Caranzalem', 'Cavelossim', 'Chicalim', 'Chinchinim', 'Chorao', 'Colva', 'Corlim',
    'Cortalim', 'Curchorem', 'Curtorim', 'Dabolim', 'Divar', 'Dona Paula', 'Fatorda', 'Guirim',
    'Majorda', 'Mandrem', 'Mapusa', 'Margao', 'Merces', 'Miramar', 'Morjim', 'Navelim', 'Nerul',
    'Old Goa', 'Palolem', 'Panaji', 'Parra', 'Pernem', 'Ponda', 'Porvorim', 'Quepem', 'Raia',
    'Reis Magos', 'Ribandar', 'Saligao', 'Sancoale', 'Sangolda', 'Sanguem', 'Sanquelim', 'Santa Cruz',
    'Siolim', 'Taleigao', 'Tivim', 'Vagator', 'Valpoi', 'Varca', 'Vasco da Gama', 'Verna',
  ],
  Indore: [
    'AB Road', 'Aerodrome Road', 'Anand Bazaar', 'Annapurna', 'Bapat Square', 'Bengali Square',
    'Bhawarkua', 'Bicholi Mardana', 'Bijalpur', 'Chhawni', 'Chhota Bangarda', 'Dewas Naka',
    'Dhar Road', 'Geeta Bhawan', 'Gumasta Nagar', 'Indrapuri', 'Jail Road', 'Juni Indore',
    'Kalani Nagar', 'Kanadia Road', 'Khajrana', 'Khandwa Road', 'Krishnapura', 'Lasudia Mori',
    'LIG Colony', 'Mahalaxmi Nagar', 'Malharganj', 'Manik Bagh', 'MG Road', 'Mhow', 'Mhow Naka',
    'MR 10', 'Musakhedi', 'Nanda Nagar', 'Navlakha', 'Nipania', 'Old Palasia', 'Palasia',
    'Pardesipura', 'Pipliyahana', 'Pologround', 'Race Course Road', 'Radisson Square',
    'Rajendra Nagar', 'Rajwada', 'Rambagh', 'Ranjeet Hanuman', 'Rau', 'Rau Circle', 'Saket Nagar',
    'Sapna Sangeeta', 'Sarafa', 'Scheme 140', 'Scheme 54', 'Scheme 78', 'Shalimar Township',
    'Silicon City', 'Sudama Nagar', 'Sukhliya', 'Super Corridor', 'Talawali Chanda', 'Tilak Nagar',
    'Tukoganj', 'Usha Nagar', 'Vallabh Nagar', 'Vijay Nagar',
  ],
  Jaipur: [
    'Adarsh Nagar', 'Ajmer Road', 'Amer', 'Ashok Nagar', 'Bais Godam', 'Bajaj Nagar', 'Bani Park',
    'Barkat Nagar', 'Brahmapuri', 'C Scheme', 'Chandpole', 'Civil Lines', 'Durgapura', 'Gandhi Nagar',
    'Ghat Gate', 'Gopalbari', 'Gopalpura', 'Govind Nagar', 'Hasanpura', 'Jagatpura',
    'Jagatpura Phatak', 'Jawahar Circle', 'Jawahar Nagar', 'Jhalana', 'Jhotwara', 'JLN Marg',
    'Johari Bazaar', 'Kalwar Road', 'Kanakpura', 'Khatipura', 'Lal Kothi', 'Mahesh Nagar',
    'Malviya Nagar', 'Malviya Nagar Extension', 'Mansarovar', 'Mansarovar Extension', 'MI Road',
    'Moti Dungri', 'Murlipura', 'Nahargarh Road', 'Nirman Nagar', 'Old City', 'Panchyawala',
    'Pratap Nagar', 'Raja Park', 'Ramganj', 'Sanganer', 'Shastri Nagar', 'Shyam Nagar', 'Sikar Road',
    'Sirsi Road', 'Sitapura', 'Sodala', 'Station Road', 'Subhash Nagar', 'Tilak Nagar', 'Tonk Road',
    'Triveni Nagar', 'Vaishali Nagar', 'Vaishali Nagar West', 'Vidhyadhar Nagar',
  ],
  Kochi: [
    'Aluva', 'Angamaly', 'Bolgatty', 'Chalikavattom', 'Chembumukku', 'Cherai', 'Cheranalloor',
    'Chittoor Road', 'Edakochi', 'Edappally', 'Elamakkara', 'Elamkulam', 'Eloor', 'Ernakulam North',
    'Ernakulam South', 'Fort Kochi', 'Gandhi Nagar', 'Girinagar', 'Infopark', 'Kacheripady',
    'Kadavanthra', 'Kakkanad', 'Kakkanad West', 'Kalamassery', 'Kalavath Road', 'Kaloor',
    'Kathrikadavu', 'Kumbalam', 'Kumbalangi', 'Kundannoor', 'Kunnumpuram', 'Mamangalam', 'Maradu',
    'Marine Drive', 'Mattancherry', 'Menaka', 'MG Road', 'Mulavukad', 'Nettoor', 'Njarakkal',
    'North Paravur', 'Pachalam', 'Padivattom', 'Palarivattom', 'Palluruthy', 'Panampilly Nagar',
    'Perumbavoor', 'Pettah', 'Ponnurunni', 'Pottakuzhy', 'Ravipuram', 'Thammanam', 'Thevara',
    'Thoppumpady', 'Thrippunithura', 'Vaduthala', 'Vazhakkala', 'Vennala', 'Vyttila', 'Vyttila Hub',
    'Willingdon Island',
  ],
  Lucknow: [
    'Aishbagh', 'Alambagh', 'Aliganj', 'Aliganj Kapoorthala', 'Amausi', 'Aminabad', 'Ashiyana',
    'Balaganj', 'Bhootnath', 'Charbagh', 'Chinhat', 'Chowk', 'Daliganj', 'Daliganj Crossing',
    'Faizabad Road', 'Faizullaganj', 'Gomti Nagar', 'Gomti Nagar Extension',
    'Gomti Nagar Vishal Khand', 'Hazratganj', 'Hussainganj', 'IIM Road', 'Indira Nagar',
    'Indira Nagar Sector 14', 'Jankipuram', 'Jopling Road', 'Kaiserbagh', 'Kakori', 'Kalyanpur',
    'Kanpur Road', 'Kapoorthala', 'Krishna Nagar', 'Kursi Road', 'Lalbagh', 'LDA Colony', 'Mahanagar',
    'Mall Avenue', 'Matiyari', 'Munshi Pulia', 'Nakhas', 'Narhi', 'Nirala Nagar', 'Nishatganj', 'Para',
    'Patrakarpuram', 'Raebareli Road', 'Rajajipuram', 'Sadar Bazaar', 'Sarojini Nagar', 'Shaheed Path',
    'Sitapur Road', 'Sushant Golf City', 'Tedhi Puliya', 'Telibagh', 'Thakurganj', 'Transport Nagar',
    'Vibhuti Khand', 'Vikas Nagar', 'Viraj Khand', 'Vrindavan Yojna', 'Wazirganj',
  ],
  Nagpur: [
    'Abhyankar Nagar', 'Ajni', 'Ambazari', 'Ambazari Layout', 'Ayodhya Nagar', 'Bajaj Nagar', 'Besa',
    'Bezonbagh', 'Butibori', 'Byramji Town', 'Chhatrapati Square', 'Civil Lines', 'Dabha', 'Dhantoli',
    'Dharampeth', 'Dighori', 'Gandhibagh', 'Ganeshpeth', 'Gittikhadan', 'Godhni', 'Gokulpeth',
    'Hingna', 'Hingna Road', 'Hudkeshwar', 'Indora', 'Itwari', 'Jaitala', 'Jaripatka', 'Kalamna',
    'Kamptee Road', 'Katol Road', 'Khamla', 'Kharbi', 'Koradi Road', 'Laxmi Nagar', 'Mahal',
    'Manewada', 'Manish Nagar', 'Mankapur', 'Medical Square', 'Mihan', 'Mohan Nagar', 'Mominpura',
    'Nandanvan', 'Narendra Nagar', 'New Manish Nagar', 'Pande Layout', 'Pardi', 'Pratap Nagar',
    'Ramdaspeth', 'Rameshwari', 'Ravi Nagar', 'Sadar', 'Sakkardara', 'Seminary Hills', 'Shankar Nagar',
    'Sitabuldi', 'Somalwada', 'Sonegaon', 'Swawlambi Nagar', 'Telangkhedi', 'Trimurti Nagar', 'Wadi',
    'Wardha Road', 'Wathoda', 'Zingabai Takli',
  ],
  Surat: [
    'Adajan', 'Adajan Patia', 'Althan', 'Amroli', 'Athwa', 'Bhagal', 'Bhatar', 'Bhestan', 'Bhimrad',
    'Chowk Bazaar', 'Citylight', 'Dindoli', 'Dumas', 'Dumas Road', 'Gaurav Path', 'Ghod Dod Road',
    'Godadara', 'Gopipura', 'Haripura', 'Hazira', 'Ichchhapor', 'Jahangirpura', 'Kamrej', 'Kapodra',
    'Katargam', 'Katargam Darwaja', 'Kosad', 'Limbayat', 'Magdalla', 'Majura Gate', 'Mota Varachha',
    'Nana Varachha', 'Nanpura', 'New Citylight', 'Pal', 'Palanpur', 'Palanpur Road', 'Pandesara',
    'Parle Point', 'Parvat Patia', 'Piplod', 'Puna', 'Rander', 'Rander Road', 'Rundh', 'Sachin',
    'Sagrampura', 'Salabatpura', 'Sarthana', 'Singanpore', 'Sumul Dairy Road', 'Udhna',
    'Udhna Darwaja', 'Uttran', 'Varachha', 'Ved Road', 'Vesu', 'VIP Road', 'Yogi Chowk',
  ],
  Vadodara: [
    'Ajwa Road', 'Akota', 'Alkapuri', 'Ankhol', 'Atladara', 'Bapod', 'Bhayli', 'Bhayli Road',
    'Chakli Circle', 'Chhani', 'Dandia Bazaar', 'Diwalipura', 'Ellora Park', 'Fatehgunj', 'Fatehpura',
    'Genda Circle', 'Gorwa', 'Gorwa BIDC', 'Gotri', 'Gotri Road', 'Harni', 'Harni Road', 'Jail Road',
    'Jetalpur', 'Kalali', 'Kapurai', 'Karelibaug', 'Laxmipura', 'Makarpura', 'Makarpura GIDC',
    'Mandvi', 'Manjalpur', 'Manjalpur Naka', 'Navapura', 'New VIP Road', 'Nizampura', 'Nizampura Main',
    'Old City', 'Old Padra Road', 'Padra', 'Panigate', 'Pratapgunj', 'Productivity Road',
    'Race Course', 'Raopura', 'Sama', 'Sayajigunj', 'Sayajipura', 'Sevasi', 'Soma Talav', 'Subhanpura',
    'Sussen', 'Tarsali', 'Undera', 'Vadsar', 'Vasna', 'Vasna Road', 'Vemali', 'Wadi', 'Waghodia',
    'Waghodia Road',
  ],
  Visakhapatnam: [
    'Aganampudi', 'Akkayyapalem', 'Allipuram', 'Anakapalli', 'Anandapuram', 'Appughar', 'Arilova',
    'Asilmetta', 'Beach Road', 'Bheemili', 'Bhimunipatnam', 'Chinagadili', 'Chinna Waltair',
    'Daba Gardens', 'Dondaparthy', 'Duvvada', 'Dwaraka Nagar', 'Gajuwaka', 'Gopalapatnam',
    'Health City', 'Isukathota', 'Jagadamba', 'Kailasagiri', 'Kancharapalem', 'Kirlampudi Layout',
    'Kommadi', 'Kurmannapalem', 'Lawsons Bay', 'Lawsons Bay Colony', 'Maddilapalem', 'Madhurawada',
    'Marripalem', 'Murali Nagar', 'Muvvalavanipalem', 'MVP Colony', 'NAD Junction', 'Nakkavanipalem',
    'Old Town', 'Pandurangapuram', 'Pedagantyada', 'Pendurthi', 'Pendurthi Junction', 'PM Palem',
    'Port Area', 'Ram Nagar', 'Rushikonda', 'Sagar Nagar', 'Seethammadhara', 'Sheela Nagar',
    'Shivaji Palem', 'Simhachalam', 'Siripuram', 'Steel Plant', 'Sujatha Nagar', 'Thatichetlapalem',
    'Vepagunta', 'Visalakshi Nagar', 'Waltair Uplands', 'Yarada', 'Yendada',
  ],
  Vijayawada: [
    'Benz Circle', 'Bhavanipuram', 'Gollapudi', 'Governorpet', 'Gunadala', 'Kanuru',
    'Krishna Lanka', 'Labbipet', 'Moghalrajpuram', 'One Town', 'Patamata', 'Poranki',
    'Satyanarayanapuram', 'Suryaraopet',
  ],
  Guntur: [
    'Amaravathi Road', 'Arundelpet', 'Brindavan Gardens', 'Brodipet', 'Chandramouli Nagar',
    'Gorantla', 'Kothapet', 'Lakshmipuram', 'Mangalagiri', 'Nallapadu', 'Old Guntur',
    'Pattabhipuram', 'Syamala Nagar', 'Vidya Nagar',
  ],
  Nellore: [
    'AC Nagar', 'Balaji Nagar', 'Dargamitta', 'Fathekhanpet', 'Haranathapuram', 'Kisan Nagar',
    'Magunta Layout', 'Mulapet', 'Pogathota', 'Ramalingapuram', 'Stonehousepet', 'Trunk Road',
    'Vedayapalem',
  ],
  Guwahati: [
    'Beltola', 'Bhangagarh', 'Chandmari', 'Christian Basti', 'Dispur', 'Fancy Bazaar', 'Ganeshguri',
    'Jalukbari', 'Khanapara', 'Lachit Nagar', 'Maligaon', 'Paltan Bazaar', 'Pan Bazaar',
    'Silpukhuri', 'Six Mile', 'Uzan Bazaar', 'Zoo Road',
  ],
  Patna: [
    'Anisabad', 'Ashok Rajpath', 'Bailey Road', 'Bankipur', 'Boring Road', 'Danapur', 'Fraser Road',
    'Gandhi Maidan', 'Kankarbagh', 'Kurji', 'Patliputra Colony', 'Patna City', 'Raja Bazar',
    'Rajendra Nagar',
  ],
  Raipur: [
    'Amlidih', 'Civil Lines', 'Daldal Seoni', 'Devendra Nagar', 'Fafadih', 'Gol Bazar', 'Mowa',
    'Naya Raipur', 'Pandri', 'Purani Basti', 'Samta Colony', 'Shankar Nagar', 'Tatibandh',
    'Telibandha',
  ],
  Bhilai: [
    'Bhilai 3', 'Civic Centre', 'Durg', 'Khursipar', 'Kohka', 'Nehru Nagar', 'Padmanabhpur',
    'Power House', 'Risali', 'Sector 10', 'Sector 6', 'Smriti Nagar', 'Supela',
  ],
  Rajkot: [
    '150 Feet Ring Road', 'Amin Marg', 'Bhaktinagar', 'Dhebar Road', 'Gondal Road', 'Jamnagar Road',
    'Kalawad Road', 'Kotecha Chowk', 'Mavdi', 'Morbi Road', 'Race Course', 'Raiya Road',
    'University Road', 'Yagnik Road',
  ],
  Jamnagar: [
    'Bedeshwar', 'Bedi Gate', 'Darbargadh', 'Digvijay Plot', 'Gulab Nagar', 'Hapa', 'Indira Colony',
    'Khodiyar Colony', 'Lakhota', 'Pandit Nehru Marg', 'Patel Colony', 'Ranjit Sagar Road',
    'Saru Section Road',
  ],
  Bhavnagar: [
    'Akwada', 'Bhavnagar Para', 'Chitra', 'Crescent', 'Ghogha Circle', 'Kalanala', 'Kaliyabid',
    'Nilambaug', 'Sardarnagar', 'Subhashnagar', 'Takhteshwar', 'Vidyanagar', 'Waghawadi Road',
  ],
  Ranchi: [
    'Argora', 'Ashok Nagar', 'Bariatu', 'Doranda', 'Harmu', 'Hatia', 'Hinoo', 'Kanke Road', 'Kokar',
    'Lalpur', 'Main Road', 'Morabadi', 'Namkum', 'Ratu Road',
  ],
  Jamshedpur: [
    'Adityapur', 'Baridih', 'Bistupur', 'Burmamines', 'Golmuri', 'Jugsalai', 'Kadma', 'Mango',
    'Parsudih', 'Sakchi', 'Sidhgora', 'Sonari', 'Telco',
  ],
  Dhanbad: [
    'Bank More', 'Bartand', 'Dhaiya', 'Govindpur', 'Hirak Road', 'Hirapur', 'Jharia', 'Katras',
    'Luby Circular Road', 'Matkuria', 'Police Line', 'Saraidhela', 'Sindri',
  ],
  Bokaro: [
    'Bokaro Thermal', 'Chas', 'Chira Chas', 'City Centre', 'Naya More', 'Sector 1', 'Sector 12',
    'Sector 2', 'Sector 3', 'Sector 4', 'Sector 5', 'Sector 6', 'Sector 9',
  ],
  Srinagar: [
    'Batamaloo', 'Bemina', 'Boulevard Road', 'Dal Gate', 'Hazratbal', 'Hyderpora', 'Jawahar Nagar',
    'Karan Nagar', 'Lal Chowk', 'Nishat', 'Nowhatta', 'Rajbagh', 'Shalimar', 'Sonwar',
  ],
  Jammu: [
    'Bahu Fort', 'Bakshi Nagar', 'Canal Road', 'Channi Himmat', 'Gandhi Nagar', 'Janipur',
    'Nanak Nagar', 'Raghunath Bazaar', 'Rehari', 'Residency Road', 'Sainik Colony', 'Shastri Nagar',
    'Talab Tillo', 'Trikuta Nagar',
  ],
  Mysuru: [
    'Bogadi', 'Chamundi Hill', 'Devaraja Mohalla', 'Gokulam', 'Hebbal', 'Jayalakshmipuram',
    'JP Nagar', 'Kuvempunagar', 'Lakshmipuram', 'Nazarbad', 'Saraswathipuram', 'Siddhartha Layout',
    'Vijayanagar', 'Vontikoppal',
  ],
  Mangaluru: [
    'Balmatta', 'Bejai', 'Bendoor', 'Derebail', 'Hampankatta', 'Kadri', 'Kankanady', 'Kodialbail',
    'Kottara', 'Lalbagh', 'Panambur', 'Pandeshwar', 'Surathkal', 'Urwa',
  ],
  'Hubballi-Dharwad': [
    'Deshpande Nagar', 'Dharwad', 'Durgadbail', 'Gokul Road', 'Keshwapur', 'Malmaddi', 'Navanagar',
    'Old Hubli', 'Rayapur', 'Saptapur', 'Unkal', 'Vidyagiri', 'Vidyanagar',
  ],
  Belagavi: [
    'Angol', 'Camp', 'Fort Road', 'Hanuman Nagar', 'Hindwadi', 'Khade Bazar', 'Khanapur Road',
    'Mahantesh Nagar', 'Ramteerth Nagar', 'Sadashiv Nagar', 'Shahapur', 'Tilakwadi', 'Vadgaon',
  ],
  Kalaburagi: [
    'Aland Road', 'Brahmapur', 'Gazipur', 'Humnabad Road', 'Jewargi Road', 'Kothari Bhavan',
    'MB Nagar', 'Ram Mandir', 'Sedam Road', 'Shahabazar', 'Station Area', 'Super Market',
    'Vidya Nagar',
  ],
  Thiruvananthapuram: [
    'East Fort', 'Kazhakkoottam', 'Kesavadasapuram', 'Kovalam', 'Kowdiar', 'Palayam', 'Pattom',
    'Sasthamangalam', 'Shanghumugham', 'Statue', 'Technopark', 'Thampanoor', 'Ulloor', 'Vanchiyoor',
    'Vazhuthacaud', 'Vellayambalam',
  ],
  Kozhikode: [
    'Beach Road', 'Chalappuram', 'Eranhipalam', 'Feroke', 'Kallai', 'Mananchira', 'Mavoor Road',
    'Medical College', 'Meenchanda', 'Nadakkavu', 'Palayam', 'SM Street', 'Thondayad', 'West Hill',
  ],
  Thrissur: [
    'Ayyanthole', 'Chembukkavu', 'East Fort', 'Kokkalai', 'Kuriachira', 'Mannuthy', 'Ollur',
    'Patturaikkal', 'Poonkunnam', 'Punkunnam', 'Swaraj Round', 'Viyyur', 'West Fort',
  ],
  Kollam: [
    'Asramam', 'Chinnakada', 'Kadappakada', 'Karbala', 'Kavanad', 'Kollam Beach', 'Kottiyam',
    'Pallimukku', 'Polayathodu', 'Ramankulangara', 'Thangassery', 'Thirumullavaram', 'Uliyakovil',
  ],
  Kannur: [
    'Azhikode', 'Burnassery', 'Chovva', 'Fort Road', 'Kakkad', 'Pallikkunnu', 'Pallikulam',
    'Payyambalam', 'Puthiyatheru', 'Talap', 'Thalassery', 'Thana', 'Thavakkara',
  ],
  Malappuram: [
    'Down Hill', 'Kondotty', 'Kottakkal', 'Kottappadi', 'Kunnummal', 'Manjeri', 'Melmuri',
    'Munduparamba', 'Panakkad', 'Perinthalmanna', 'Tirur', 'Up Hill', 'Valanchery',
  ],
  Bhopal: [
    'Arera Colony', 'Ayodhya Bypass', 'Bairagarh', 'Govindpura', 'Habibganj', 'Hoshangabad Road',
    'Kolar Road', 'Lalghati', 'Misrod', 'MP Nagar', 'New Market', 'Old Bhopal', 'Shahpura',
    'Shyamla Hills', 'TT Nagar',
  ],
  Gwalior: [
    'City Centre', 'DD Nagar', 'Gola Ka Mandir', 'Govindpuri', 'Hazira', 'Jhansi Road', 'Kampoo',
    'Lashkar', 'Maharaj Bada', 'Morar', 'Padav', 'Phool Bagh', 'Thatipur',
  ],
  Jabalpur: [
    'Adhartal', 'Bhedaghat', 'Civil Lines', 'Garha', 'Gol Bazaar', 'Gorakhpur', 'Gwarighat',
    'Madan Mahal', 'Napier Town', 'Ranjhi', 'Sadar', 'Vijay Nagar', 'Wright Town',
  ],
  Ujjain: [
    'Agar Road', 'Bhairavgarh', 'Dewas Gate', 'Freeganj', 'Indore Road', 'Kothi Road', 'Kshirsagar',
    'Madhav Nagar', 'Mahakal', 'Mahananda Nagar', 'Nanakheda', 'Ram Ghat', 'Tower Chowk',
  ],
  Nashik: [
    'Canada Corner', 'CIDCO', 'College Road', 'Deolali Camp', 'Gangapur', 'Gangapur Road',
    'Govind Nagar', 'Indira Nagar', 'Mumbai Naka', 'Nashik Road', 'Old Nashik', 'Panchavati',
    'Pathardi Phata', 'Satpur',
  ],
  'Chhatrapati Sambhajinagar': [
    'Aurangpura', 'Beed Bypass', 'Begumpura', 'Cidco', 'Garkheda', 'Gulmandi', 'Harsul',
    'Jalna Road', 'Kranti Chowk', 'Osmanpura', 'Padegaon', 'Samarth Nagar', 'Satara Parisar',
    'Waluj',
  ],
  Solapur: [
    'Akkalkot Road', 'Ashok Chowk', 'Bhavani Peth', 'Hotgi Road', 'Jule Solapur', 'Juna Pune Naka',
    'Kumbhari Road', 'Mangalwar Peth', 'Murarji Peth', 'Navi Peth', 'Railway Lines', 'Saat Rasta',
    'Vijapur Road',
  ],
  Kolhapur: [
    'Kadamwadi', 'Kasaba Bawda', 'Laxmipuri', 'Mahadwar Road', 'Nagala Park', 'Rajarampuri',
    'Rankala', 'Ruikar Colony', 'Sane Guruji Vasahat', 'Shahupuri', 'Shivaji Peth', 'Tarabai Park',
    'Ujalaiwadi',
  ],
  Amravati: [
    'Badnera', 'Camp', 'Dastur Nagar', 'Gadge Nagar', 'Itwara Bazar', 'Jaistambh Chowk',
    'Kathora Road', 'Panchavati', 'Rajapeth', 'Rajkamal Chowk', 'Sai Nagar', 'Shegaon Naka',
    'VMV Road',
  ],
  Nanded: [
    'Chhatrapati Chowk', 'Cidco', 'Gurudwara Area', 'Itwara', 'Kautha', 'Malegaon Road',
    'Navamondha', 'Shivaji Nagar', 'Shrinagar', 'Taroda', 'Vasant Nagar', 'Vazirabad', 'Vishnupuri',
  ],
  Sangli: [
    'Ganpati Peth', 'Gaonbhag', 'Kupwad', 'Madhavnagar', 'Market Yard', 'Miraj', 'Patel Chowk',
    'Rajwada Chowk', 'Sangli Miraj Road', 'Shamrao Nagar', 'Vijaynagar', 'Vishrambag',
    'Wanlesswadi',
  ],
  Malegaon: [
    'Camp', 'Chhavni', 'Daregaon', 'Islampura', 'Kalwan Road', 'Kidwai Road', 'Mosam Pool',
    'Nampur Road', 'Old Agra Road', 'Ramsetu', 'Sangameshwar', 'Satana Naka', 'Soygaon',
  ],
  Cuttack: [
    'Badambadi', 'Bidanasi', 'Buxi Bazaar', 'Cantonment Road', 'CDA', 'Chandni Chowk',
    'College Square', 'Jobra', 'Link Road', 'Mangalabag', 'Nayabazar', 'Ranihat', 'Tulsipur',
  ],
  Rourkela: [
    'Basanti Colony', 'Bisra Road', 'Chhend Colony', 'Civil Township', 'Fertilizer Township',
    'Koel Nagar', 'Old Rourkela', 'Panposh', 'Sector 1', 'Sector 19', 'Sector 2', 'Udit Nagar',
    'Uditnagar Market',
  ],
  Puducherry: [
    'Ariyankuppam', 'Auroville', 'Ellaipillaichavady', 'Heritage Town', 'Kalapet', 'Kurusukuppam',
    'Lawspet', 'Mission Street', 'Mudaliarpet', 'Muthialpet', 'Nellithope', 'Reddiarpalayam',
    'Saram', 'White Town',
  ],
  Ludhiana: [
    'BRS Nagar', 'Chaura Bazaar', 'Civil Lines', 'Dugri', 'Feroze Gandhi Market', 'Ferozepur Road',
    'Focal Point', 'Ghumar Mandi', 'Haibowal', 'Model Town', 'Pakhowal Road', 'Rajguru Nagar',
    'Sarabha Nagar', 'Shastri Nagar',
  ],
  Amritsar: [
    'Batala Road', 'Chheharta', 'Golden Temple', 'Green Avenue', 'GT Road', 'Hall Bazaar',
    'Kashmir Avenue', 'Katra Jaimal Singh', 'Lawrence Road', 'Majitha Road', 'Mall Road',
    'Putlighar', 'Rani Ka Bagh', 'Ranjit Avenue',
  ],
  Jalandhar: [
    'Adarsh Nagar', 'Basti Sheikh', 'BMC Chowk', 'Cantonment', 'Civil Lines', 'Defence Colony',
    'Guru Teg Bahadur Nagar', 'Jyoti Chowk', 'Maqsudan', 'Model Town', 'Nakodar Road', 'Rama Mandi',
    'Urban Estate',
  ],
  Jodhpur: [
    'Basni', 'Brahmpuri', 'Chopasni Housing Board', 'Clock Tower', 'Kamla Nehru Nagar', 'Mandore',
    'Pal Road', 'Paota', 'Ratanada', 'Residency Road', 'Sardarpura', 'Shastri Nagar', 'Sojati Gate',
  ],
  Kota: [
    'Chawani', 'Dadabari', 'Gumanpura', 'Indra Vihar', 'Kishore Sagar', 'Kunhari', 'Landmark City',
    'Mahaveer Nagar', 'Nayapura', 'Rajeev Gandhi Nagar', 'Rampura', 'Talwandi', 'Vigyan Nagar',
  ],
  Bikaner: [
    'Bhinasar', 'Bichhwal', 'Gangashahar', 'Jai Narayan Vyas Colony', 'Junagarh', 'Karni Nagar',
    'Kote Gate', 'Lalgarh', 'Murlidhar Vyas Colony', 'Pawanpuri', 'Rani Bazar', 'Sadul Ganj',
    'Station Road',
  ],
  Ajmer: [
    'Adarsh Nagar', 'Ana Sagar', 'Christian Ganj', 'Civil Lines', 'Dargah Bazaar', 'Kutchery Road',
    'Madar', 'Naya Bazaar', 'Panchsheel Nagar', 'Pushkar', 'Pushkar Road', 'Ramganj',
    'Vaishali Nagar',
  ],
  Madurai: [
    'Anna Nagar', 'Arapalayam', 'Bypass Road', 'Goripalayam', 'KK Nagar', 'Mattuthavani',
    'Meenakshi Temple', 'Palanganatham', 'Simmakkal', 'SS Colony', 'Tallakulam', 'Teppakulam',
    'Thiruparankundram', 'Vilangudi',
  ],
  Tiruchirappalli: [
    'Ariyamangalam', 'Cantonment', 'Chathiram', 'KK Nagar', 'Palakkarai', 'Panjapur', 'Puthur',
    'Rock Fort', 'Srinivasa Nagar', 'Srirangam', 'Thennur', 'Thillai Nagar', 'Tiruverumbur',
    'Woraiyur',
  ],
  Salem: [
    'Alagapuram', 'Ammapet', 'Fairlands', 'Four Roads', 'Gugai', 'Hasthampatti', 'Kondalampatti',
    'New Bus Stand', 'Old Bus Stand', 'Shevapet', 'Steel Plant', 'Suramangalam', 'Yercaud Road',
  ],
  Tiruppur: [
    'Anupparpalayam', 'Avinashi Road', 'College Road', 'Kangeyam Road', 'Kumar Nagar',
    'Kumaran Road', 'Nallur', 'Old Bus Stand', 'Palladam Road', 'Rayapuram', 'Tharapuram Road',
    'Veerapandi', 'Velampalayam',
  ],
  Erode: [
    'Brough Road', 'Chennimalai Road', 'Kalingarayan', 'Karungalpalayam', 'Moolapalayam',
    'Nasiyanur Road', 'Old Bus Stand', 'Periyar Nagar', 'Perundurai Road', 'Solar', 'Surampatti',
    'Thindal', 'Veerappanchatram',
  ],
  Warangal: [
    'Balasamudram', 'Fort Warangal', 'Hanamkonda', 'Hunter Road', 'Kazipet', 'Kishanpura',
    'Matwada', 'Mulugu Road', 'Naimnagar', 'Nakkalagutta', 'Shiva Nagar', 'Station Road',
    'Subedari',
  ],
  Dehradun: [
    'Ballupur', 'Clement Town', 'Clock Tower', 'Dalanwala', 'ISBT', 'Jakhan', 'Mussoorie Diversion',
    'Paltan Bazaar', 'Prem Nagar', 'Race Course', 'Raipur', 'Rajpur Road', 'Sahastradhara Road',
    'Vasant Vihar',
  ],
  Siliguri: [
    'Ashram Para', 'Bagdogra', 'Bhaktinagar', 'Bidhan Market', 'Champasari', 'Hakimpara',
    'Hill Cart Road', 'Mahananda Para', 'Matigara', 'Pradhan Nagar', 'Salugara', 'Sevoke Road',
    'Siliguri Junction',
  ],
  Asansol: [
    'Apcar Garden', 'Burnpur', 'Court More', 'GT Road', 'Hutton Road', 'Kalla', 'Kanyapur', 'Kulti',
    'Murgasol', 'Rambandh', 'Raniganj', 'Sen Raleigh Road', 'Ushagram',
  ],
  Durgapur: [
    'A Zone', 'B Zone', 'Barrage', 'Benachity', 'Bidhannagar', 'City Centre', 'Durgapur Station',
    'Fuljhore', 'Kamalpur', 'Muchipara', 'Nachan Road', 'Sagarbhanga', 'Steel Township',
  ],
  Kanpur: [
    'Arya Nagar', 'Azad Nagar', 'Barra', 'Civil Lines', 'Govind Nagar', 'Harsh Nagar', 'Kakadeo',
    'Kalyanpur', 'Kidwai Nagar', 'Mall Road', 'Parade', 'Shyam Nagar', 'Swaroop Nagar',
    'Tilak Nagar',
  ],
  Agra: [
    'Belanganj', 'Civil Lines', 'Dayal Bagh', 'Fatehabad Road', 'Kamla Nagar', 'Khandari',
    'Kinari Bazaar', 'Raja Ki Mandi', 'Sadar Bazaar', 'Sanjay Place', 'Shahganj', 'Sikandra',
    'Taj Ganj', 'Trans Yamuna',
  ],
  Varanasi: [
    'Assi', 'Bhelupur', 'Cantonment', 'Chowk', 'Dashashwamedh', 'Godowlia', 'Lahurabir', 'Lanka',
    'Mahmoorganj', 'Maldahiya', 'Pandeypur', 'Sarnath', 'Shivpur', 'Sigra',
  ],
  Prayagraj: [
    'Allahpur', 'Chowk', 'Civil Lines', 'Daraganj', 'George Town', 'Jhunsi', 'Kareli', 'Katra',
    'Mumfordganj', 'Naini', 'Rajapur', 'Sangam', 'Tagore Town', 'Teliyarganj',
  ],
  Meerut: [
    'Abu Lane', 'Begum Bridge', 'Brahmpuri', 'Civil Lines', 'Delhi Road', 'Ganga Nagar',
    'Garh Road', 'Jagriti Vihar', 'Kanker Khera', 'Modipuram', 'Pallavpuram', 'Sadar Bazaar',
    'Shastri Nagar',
  ],
  Bareilly: [
    'Cantonment', 'Civil Lines', 'DD Puram', 'Izzatnagar', 'Kohadapeer', 'Kutubkhana', 'Model Town',
    'Pilibhit Bypass', 'Prem Nagar', 'Rajendra Nagar', 'Rampur Garden', 'Shyamganj',
    'Subhash Nagar',
  ],
  Aligarh: [
    'Achal Talab', 'Centre Point', 'Civil Lines', 'Dodhpur', 'Jamalpur', 'Marris Road',
    'Medical Road', 'Quarsi', 'Railway Road', 'Ramghat Road', 'Sasni Gate', 'Surendra Nagar',
    'Swarn Jayanti Nagar',
  ],
  Moradabad: [
    'Buddhi Vihar', 'Civil Lines', 'Delhi Road', 'Gandhi Nagar', 'Kanth Road', 'Katghar',
    'Lajpat Nagar', 'Majhola', 'Mandi Chowk', 'Pakbara', 'Peetal Basti', 'Prince Road',
    'Ram Ganga Vihar',
  ],
  Gorakhpur: [
    'Asuran', 'Bank Road', 'Betiahata', 'Civil Lines', 'Golghar', 'Humayunpur',
    'Medical College Road', 'Mohaddipur', 'Nakha', 'Rapti Nagar', 'Rustampur', 'Shahpur',
    'Taramandal',
  ],
  Saharanpur: [
    'Ambala Road', 'Behat Road', 'Chakrata Road', 'Court Road', 'Delhi Road', 'Ghanta Ghar',
    'Kishanpura', 'Mission Compound', 'Nehru Market', 'Paper Mill Road', 'Pathanpura', 'Prem Nagar',
    'Railway Road',
  ],
  Jhansi: [
    'Civil Lines', 'Elite Chowk', 'Gumnawara', 'Gwalior Road', 'Jhansi Fort', 'Kachiyana',
    'Manik Chowk', 'Medical College', 'Nandanpura', 'Prem Nagar', 'Sadar Bazaar', 'Shivaji Nagar',
    'Sipri Bazaar',
  ],
  Firozabad: [
    'Agra Gate', 'Gandhi Nagar', 'Jalesar Road', 'Kotla Road', 'Naya Rasulpur', 'Raja Ka Tal',
    'Ramgarh', 'Sadar Bazaar', 'Shikohabad Road', 'Station Road', 'Suhag Nagar', 'Teen Batti',
    'Tundla Road',
  ],
};

export const areasIn = (city: string): string[] => AREAS[city] ?? [];

/**
 * A name in a loose form, so that spellings people actually type still match: "Baramunda" and
 * "Barmunda", "Koramangla" and "Koramangala", "Vileparle" and "Vile Parle".
 */
export function loose(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(sh|ch|th|dh|bh|kh|ph|gh|jh)/g, (m) => m[0])
    .replace(/w/g, 'v').replace(/z/g, 'j').replace(/y/g, 'i')
    .replace(/ee|ii/g, 'i').replace(/oo|uu/g, 'u').replace(/aa/g, 'a')
    .replace(/(.)\1+/g, '$1');
}

/** Edits between two strings (Levenshtein), for "did you mean". */
function edits(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** The areas whose name contains what was typed (in the loose form too). Everything when nothing is. */
export function matchAreas(city: string, typed: string): string[] {
  const q = typed.trim().toLowerCase();
  const l = loose(q);
  const plain = areasIn(city).filter((a) => !q || a.toLowerCase().includes(q));
  // Then the ones that match only in the loose form ("band" also finds Bhandup).
  return l.length >= 3 ? [...plain, ...areasIn(city).filter((a) => !plain.includes(a) && loose(a).includes(l))] : plain;
}

/**
 * When nothing contains what was typed: the names closest to it in spelling, best first, so that a
 * typo or another spelling still finds the place. Only names a few edits away, never a random one.
 */
export function closeAreas(city: string, typed: string, n = 5): string[] {
  const l = loose(typed);
  if (l.length < 3) return [];
  return areasIn(city)
    .map((a) => {
      const la = loose(a);
      // Compare with the whole name and with its start, so "barmun" still finds "Baramunda".
      const d = Math.min(edits(l, la), edits(l, la.slice(0, l.length)) + 1);
      return { a, d };
    })
    .filter((x) => x.d <= Math.max(1, Math.floor(l.length / 3)))
    .sort((x, y) => x.d - y.d || x.a.localeCompare(y.a))
    .slice(0, n)
    .map((x) => x.a);
}
