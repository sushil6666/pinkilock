/**
 * Takes everything out of a JPEG but the picture (build plan WP7b): EXIF (place, phone, time),
 * XMP, ICC and other APPn segments, comments, and anything after the end of the image. A plain
 * JFIF header is put back in their place. Pure and dependency-free, so the `photo` Edge Function
 * (Deno) and tests/unit/jpeg.test.ts (Node) run the same code.
 *
 * Returns null for anything that is not a whole, well-formed JPEG.
 */
const JFIF = new Uint8Array([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);

/** APP0 to APP15 and COM: metadata, never needed to show the picture. */
const isMetadata = (m: number) => (m >= 0xe0 && m <= 0xef) || m === 0xfe;
/** Markers with no length after them. */
const standalone = (m: number) => m === 0x01 || (m >= 0xd0 && m <= 0xd7);

export function stripJpeg(src: Uint8Array): Uint8Array | null {
  if (src.length < 4 || src[0] !== 0xff || src[1] !== 0xd8) return null;
  const out: Uint8Array[] = [src.subarray(0, 2), JFIF];
  let i = 2;
  let sawScan = false;
  while (i < src.length) {
    if (src[i] !== 0xff) {
      if (!sawScan) return null;
      // Entropy-coded data after a scan header: copy up to the next real marker.
      const start = i;
      while (i < src.length && !(src[i] === 0xff && i + 1 < src.length && src[i + 1] !== 0x00 && !standalone(src[i + 1]))) i++;
      out.push(src.subarray(start, i));
      continue;
    }
    // Fill bytes: any number of 0xFF before a marker.
    let j = i;
    while (j < src.length && src[j] === 0xff) j++;
    if (j >= src.length) return null;
    const marker = src[j];
    if (marker === 0x00 || standalone(marker)) {
      if (!sawScan) return null;
      out.push(src.subarray(i, j + 1));
      i = j + 1;
      continue;
    }
    if (marker === 0xd9) {
      if (!sawScan) return null;
      out.push(new Uint8Array([0xff, 0xd9]));
      return concat(out);
    }
    if (marker === 0xd8) return null;
    if (j + 2 >= src.length) return null;
    const len = (src[j + 1] << 8) | src[j + 2];
    if (len < 2 || j + 1 + len > src.length) return null;
    if (!isMetadata(marker)) out.push(src.subarray(j - 1, j + 1 + len));
    if (marker === 0xda) sawScan = true;
    i = j + 1 + len;
  }
  return null; // no end-of-image marker
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
