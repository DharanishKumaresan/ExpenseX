#!/usr/bin/env node
/**
 * Generates every PWA icon from one vector source.
 *
 *   node scripts/icons.mjs
 *
 * Re-run this whenever the mark changes; the PNGs are committed so that a
 * production build never depends on `sharp` being installable.
 *
 * Two shapes are produced from the same drawing:
 *   - "any"      — the mark filling the tile, for browsers that show it as-is.
 *   - "maskable" — the same mark inside the 80% safe zone, so Android can clip
 *                  it to a circle, a squircle or a rounded square without
 *                  taking a bite out of the letterforms.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'icons');

const FOREST = '#171717';
const SAGE = '#fafafa';
const YELLOW = '#fafafa';

/**
 * @param {number} scale 1 fills the tile; 0.8 keeps the maskable safe zone.
 * @param {boolean} rounded Rounded corners for the "any" shape; maskable tiles
 *   are always full-bleed because the platform supplies the mask.
 */
function source(scale, rounded) {
  const S = 512;
  const inset = (S * (1 - scale)) / 2;
  const inner = S * scale;
  const radius = rounded ? S * 0.22 : 0;

  // Vertical-rule hatching, the product's signature texture, sitting under
  // the mark as a base rather than across it.
  const hatchTop = inset + inner * 0.78;
  const hatchBottom = inset + inner * 0.92;
  const rules = Array.from({ length: 24 }, (_, i) => {
    const x = inset + inner * 0.12 + i * (inner * 0.033);
    return `<line x1="${x.toFixed(2)}" y1="${hatchTop.toFixed(2)}" x2="${x.toFixed(2)}" y2="${hatchBottom.toFixed(2)}" stroke="${SAGE}" stroke-opacity="0.22" stroke-width="${(inner * 0.011).toFixed(2)}"/>`;
  }).join('');

  const fontSize = inner * 0.44;
  const baseline = inset + inner * 0.58;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="${radius}" fill="${FOREST}"/>
  <text x="${S / 2}" y="${baseline}" text-anchor="middle"
        font-family="Archivo, 'Segoe UI', Helvetica, Arial, sans-serif"
        font-weight="800" font-size="${fontSize}" letter-spacing="${-fontSize * 0.06}">
    <tspan fill="${SAGE}">e</tspan><tspan fill="${YELLOW}">x</tspan>
  </text>
  <rect x="${(inset + inner * 0.12).toFixed(2)}" y="${(inset + inner * 0.67).toFixed(2)}"
        width="${(inner * 0.76).toFixed(2)}" height="${(inner * 0.045).toFixed(2)}"
        rx="${(inner * 0.0225).toFixed(2)}" fill="${SAGE}"/>
</svg>`;
}

/** Minimal ICO container. The format accepts a whole PNG as its payload. */
function ico(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry.writeUInt8(size === 256 ? 0 : size, 0);
  entry.writeUInt8(size === 256 ? 0 : size, 1);
  entry.writeUInt8(0, 2); // palette
  entry.writeUInt8(0, 3); // reserved
  entry.writeUInt16LE(1, 4); // colour planes
  entry.writeUInt16LE(32, 6); // bits per pixel
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  return Buffer.concat([header, entry, png]);
}

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('This script needs `sharp`. Install it with: npm i -D sharp');
    process.exit(1);
  }

  fs.mkdirSync(OUT, { recursive: true });

  const any = Buffer.from(source(1, true));
  const maskable = Buffer.from(source(0.8, false));

  const jobs = [
    ['icon-192.png', any, 192],
    ['icon-256.png', any, 256],
    ['icon-384.png', any, 384],
    ['icon-512.png', any, 512],
    ['icon-maskable-192.png', maskable, 192],
    ['icon-maskable-512.png', maskable, 512],
    ['apple-touch-icon.png', any, 180],
    ['favicon-32.png', any, 32],
    ['favicon-16.png', any, 16],
  ];

  for (const [name, svg, size] of jobs) {
    await sharp(svg, { density: 512 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(OUT, name));
    console.log(`  ${name}  ${size}x${size}`);
  }

  fs.writeFileSync(path.join(ROOT, 'public', 'icon.svg'), source(1, true));

  const favicon = await sharp(any, { density: 512 }).resize(32, 32).png({ compressionLevel: 9 }).toBuffer();
  fs.writeFileSync(path.join(ROOT, 'public', 'favicon.ico'), ico(favicon, 32));
  console.log('  favicon.ico  32x32');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
