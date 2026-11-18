/**
 * Areas a person picks from (docs/build-plan.md, WP1 and WP9): typed areas were a way to slip a
 * contact onto a card, and a city with a list reads as local. The same rows are the `areas` table
 * (supabase/migrations/20261118000003_picked_fields.sql); tests/unit/areas.test.ts keeps the two in
 * step. A city gets its list when it opens. The names match the venue catalogue's areas, so the
 * places nearest to someone come first in an ask.
 */
export const AREAS: Record<string, string[]> = {
  Mumbai: [
    'Andheri East', 'Andheri West', 'Bandra East', 'Bandra West', 'BKC', 'Borivali', 'Byculla', 'Chembur',
    'Churchgate', 'Colaba', 'Dadar', 'Dahisar', 'Fort', 'Ghatkopar', 'Goregaon', 'Grant Road', 'Juhu',
    'Kalina', 'Kandivali', 'Khar', 'Kurla', 'Lower Parel', 'Mahim', 'Malad', 'Marine Lines', 'Matunga',
    'Mira Road', 'Mulund', 'Navi Mumbai', 'Parel', 'Powai', 'Prabhadevi', 'Santacruz', 'Sion', 'Tardeo',
    'Thane', 'Versova', 'Vile Parle', 'Wadala', 'Worli',
  ],
  'Delhi NCR': [
    'Chanakyapuri', 'Chandni Chowk', 'Civil Lines', 'Connaught Place', 'Defence Colony', 'Dwarka',
    'Faridabad', 'Ghaziabad', 'Greater Kailash', 'Greater Noida', 'Gurugram', 'Hauz Khas', 'INA',
    'Janakpuri', 'Kalkaji', 'Kamla Nagar', 'Karol Bagh', 'Kartavya Path', 'Khan Market',
    'Lajpat Nagar', 'Laxmi Nagar', 'Lodhi Road', 'Malviya Nagar', 'Mayur Vihar', 'Mehrauli',
    'Nehru Place', 'Nizamuddin', 'Noida', 'Pitampura', 'Preet Vihar', 'Punjabi Bagh', 'Rajouri Garden',
    'Rohini', 'Saket', 'Shahpur Jat', 'Vasant Kunj',
  ],
  'Bengaluru': [
    'Banashankari', 'Basavanagudi', 'Bellandur', 'BTM Layout', 'Electronic City', 'Frazer Town',
    'Hebbal', 'HSR Layout', 'Indiranagar', 'Jayanagar', 'JP Nagar', 'Koramangala', 'Malleshwaram',
    'Marathahalli', 'MG Road', 'Rajajinagar', 'Sadashivanagar', 'Sarjapur Road', 'Shivajinagar',
    'Ulsoor', 'Whitefield', 'Yelahanka',
  ],
  'Hyderabad': [
    'Abids', 'Ameerpet', 'Banjara Hills', 'Begumpet', 'Charminar', 'Dilsukhnagar', 'Gachibowli',
    'Golconda', 'HITEC City', 'Himayatnagar', 'Jubilee Hills', 'Kondapur', 'Kukatpally', 'Madhapur',
    'Manikonda', 'Mehdipatnam', 'Miyapur', 'Secunderabad', 'Somajiguda', 'Tank Bund', 'Tarnaka',
    'Uppal',
  ],
  'Chennai': [
    'Adyar', 'Alwarpet', 'Anna Nagar', 'Besant Nagar', 'Chromepet', 'Egmore', 'Guindy', 'Kilpauk',
    'Kodambakkam', 'Mylapore', 'Nungambakkam', 'OMR', 'Perungudi', 'Porur', 'Royapettah', 'Saidapet',
    'T Nagar', 'Tambaram', 'Teynampet', 'Thiruvanmiyur', 'Triplicane', 'Vadapalani', 'Velachery',
  ],
  'Kolkata': [
    'Alipore', 'Ballygunge', 'BBD Bagh', 'Behala', 'Bhowanipore', 'College Street', 'Dhakuria',
    'Dum Dum', 'Esplanade', 'Garia', 'Gariahat', 'Howrah', 'Jadavpur', 'Kasba', 'Lake Gardens',
    'Maidan', 'New Town', 'Park Street', 'Salt Lake', 'Shyambazar', 'Tollygunge',
  ],
  'Pune': [
    'Aundh', 'Baner', 'Bavdhan', 'Camp', 'Chinchwad', 'Deccan', 'Erandwane', 'Hadapsar', 'Hinjewadi',
    'Kalyani Nagar', 'Kasba Peth', 'Kharadi', 'Kondhwa', 'Koregaon Park', 'Kothrud', 'Magarpatta',
    'Model Colony', 'Pimple Saudagar', 'Pimpri', 'Sadashiv Peth', 'Shivajinagar', 'Sinhagad Road',
    'Viman Nagar', 'Wakad', 'Wanowrie', 'Yerawada',
  ],
  'Ahmedabad': [
    'Ambawadi', 'Bodakdev', 'Bopal', 'Chandkheda', 'Ellisbridge', 'Gandhinagar', 'Gota', 'Gurukul',
    'Maninagar', 'Memnagar', 'Naranpura', 'Navrangpura', 'Old City', 'Paldi', 'Prahlad Nagar',
    'Sabarmati', 'Satellite', 'SG Highway', 'Thaltej', 'Vastrapur', 'Vejalpur',
  ],
  'Bhubaneswar': [
    'Acharya Vihar', 'Bapuji Nagar', 'Chandrasekharpur', 'Infocity', 'Jaydev Vihar', 'Khandagiri',
    'Kharavela Nagar', 'Laxmisagar', 'Mancheswar', 'Nayapalli', 'Old Town', 'Patia', 'Pokhariput',
    'Rasulgarh', 'Saheed Nagar', 'Satya Nagar', 'Sundarpada', 'Vani Vihar',
  ],
  'Chandigarh': [
    'Industrial Area', 'Kharar', 'Manimajra', 'Mohali', 'New Chandigarh', 'Panchkula', 'Sector 1',
    'Sector 7', 'Sector 8', 'Sector 9', 'Sector 10', 'Sector 11', 'Sector 15', 'Sector 16',
    'Sector 17', 'Sector 22', 'Sector 26', 'Sector 34', 'Sector 35', 'Sector 43', 'Zirakpur',
  ],
  'Coimbatore': [
    'Avinashi Road', 'Gandhipuram', 'Ganapathy', 'Kalapatti', 'Kuniyamuthur', 'Peelamedu', 'Podanur',
    'Race Course', 'Ramanathapuram', 'RS Puram', 'Saibaba Colony', 'Saravanampatti', 'Singanallur',
    'Sowripalayam', 'Thudiyalur', 'Town Hall', 'Ukkadam', 'Vadavalli',
  ],
  'Goa': [
    'Anjuna', 'Assagao', 'Baga', 'Benaulim', 'Calangute', 'Candolim', 'Colva', 'Dona Paula', 'Mapusa',
    'Margao', 'Miramar', 'Old Goa', 'Palolem', 'Panaji', 'Ponda', 'Porvorim', 'Siolim',
    'Vasco da Gama',
  ],
  'Indore': [
    'AB Road', 'Annapurna', 'Bengali Square', 'Bhawarkua', 'Khajrana', 'Mahalaxmi Nagar', 'MG Road',
    'Navlakha', 'Nipania', 'Old Palasia', 'Palasia', 'Rajwada', 'Rau', 'Saket Nagar', 'Sapna Sangeeta',
    'Sarafa', 'Super Corridor', 'Vijay Nagar',
  ],
  'Jaipur': [
    'Amer', 'Bani Park', 'C Scheme', 'Civil Lines', 'Jagatpura', 'Jawahar Nagar', 'Malviya Nagar',
    'Mansarovar', 'MI Road', 'Old City', 'Raja Park', 'Sanganer', 'Sodala', 'Tonk Road',
    'Vaishali Nagar', 'Vidhyadhar Nagar',
  ],
  'Kochi': [
    'Aluva', 'Edappally', 'Ernakulam North', 'Ernakulam South', 'Fort Kochi', 'Kadavanthra',
    'Kakkanad', 'Kalamassery', 'Kaloor', 'Maradu', 'Mattancherry', 'MG Road', 'Palarivattom',
    'Panampilly Nagar', 'Thrippunithura', 'Vyttila',
  ],
  'Lucknow': [
    'Alambagh', 'Aliganj', 'Aminabad', 'Ashiyana', 'Charbagh', 'Chowk', 'Gomti Nagar',
    'Gomti Nagar Extension', 'Hazratganj', 'Indira Nagar', 'Jankipuram', 'Kaiserbagh', 'Kapoorthala',
    'Mahanagar', 'Rajajipuram', 'Sushant Golf City', 'Vikas Nagar',
  ],
  'Nagpur': [
    'Ambazari', 'Bajaj Nagar', 'Besa', 'Civil Lines', 'Dharampeth', 'Gandhibagh', 'Hingna', 'Itwari',
    'Laxmi Nagar', 'Mahal', 'Manish Nagar', 'Mankapur', 'Nandanvan', 'Pratap Nagar', 'Ramdaspeth',
    'Sadar', 'Shankar Nagar', 'Sitabuldi', 'Trimurti Nagar', 'Wardha Road',
  ],
  'Surat': [
    'Adajan', 'Althan', 'Athwa', 'Bhatar', 'Chowk Bazaar', 'Citylight', 'Dumas', 'Ghod Dod Road',
    'Katargam', 'Majura Gate', 'Nanpura', 'Pal', 'Parle Point', 'Piplod', 'Rander', 'Udhna',
    'Varachha', 'Vesu',
  ],
  'Vadodara': [
    'Akota', 'Alkapuri', 'Fatehgunj', 'Gorwa', 'Gotri', 'Harni', 'Karelibaug', 'Makarpura',
    'Manjalpur', 'Nizampura', 'Old City', 'Race Course', 'Sama', 'Sayajigunj', 'Subhanpura', 'Tarsali',
    'Vasna', 'Waghodia Road',
  ],
  'Visakhapatnam': [
    'Akkayyapalem', 'Asilmetta', 'Beach Road', 'Dwaraka Nagar', 'Gajuwaka', 'Jagadamba', 'Kailasagiri',
    'Lawsons Bay', 'Maddilapalem', 'Madhurawada', 'MVP Colony', 'Pendurthi', 'Rushikonda',
    'Seethammadhara', 'Siripuram', 'Yendada',
  ],
};

export const areasIn = (city: string): string[] => AREAS[city] ?? [];

/** The areas whose name contains what was typed, for the search box. Everything when nothing is. */
export function matchAreas(city: string, typed: string): string[] {
  const q = typed.trim().toLowerCase();
  return areasIn(city).filter((a) => !q || a.toLowerCase().includes(q));
}
