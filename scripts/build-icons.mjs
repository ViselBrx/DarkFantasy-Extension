import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { GRID_SIZE, icons } from './icon-designs.mjs';

const unitsPerEm = 960;
const pixelUnits = unitsPerEm / GRID_SIZE;
const ascent = 840;
const descent = -120;

for (const icon of icons) {
  if (icon.pixels.length !== GRID_SIZE || icon.pixels.some((row) => row.length !== GRID_SIZE || /[^.#]/.test(row))) {
    throw new Error(`Invalid ${GRID_SIZE}x${GRID_SIZE} icon: ${icon.name}`);
  }
}

const align4 = (n) => (n + 3) & ~3;
const u16 = (n) => { const b = Buffer.alloc(2); b.writeUInt16BE(n & 0xffff); return b; };
const i16 = (n) => { const b = Buffer.alloc(2); b.writeInt16BE(n); return b; };
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; };
const pad4 = (b) => Buffer.concat([b, Buffer.alloc(align4(b.length) - b.length)]);

function checksum(data) {
  const padded = pad4(data);
  let sum = 0;
  for (let i = 0; i < padded.length; i += 4) sum = (sum + padded.readUInt32BE(i)) >>> 0;
  return sum;
}

function glyphFromPixels(rows) {
  const contours = [];
  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE;) {
      if (rows[row][col] !== '#') { col++; continue; }
      const start = col;
      while (col < GRID_SIZE && rows[row][col] === '#') col++;
      // 40 font units become exactly one pixel at the activity bar's 24px size.
      const left = start * pixelUnits;
      const right = col * pixelUnits;
      const top = ascent - row * pixelUnits;
      const bottom = top - pixelUnits;
      contours.push([[left, bottom], [left, top], [right, top], [right, bottom]]);
    }
  }
  const points = contours.flat();
  const xMin = Math.min(...points.map(([x]) => x));
  const yMin = Math.min(...points.map(([, y]) => y));
  const xMax = Math.max(...points.map(([x]) => x));
  const yMax = Math.max(...points.map(([, y]) => y));
  const header = Buffer.alloc(10);
  header.writeInt16BE(contours.length, 0);
  header.writeInt16BE(xMin, 2);
  header.writeInt16BE(yMin, 4);
  header.writeInt16BE(xMax, 6);
  header.writeInt16BE(yMax, 8);
  const ends = Buffer.concat(contours.map((_, i) => u16((i + 1) * 4 - 1)));
  const flags = Buffer.alloc(points.length, 1); // All points are on a square corner.
  let lastX = 0;
  let lastY = 0;
  const xCoords = [];
  const yCoords = [];
  for (const [x, y] of points) {
    xCoords.push(i16(x - lastX));
    yCoords.push(i16(y - lastY));
    lastX = x;
    lastY = y;
  }
  return {
    data: pad4(Buffer.concat([header, ends, u16(0), flags, ...xCoords, ...yCoords])),
    points: points.length,
    contours: contours.length,
    xMin, yMin, xMax, yMax
  };
}

const glyphs = [{ data: Buffer.alloc(0), points: 0, contours: 0 }, ...icons.map(({ pixels }) => glyphFromPixels(pixels))];
const glyphCount = glyphs.length;
const drawnGlyphs = glyphs.slice(1);
const offsets = [0];
let glyfOffset = 0;
for (const glyph of glyphs) { glyfOffset += glyph.data.length; offsets.push(glyfOffset); }

const cmapSegments = icons.map((_, i) => 0xe001 + i);
cmapSegments.push(0xffff);
const segmentCount = cmapSegments.length;
const cmap4 = Buffer.alloc(16 + segmentCount * 8);
cmap4.writeUInt16BE(4, 0);
cmap4.writeUInt16BE(cmap4.length, 2);
cmap4.writeUInt16BE(segmentCount * 2, 6);
const maxPower = 2 ** Math.floor(Math.log2(segmentCount));
cmap4.writeUInt16BE(maxPower * 2, 8);
cmap4.writeUInt16BE(Math.log2(maxPower), 10);
cmap4.writeUInt16BE(segmentCount * 2 - maxPower * 2, 12);
let at = 14;
for (const code of cmapSegments) { cmap4.writeUInt16BE(code, at); at += 2; }
at += 2; // reservedPad
for (const code of cmapSegments) { cmap4.writeUInt16BE(code, at); at += 2; }
for (let i = 0; i < segmentCount; i++) {
  const delta = i === segmentCount - 1 ? 1 : (i + 1 - cmapSegments[i]);
  cmap4.writeUInt16BE(delta & 0xffff, at);
  at += 2;
}
// idRangeOffset is zero for each segment.
const cmap = Buffer.concat([u16(0), u16(1), u16(3), u16(1), u32(12), cmap4]);

