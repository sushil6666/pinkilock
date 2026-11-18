/**
 * The photo function's metadata stripper (supabase/functions/photo/jpeg.ts). The fixtures are real
 * JPEGs, baseline with restart markers and progressive, each carrying EXIF with a GPS position and
 * a phone maker, a comment, and text appended after the end of the image. Plain Node.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { stripJpeg } from '../../supabase/functions/photo/jpeg';

const fixture = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', n)));
const has = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));
const scan = (bytes: Uint8Array) => {
  const b = Buffer.from(bytes);
  return b.subarray(b.indexOf(Buffer.from([0xff, 0xda])), b.lastIndexOf(Buffer.from([0xff, 0xd9])) + 2);
};

for (const name of ['exif_gps_baseline.jpg', 'exif_gps_progressive.jpg']) {
  test(`${name}: the place, the phone, the comment and anything after the image are gone`, () => {
    const src = fixture(name);
    assert.ok(has(src, 'Exif') && has(src, 'PhoneMaker') && has(src, 'secret comment') && has(src, '@handle'), 'the fixture carries them');
    const out = stripJpeg(src);
    assert.ok(out);
    for (const t of ['Exif', 'PhoneMaker', 'secret comment', 'TRAILING', '@handle']) assert.ok(!has(out, t), `${t} is gone`);
    assert.deepEqual([...out.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0], 'a plain JFIF header in their place');
    assert.ok(has(out.subarray(0, 12), 'JFIF'));
    assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9], 'it ends with the end of the image');
    assert.ok(scan(out).equals(scan(src)), 'the picture data is untouched');
    assert.deepEqual(stripJpeg(out), out, 'stripping twice changes nothing');
  });
}

test('anything that is not a whole JPEG is refused', () => {
  const src = fixture('exif_gps_baseline.jpg');
  assert.equal(stripJpeg(new Uint8Array(Buffer.from('GIF89a........'))), null, 'another format');
  assert.equal(stripJpeg(new Uint8Array(Buffer.from('@my.handle written in a text file'))), null, 'text');
  assert.equal(stripJpeg(src.subarray(0, src.length / 2)), null, 'cut in half');
  assert.equal(stripJpeg(src.subarray(0, 300)), null, 'only the headers');
  assert.equal(stripJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null, 'no picture at all');
});
