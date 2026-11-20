/**
 * The photo function draws every photo again from its pixels (supabase/functions/photo/reencode.ts,
 * D098), with the same decoder (mozjpeg, WebAssembly, carried as hex) and encoder (jpeg-js) the
 * Edge Function uses. Plain Node.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import decodeJpeg, { init as initDecoder } from '@jsquash/jpeg/decode.js';
import jpegJs from 'jpeg-js';
import { stripJpeg } from '../../supabase/functions/photo/jpeg';
import { MOZJPEG_DEC_HEX, MOZJPEG_DEC_SHA256, MOZJPEG_DEC_VERSION } from '../../supabase/functions/photo/mozjpeg_dec';
import { LONG_SIDE_MAX, jpegSize, makeCodec, reencode, type Codec } from '../../supabase/functions/photo/reencode';

const codec = makeCodec({ init: initDecoder, decode: decodeJpeg }, MOZJPEG_DEC_HEX, jpegJs);
const fixture = (n: string) => new Uint8Array(readFileSync(join(__dirname, 'fixtures', n)));
const has = (bytes: Uint8Array, text: string) => Buffer.from(bytes).includes(Buffer.from(text, 'latin1'));
const scan = (bytes: Uint8Array) => {
  const b = Buffer.from(bytes);
  return b.subarray(b.indexOf(Buffer.from([0xff, 0xda])), b.lastIndexOf(Buffer.from([0xff, 0xd9])) + 2);
};

/** A quantisation table nobody uses, filled with text: valid JPEG, kept by the stripper. */
function withHiddenTable(src: Uint8Array, text: string): Uint8Array {
  const table = new Uint8Array(64).fill(1);
  table.set(Buffer.from(text, 'latin1'));
  const segment = new Uint8Array([0xff, 0xdb, 0x00, 67, 0x03, ...table]);
  return new Uint8Array([...src.subarray(0, 20), ...segment, ...src.subarray(20)]);
}

for (const name of ['exif_gps_baseline.jpg', 'exif_gps_progressive.jpg']) {
  test(`${name}: drawn again, the same size, nothing of the old file but the picture`, async () => {
    const src = stripJpeg(fixture(name))!;
    const out = await reencode(src, codec);
    assert.ok(out);
    assert.deepEqual(jpegSize(out), jpegSize(src), 'the same size');
    assert.deepEqual([...out.subarray(0, 4)], [0xff, 0xd8, 0xff, 0xe0], 'a plain JFIF header');
    assert.deepEqual([...out.subarray(-2)], [0xff, 0xd9]);
    assert.ok(!scan(out).equals(scan(src)), 'new picture data, not a copy');
    assert.equal(out.filter((b, i) => b === 0xff && out[i + 1] === 0xda).length, 1, 'one baseline scan');
    const back = await codec.decode(out);
    assert.equal(back.width * back.height * 4, back.data.length, 'and it decodes');
  });
}

test('data hidden inside the picture data survives stripping, but not drawing again', async () => {
  const src = withHiddenTable(stripJpeg(fixture('exif_gps_baseline.jpg'))!, '@hidden_handle');
  assert.ok(has(stripJpeg(src)!, '@hidden_handle'), 'stripping alone keeps it: it is not metadata');
  const out = await reencode(stripJpeg(src)!, codec);
  assert.ok(out, 'the photo itself is fine');
  assert.ok(!has(out, '@hidden_handle'), 'drawn again, it is gone');
});

test('a photo at the size the app sends', async () => {
  const width = 1280;
  const height = 960;
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([(i % width) / 5, i / width / 4, ((i % width) + i / width) / 9, 255], i * 4);
  const src = new Uint8Array(jpegJs.encode({ data, width, height }, 82).data);
  const started = performance.now();
  const out = await reencode(src, codec);
  assert.ok(out);
  assert.deepEqual(jpegSize(out), { width, height });
  // Information only: the Edge runtime allows 2 s of CPU a request. The live test runs it there.
  console.log(`1280 x 960 drawn again in ${Math.round(performance.now() - started)} ms`);
});

test('refused: too large, or not a picture, without decoding anything it should not', async () => {
  let decoded = 0;
  const spy: Codec = { decode: async (b) => (decoded++, codec.decode(b)), encode: codec.encode };
  const src = stripJpeg(fixture('exif_gps_baseline.jpg'))!;
  const sof = Buffer.from(src).indexOf(Buffer.from([0xff, 0xc0]));
  const huge = src.slice();
  huge.set([0xff, 0xff, 0xff, 0xff], sof + 5); // claims 65535 x 65535
  assert.equal(await reencode(huge, spy), null, 'a header that claims a huge picture');
  const wide = src.slice();
  wide.set([(LONG_SIDE_MAX + 1) >> 8, (LONG_SIDE_MAX + 1) & 0xff], sof + 7);
  assert.equal(await reencode(wide, spy), null, 'larger than the app ever sends');
  assert.equal(decoded, 0, 'neither was decoded');

  const broken: Codec = { decode: async () => { throw new Error('bad'); }, encode: codec.encode };
  assert.equal(await reencode(src, broken), null, 'a picture that will not decode');
  const lying: Codec = { decode: async () => ({ data: new Uint8Array(16), width: 2, height: 2 }), encode: codec.encode };
  assert.equal(await reencode(src, lying), null, 'pixels that do not match the header');
  assert.equal(jpegSize(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02])), null, 'a scan before any frame');
});

test('the decoder carried in the function is the one in package.json, and the function imports the same versions', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')).devDependencies;
  const wasm = readFileSync('node_modules/@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm');
  const carried = Buffer.from(MOZJPEG_DEC_HEX, 'hex');
  assert.equal(MOZJPEG_DEC_VERSION, pkg['@jsquash/jpeg'], 'run node scripts/vendor-jpeg-decoder.mjs');
  assert.equal(createHash('sha256').update(carried).digest('hex'), MOZJPEG_DEC_SHA256);
  assert.ok(carried.equals(wasm), 'run node scripts/vendor-jpeg-decoder.mjs');
  const fn = readFileSync('supabase/functions/photo/index.ts', 'utf8');
  assert.ok(fn.includes(`npm:@jsquash/jpeg@${pkg['@jsquash/jpeg']}/`), 'the function imports the same @jsquash/jpeg');
  assert.ok(fn.includes(`npm:jpeg-js@${pkg['jpeg-js']}'`), 'the function imports the same jpeg-js');
});
