/**
 * Distance on a card, from the two people's areas (src/domain/nearby.ts areaKm): whole kilometres
 * from rough area centres, and nothing at all when it would be a guess. Plain Node.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AREA_CENTRES } from '../../src/domain/areaCentres';
import { areaKm, cardKm } from '../../src/domain/nearby';

test('two areas of one city: whole kilometres, at least one', () => {
  const d = areaKm({ city: 'Mumbai', area: 'Bandra West' }, { city: 'Mumbai', area: 'Powai' });
  assert.ok(d !== null && Number.isInteger(d) && d >= 8 && d <= 16, `Bandra West to Powai is about 10 km, got ${d}`);
  assert.equal(areaKm({ city: 'Mumbai', area: 'Bandra West' }, { city: 'Mumbai', area: 'Khar' }), 1, 'neighbours read 1 km, never 0');
  assert.equal(areaKm({ city: 'Mumbai', area: 'Powai' }, { city: 'Mumbai', area: 'Bandra West' }), d, 'the same both ways');
});

test('no distance where it would be a guess', () => {
  assert.equal(areaKm({ city: 'Mumbai', area: 'Juhu' }, { city: 'Mumbai', area: 'Juhu' }), null, 'same area');
  assert.equal(areaKm({ city: 'Mumbai', area: 'Juhu' }, { city: 'Pune', area: 'Baner' }), null, 'another city');
  assert.equal(areaKm({ city: 'Mumbai', area: 'Juhu' }, { city: 'Mumbai', area: 'Our Lane Near The Temple' }), null, 'an area of their own has no centre');
  assert.equal(areaKm({ city: null, area: 'Juhu' }, { city: 'Mumbai', area: 'Bandra West' }), null, 'no city yet');
});

test('the card falls back to what the backend gave only when the areas cannot say', () => {
  assert.equal(cardKm({ city: 'Mumbai', area: 'Juhu' }, { city: 'Mumbai', area: 'Juhu', distanceKm: 0 }), null);
  assert.equal(cardKm({ city: 'Mumbai', area: 'Juhu' }, { city: 'Mumbai', area: 'Made Up', distanceKm: 3.2 }), 3.2);
});

test('within any one city no two areas read more than 100 km apart (Goa, a whole state, is the widest at about 85; a centre typed wrong would not be)', () => {
  for (const [city, areas] of Object.entries(AREA_CENTRES)) {
    const names = Object.keys(areas);
    for (const a of names) for (const b of names) {
      const d = areaKm({ city, area: a }, { city, area: b });
      assert.ok(d === null || d <= 100, `${city}: ${a} to ${b} reads ${d} km`);
    }
  }
});