function nameTable() {
  const values = [[1, 'Vespergrim Relics'], [2, 'Regular'], [4, 'Vespergrim Relics Regular'], [6, 'VespergrimRelics-Regular']];
  const header = Buffer.alloc(6 + values.length * 12);
  header.writeUInt16BE(values.length, 2);
  header.writeUInt16BE(header.length, 4);
  let offset = 0;
  const strings = [];
  values.forEach(([id, value], i) => {
    const bytes = Buffer.alloc(value.length * 2);
    for (let c = 0; c < value.length; c++) bytes.writeUInt16BE(value.charCodeAt(c), c * 2);
    const record = 6 + i * 12;
    header.writeUInt16BE(3, record);
    header.writeUInt16BE(1, record + 2);
    header.writeUInt16BE(0x0409, record + 4);
    header.writeUInt16BE(id, record + 6);
    header.writeUInt16BE(bytes.length, record + 8);
    header.writeUInt16BE(offset, record + 10);
    strings.push(bytes);
    offset += bytes.length;
  });
  return Buffer.concat([header, ...strings]);
}

const head = Buffer.alloc(54);
head.writeUInt32BE(0x00010000, 0);
head.writeUInt32BE(0x00010000, 4);
head.writeUInt32BE(0x5f0f3cf5, 12);
head.writeUInt16BE(3, 16);
head.writeUInt16BE(unitsPerEm, 18);
head.writeInt16BE(Math.min(...drawnGlyphs.map((g) => g.xMin)), 36);
head.writeInt16BE(Math.min(...drawnGlyphs.map((g) => g.yMin)), 38);
head.writeInt16BE(Math.max(...drawnGlyphs.map((g) => g.xMax)), 40);
head.writeInt16BE(Math.max(...drawnGlyphs.map((g) => g.yMax)), 42);
head.writeUInt16BE(8, 46);
head.writeInt16BE(2, 48);
head.writeInt16BE(1, 50); // Long loca offsets.

const hhea = Buffer.alloc(36);
hhea.writeUInt32BE(0x00010000, 0);
hhea.writeInt16BE(ascent, 4);
hhea.writeInt16BE(descent, 6);
hhea.writeUInt16BE(unitsPerEm, 10);
hhea.writeInt16BE(Math.min(...drawnGlyphs.map((g) => g.xMin)), 12);
hhea.writeInt16BE(Math.min(...drawnGlyphs.map((g) => unitsPerEm - g.xMax)), 14);
hhea.writeInt16BE(Math.max(...drawnGlyphs.map((g) => g.xMax)), 16);
hhea.writeInt16BE(1, 18);
hhea.writeUInt16BE(glyphCount, 34);

const maxp = Buffer.alloc(32);
maxp.writeUInt32BE(0x00010000, 0);
maxp.writeUInt16BE(glyphCount, 4);
maxp.writeUInt16BE(Math.max(...glyphs.map((g) => g.points)), 6);
maxp.writeUInt16BE(Math.max(...glyphs.map((g) => g.contours)), 8);

const os2 = Buffer.alloc(78);
os2.writeInt16BE(unitsPerEm, 2);
os2.writeUInt16BE(400, 4);
os2.writeUInt16BE(5, 6);
os2.write('DFPX', 58, 'ascii');
os2.writeUInt16BE(64, 62);
os2.writeUInt16BE(0xe001, 64);
os2.writeUInt16BE(0xe000 + icons.length, 66);
os2.writeInt16BE(ascent, 68);
os2.writeInt16BE(descent, 70);
os2.writeUInt16BE(ascent, 74);
os2.writeUInt16BE(-descent, 76);

const post = Buffer.alloc(32);
post.writeUInt32BE(0x00030000, 0);

const tables = new Map([
  ['OS/2', os2],
  ['cmap', cmap],
  ['glyf', Buffer.concat(glyphs.map((g) => g.data))],
  ['head', head],
  ['hhea', hhea],
  ['hmtx', Buffer.concat(glyphs.map((glyph) => Buffer.concat([u16(unitsPerEm), i16(glyph.xMin ?? 0)])))],
  ['loca', Buffer.concat(offsets.map(u32))],
  ['maxp', maxp],
  ['name', nameTable()],
  ['post', post]
]);
const sorted = [...tables].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const numTables = sorted.length;

// Calculate the sfnt checksum adjustment before wrapping its tables in WOFF.
const sfntSize = 12 + numTables * 16 + sorted.reduce((sum, [, data]) => sum + align4(data.length), 0);
const sfnt = Buffer.alloc(sfntSize);
sfnt.writeUInt32BE(0x00010000, 0);
sfnt.writeUInt16BE(numTables, 4);
const sfntPower = 2 ** Math.floor(Math.log2(numTables));
sfnt.writeUInt16BE(sfntPower * 16, 6);
sfnt.writeUInt16BE(Math.log2(sfntPower), 8);
sfnt.writeUInt16BE(numTables * 16 - sfntPower * 16, 10);
let tableOffset = 12 + numTables * 16;
let headOffset = 0;
sorted.forEach(([tag, data], i) => {
  const entry = 12 + i * 16;
  sfnt.write(tag, entry, 4, 'ascii');
  sfnt.writeUInt32BE(checksum(data), entry + 4);
  sfnt.writeUInt32BE(tableOffset, entry + 8);
  sfnt.writeUInt32BE(data.length, entry + 12);
  data.copy(sfnt, tableOffset);
  if (tag === 'head') headOffset = tableOffset;
  tableOffset += align4(data.length);
});
const adjustment = (0xb1b0afba - checksum(sfnt)) >>> 0;
head.writeUInt32BE(adjustment, 8);
sfnt.writeUInt32BE(adjustment, headOffset + 8);
if (((checksum(sfnt)) >>> 0) !== 0xb1b0afba) throw new Error('Invalid sfnt checksum');

