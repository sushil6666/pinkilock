/** Finding a city among all the open ones (D092): search, other names, states. Plain Node: `npm run test:unit`. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AREAS } from '../../src/domain/areas';
import { ALSO_IN, CITY_ALIASES, citiesByState, findCities } from '../../src/domain/citySearch';
import { CITIES, METROS, openCities } from '../../src/domain/countries';
import { nearestCity } from '../../src/domain/nearby';

test('every tier-2 (Y class) city is open, with a state', () => {
  const open = openCities().map((c) => c.name);
  for (const c of ['Agra', 'Guwahati', 'Patna', 'Srinagar', 'Puducherry', 'Dehradun', 'Siliguri', 'Hubballi-Dharwad', 'Chhatrapati Sambhajinagar', 'Thiruvananthapuram']) {
    assert.ok(open.includes(c), `${c} is not open`);
  }
  assert.ok(open.length >= 90, `only ${open.length} cities are open`);
  for (const c of CITIES) assert.ok(c.state.length > 1, `${c.name} has no state`);
  for (const m of METROS) assert.ok(open.includes(m), `${m} is a metro but not open`);
});

test('other names and spanned states point at open cities', () => {
  const open = new Set(openCities().map((c) => c.name));
  for (const [other, city] of Object.entries(CITY_ALIASES)) {
    assert.ok(open.has(city), `${other} points at ${city}, which is not open`);
    assert.ok(!open.has(other), `${other} is itself an open city`);
  }
  for (const city of Object.keys(ALSO_IN)) assert.ok(open.has(city), city);
});

test('the search finds a city by its name, an old name, a typo, its state or an area', () => {
  assert.equal(findCities('patn')[0].city, 'Patna');
  assert.deepEqual(findCities('bangalore')[0], { city: 'Bengaluru', via: 'Bangalore' });
  assert.deepEqual(findCities('gurgaon')[0], { city: 'Delhi NCR', via: 'Gurgaon' });
  assert.equal(findCities('trivandrum')[0].city, 'Thiruvananthapuram');
  assert.equal(findCities('tiruchirapalli')[0].city, 'Tiruchirappalli', 'one p short still finds it');
  const kerala = findCities('kerala', 20).map((h) => h.city);
  for (const c of ['Kochi', 'Kozhikode', 'Thiruvananthapuram', 'Thrissur', 'Kollam', 'Kannur', 'Malappuram']) assert.ok(kerala.includes(c), c);
  assert.deepEqual(findCities('noida')[0], { city: 'Delhi NCR', via: 'Noida', area: 'Noida' }, 'an area finds its city, and comes with it');
  assert.equal(findCities('mumbai')[0].city, 'Mumbai', 'the name comes before an area named after it');
  assert.deepEqual(findCities(''), []);
  assert.deepEqual(findCities('xyzzyq'), []);
});

test('the state list holds every open city, each under its state', () => {
  const states = citiesByState();
  const listed = new Set(states.flatMap((s) => s.cities.map((c) => c.name)));
  assert.deepEqual([...listed].sort(), openCities().map((c) => c.name).sort());
  assert.deepEqual(states.map((s) => s.state), [...states.map((s) => s.state)].sort((a, b) => a.localeCompare(b)), 'states A to Z');
  const up = states.find((s) => s.state === 'Uttar Pradesh')!.cities.map((c) => c.name);
  assert.ok(up.includes('Delhi NCR') && up.includes('Varanasi'), 'Delhi NCR is also under Uttar Pradesh');
});

test('my location finds the new cities too', () => {
  assert.equal(nearestCity({ lat: 25.612, lng: 85.14 }), 'Patna');
  assert.equal(nearestCity({ lat: 27.175, lng: 78.042 }), 'Agra');
  assert.equal(nearestCity({ lat: 34.07, lng: 74.81 }), 'Srinagar');
  assert.equal(nearestCity({ lat: 20.465, lng: 85.88 }), 'Cuttack', 'Cuttack, not Bhubaneswar next door');
  for (const [c, list] of Object.entries(AREAS)) assert.ok(list.length > 0, c);
});
