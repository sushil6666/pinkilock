/**
 * Draws every photo again from its pixels (D098). Stripping (./jpeg.ts) removes the metadata
 * segments, but a changed app could still hide data inside the picture data itself (extra scans,
 * odd tables, bits in the coefficients). Decoding to pixels and encoding a new JPEG keeps only what
 * the eye sees: the stored file has our tables, our one baseline scan, our JFIF header, nothing else.
 *
 * Decoding is mozjpeg compiled to WebAssembly (fast, and hardened by years of fuzzing); encoding is
 * jpeg-js, plain JavaScript. The decoder is carried as hex (./mozjpeg_dec.ts) so nothing is read
 * from disk at run time. Both libraries and the decoder's bytes are passed in (this file imports
 * nothing), so the Edge Function (Deno, `npm:` imports) and tests/unit/reencode.test.ts (Node) run
 * this same code.
 *
 * Returns null for anything it cannot use: the function then answers PL107, as for any bad file.
 */

/** The app sends at most 1280 px on the long side (src/lib/photoPick.ts); a little room on top. */
export const LONG_SIDE_MAX = 1600;
export const QUALITY = 85;

export interface Pixels { data: Uint8Array | Uint8ClampedArray; width: number; height: number }
export interface Codec {
  decode(jpeg: Uint8Array): Promise<Pixels>;
  encode(pixels: Pixels, quality: number): Uint8Array;
}

/** SOF markers carry the size: C0 to CF, except DHT (C4), JPG (C8) and DAC (CC). */
const isFrame = (m: number) => m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc;

/** The size a JPEG says it has, read from its frame header before anything is decoded. */
export function jpegSize(src: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 3 < src.length && src[i] === 0xff) {
    const m = src[i + 1];
    if (m === 0xda || m === 0xd9) return null; // a scan before any frame header
    const len = (src[i + 2] << 8) | src[i + 3];
    if (isFrame(m)) {
      if (len < 7 || i + 8 >= src.length) return null;
      return { height: (src[i + 5] << 8) | src[i + 6], width: (src[i + 7] << 8) | src[i + 8] };
    }
    i += 2 + len;
  }
  return null;
}

/** A new JPEG drawn from the pixels of `src`, or null. `src` is the stripped file. */
export async function reencode(src: Uint8Array, codec: Codec): Promise<Uint8Array | null> {
  const size = jpegSize(src);
  // Checked before decoding: a header can claim 65535 x 65535 in a file of a few bytes.
  if (!size || size.width < 1 || size.height < 1 || Math.max(size.width, size.height) > LONG_SIDE_MAX) return null;
  try {
    const pixels = await codec.decode(src);
    if (pixels.width !== size.width || pixels.height !== size.height || pixels.data.length !== size.width * size.height * 4) return null;
    const out = new Uint8Array(codec.encode(pixels, QUALITY));
    return out[0] === 0xff && out[1] === 0xd8 && out[out.length - 2] === 0xff && out[out.length - 1] === 0xd9 ? out : null;
  } catch {
    return null;
  }
}

const fromHex = (hex: string) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
};

interface Decoder {
  init(module: WebAssembly.Module): Promise<unknown> | unknown;
  decode(jpeg: ArrayBuffer): Promise<{ data: Uint8ClampedArray; width: number; height: number }>;
}
interface Encoder {
  encode(img: { data: Uint8Array | Uint8ClampedArray; width: number; height: number }, quality: number): { data: Uint8Array };
}

/**
 * The codec, from @jsquash/jpeg's decoder (its WebAssembly given as hex, ./mozjpeg_dec.ts) and
 * jpeg-js's encoder. The decoder is compiled once, on the first photo.
 */
export function makeCodec(decoder: Decoder, wasmHex: string, encoder: Encoder): Codec {
  let ready: Promise<unknown> | null = null;
  return {
    async decode(jpeg) {
      // The decoder's glue makes ImageData objects; Deno and Node have no such class of their own.
      const g = globalThis as { ImageData?: unknown };
      g.ImageData ??= function ImageData(this: Pixels, data: Uint8ClampedArray, width: number, height: number) {
        Object.assign(this, { data, width, height });
      };
      ready ??= Promise.resolve()
        .then(() => decoder.init(new WebAssembly.Module(fromHex(wasmHex))))
        .catch((e) => { ready = null; throw e; });
      await ready;
      return decoder.decode(jpeg.slice().buffer);
    },
    encode: (pixels, quality) => encoder.encode(pixels, quality).data,
  };
}