const fontParts = [];
let woffOffset = 44 + numTables * 20;
for (const [tag, data] of sorted) {
  const packed = deflateSync(data);
  const payload = packed.length < data.length ? packed : data;
  fontParts.push({ tag, data, payload, offset: woffOffset });
  woffOffset += align4(payload.length);
}
const woff = Buffer.alloc(woffOffset);
woff.write('wOFF', 0, 'ascii');
woff.writeUInt32BE(0x00010000, 4);
woff.writeUInt32BE(woff.length, 8);
woff.writeUInt16BE(numTables, 12);
woff.writeUInt32BE(sfntSize, 16);
woff.writeUInt16BE(1, 20);
fontParts.forEach(({ tag, data, payload, offset }, i) => {
  const entry = 44 + i * 20;
  woff.write(tag, entry, 4, 'ascii');
  woff.writeUInt32BE(offset, entry + 4);
  woff.writeUInt32BE(payload.length, entry + 8);
  woff.writeUInt32BE(data.length, entry + 12);
  const checksumData = tag === 'head' ? Buffer.from(data) : data;
  if (tag === 'head') checksumData.writeUInt32BE(0, 8);
  woff.writeUInt32BE(checksum(checksumData), entry + 16);
  payload.copy(woff, offset);
});

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vespergrimColors = JSON.parse(readFileSync(join(root, 'themes', 'vespergrim-color-theme.json'), 'utf8')).colors;
const rgb = (hex) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
const previewForeground = rgb(vespergrimColors['activityBar.foreground']);
const previewBackground = rgb(vespergrimColors['activityBar.background']);
const output = join(root, 'product-icons', 'vespergrim-relics.woff');
writeFileSync(output, woff);
if (process.argv.includes('--ttf-preview')) {
  writeFileSync(output.replace(/\.woff$/, '.ttf'), sfnt);
}

const iconDefinitions = {};
for (const [index, icon] of icons.entries()) {
  for (const id of icon.ids) {
    if (iconDefinitions[id]) throw new Error(`Duplicate product icon ID: ${id}`);
    iconDefinitions[id] = { fontCharacter: `\\${(0xe001 + index).toString(16).toUpperCase()}` };
  }
}
const productTheme = {
  fonts: [
    {
      id: 'vespergrim-relics',
      src: [{ path: './vespergrim-relics.woff', format: 'woff' }],
      weight: 'normal',
      style: 'normal'
    }
  ],
  iconDefinitions
};
writeFileSync(
  join(root, 'product-icons', 'vespergrim-product-icon-theme.json'),
  `${JSON.stringify(productTheme, null, 2)}\n`
);

function svgFor(icon) {
  const pixels = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (icon.pixels[y][x] === '#') pixels.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 ${GRID_SIZE} ${GRID_SIZE}" shape-rendering="crispEdges" aria-label="${icon.name}"><g fill="${icon.color}">${pixels.join('')}</g></svg>\n`;
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let i = 0; i < 8; i++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  return value >>> 0;
});
function crc32(data) {
  let value = 0xffffffff;
  for (const byte of data) value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
function pngChunk(type, data) {
  const tag = Buffer.from(type, 'ascii');
  return Buffer.concat([u32(data.length), tag, data, u32(crc32(Buffer.concat([tag, data])))]);
}
function pngFor(icon) {
  // One font pixel per image pixel, centered in a 48px Activity Bar button.
  // The WOFF glyph uses the same bitmap and takes its color from the theme.
  const size = 48;
  const inset = (size - GRID_SIZE) / 2;
  const rgba = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gridX = x - inset;
      const gridY = y - inset;
      const active = gridX >= 0 && gridX < GRID_SIZE && gridY >= 0 && gridY < GRID_SIZE
        && icon.pixels[gridY][gridX] === '#';
      const color = active ? previewForeground : previewBackground;
      const at = y * (size * 4 + 1) + 1 + x * 4;
      rgba.set([...color, 255], at);
    }
  }
  const ihdr = Buffer.concat([u32(size), u32(size), Buffer.from([8, 6, 0, 0, 0])]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(rgba)),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

const svgDir = join(root, 'design', 'pixel-icons');
const pngDir = join(root, 'assets', 'readme-icons');
mkdirSync(svgDir, { recursive: true });
mkdirSync(pngDir, { recursive: true });
for (const icon of icons) {
  writeFileSync(join(svgDir, `${icon.name}.svg`), svgFor(icon));
  writeFileSync(join(pngDir, `${icon.name}.png`), pngFor(icon));
}
console.log(`Generated ${icons.length} glyphs, ${icons.length} SVG sources and README PNGs`);
