// Regenerate all PWA / favicon / apple-touch icons from a single square source
// image. Run: node backend/scripts/generate-icons.mjs [sourcePng]
// Default source: /home/abdisatar/Downloads/PWAlogo.png
import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.argv[2] || '/home/abdisatar/Downloads/PWAlogo.png';
const PUB = path.resolve(__dirname, '../../frontend/breadBank/public');
const ICONS = path.join(PUB, 'icons');

if (!fs.existsSync(SRC)) { console.error('Source not found:', SRC); process.exit(1); }

// [relative-path-from-public, size]
const targets = [
  ['icons/icon-128x128.png', 128],
  ['icons/icon-192x192.png', 192],
  ['icons/icon-256x256.png', 256],
  ['icons/icon-384x384.png', 384],
  ['icons/icon-512x512.png', 512],
  ['icons/favicon-16x16.png', 16],
  ['icons/favicon-32x32.png', 32],
  ['icons/favicon-96x96.png', 96],
  ['icons/favicon-128x128.png', 128],
  ['icons/apple-icon-120x120.png', 120],
  ['icons/apple-icon-152x152.png', 152],
  ['icons/apple-icon-167x167.png', 167],
  ['icons/apple-icon-180x180.png', 180],
  ['icons/ms-icon-144x144.png', 144],
  ['apple-touch-icon.png', 180],
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
];

fs.mkdirSync(ICONS, { recursive: true });

for (const [rel, size] of targets) {
  const out = path.join(PUB, rel);
  await sharp(SRC).resize(size, size, { fit: 'cover' }).png().toFile(out);
  console.log('wrote', rel, `(${size}px)`);
}

// favicon.ico (multi-size) from 16/32/48 PNG buffers.
const icoBufs = await Promise.all(
  [16, 32, 48].map((s) => sharp(SRC).resize(s, s, { fit: 'cover' }).png().toBuffer()),
);
fs.writeFileSync(path.join(PUB, 'favicon.ico'), await pngToIco(icoBufs));
console.log('wrote favicon.ico (16/32/48)');

// SVG favicon: wrap a 256px PNG so the SVG-favicon <link> shows the new logo too.
const png256 = (await sharp(SRC).resize(256, 256, { fit: 'cover' }).png().toBuffer()).toString('base64');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><image href="data:image/png;base64,${png256}" width="256" height="256"/></svg>`;
fs.writeFileSync(path.join(ICONS, 'breadbank.svg'), svg);
console.log('wrote icons/breadbank.svg (embeds 256px logo)');

console.log('\nDone — regenerated all icons from', SRC);
