// Draws the toolbar icons as PNG files with no dependencies.
// Usage: node tools/make-icons.mjs
//
// The glyph is a browser window crossed out by a slash. "on" is green,
// "off" is grey; the badge text says the same thing in words.

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'icons');
const SIZES = [16, 32, 48, 128];
const THEMES = {
  on: [0x16, 0xa3, 0x4a],
  off: [0x6b, 0x72, 0x80],
};

// ------------------------------------------------------------ geometry
// All shapes live in a 0..1 square. sd* functions return signed distance
// (negative inside).

function sdRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const hx = (x1 - x0) / 2 - r, hy = (y1 - y0) / 2 - r;
  const dx = Math.abs(x - cx) - hx, dy = Math.abs(y - cy) - hy;
  const ox = Math.max(dx, 0), oy = Math.max(dy, 0);
  return Math.hypot(ox, oy) + Math.min(Math.max(dx, dy), 0) - r;
}

function distSegment(x, y, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (ax + t * vx), y - (ay + t * vy));
}

// Returns 'glyph', 'bg' or null for one sample point.
function shade(x, y, size) {
  // Thicker strokes on tiny icons so they stay readable.
  const k = size <= 16 ? 1.35 : size <= 32 ? 1.15 : 1;

  if (sdRoundRect(x, y, 0.03, 0.03, 0.97, 0.97, 0.22) > 0) return null;

  const slash = distSegment(x, y, 0.2, 0.8, 0.8, 0.2);
  if (slash < 0.055 * k) return 'glyph';
  if (slash < 0.115 * k) return 'bg'; // gap that separates the slash from the window

  const win = sdRoundRect(x, y, 0.2, 0.25, 0.8, 0.75, 0.07);
  const stroke = 0.04 * k;
  if (Math.abs(win) < stroke) return 'glyph';
  if (win < 0 && y < 0.37) return 'glyph'; // title bar
  return 'bg';
}

// ---------------------------------------------------------------- draw

function draw(size, [r, g, b]) {
  const SS = 4; // 4x4 supersampling
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      let pr = 0, pg = 0, pb = 0, pa = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const s = shade((i + (sx + 0.5) / SS) / size, (j + (sy + 0.5) / SS) / size, size);
          if (s === 'glyph') { pr += 255; pg += 255; pb += 255; pa += 1; }
          else if (s === 'bg') { pr += r; pg += g; pb += b; pa += 1; }
        }
      }
      const o = (j * size + i) * 4;
      if (pa > 0) {
        px[o] = Math.round(pr / pa);
        px[o + 1] = Math.round(pg / pa);
        px[o + 2] = Math.round(pb / pa);
      }
      px[o + 3] = Math.round((pa / (SS * SS)) * 255);
    }
  }
  return px;
}

// ----------------------------------------------------------------- png

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const [name, color] of Object.entries(THEMES)) {
  for (const size of SIZES) {
    writeFileSync(join(OUT, `${name}-${size}.png`), png(size, draw(size, color)));
  }
}
console.log(`Wrote ${SIZES.length * Object.keys(THEMES).length} icons to ${OUT}`);
