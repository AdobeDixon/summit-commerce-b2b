#!/usr/bin/env node
/**
 * Makes the trailer interior (black pixels) transparent in truck-capacity.png.
 * Run: node scripts/fix-truck-transparency.mjs
 * Requires: npm install sharp
 *
 * After running, the PNG will have a transparent trailer cavity, allowing
 * the blue fill to show through when the image is layered on top.
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = join(__dirname, '../images/truck-capacity.png');
const outputPath = inputPath;

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Run: npm install sharp');
    process.exit(1);
  }

  const img = sharp(inputPath);
  const { data, info } = await img.raw().ensureAlpha().toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const isNearBlack = (r, g, b) => r < 40 && g < 40 && b < 40;

  /* Only make transparent within trailer cavity bounds (26%–91% x, 20%–75% y) */
  const xMin = Math.floor(width * 0.26);
  const xMax = Math.floor(width * 0.91);
  const yMin = Math.floor(height * 0.20);
  const yMax = Math.floor(height * 0.75);

  for (let y = yMin; y < yMax; y++) {
    for (let x = xMin; x < xMax; x++) {
      const i = (y * width + x) * channels;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (isNearBlack(r, g, b)) {
        data[i + 3] = 0;
      }
    }
  }

  await sharp(data, { raw: { width, height, channels } })
    .png()
    .toFile(outputPath);

  console.log('Done. Trailer interior is now transparent.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
