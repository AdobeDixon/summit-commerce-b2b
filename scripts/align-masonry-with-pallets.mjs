#!/usr/bin/env node
/**
 * Align masonry equipment SKUs with legacy pallet products in Commerce:
 *   1) Website scope (Main + Bodea) — assign-masonry-product-websites.mjs
 *   2) Shared catalog products — assign-masonry-shared-catalog.mjs
 *   3) MSI source-items — set-masonry-stock.mjs with MASONRY_MSI_REFERENCE_SKU
 *
 * Default reference pallet for MSI: CHEP-EU-WOOD-1200X800-03 (override via env).
 *
 * Usage:
 *   node scripts/align-masonry-with-pallets.mjs
 *   MASONRY_MSI_REFERENCE_SKU=CHEP-EU-WOOD-1200X800-03 npm run align-masonry-with-pallets
 *   SHARED_CATALOG_ID=1 npm run align-masonry-with-pallets
 *
 * Steps: websites → shared catalog → pallet equipment category (B2B category ACL) → MSI from reference pallet.
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const ref = process.env.MASONRY_MSI_REFERENCE_SKU || 'CHEP-EU-WOOD-1200X800-03';
const env = { ...process.env, MASONRY_MSI_REFERENCE_SKU: ref };

function run(label, cmd) {
  console.log(`\n── ${label} ──\n`);
  execSync(cmd, { cwd: root, stdio: 'inherit', env });
}

try {
  run(
    '1/4 Product websites (extension_attributes.website_ids)',
    'node scripts/assign-masonry-product-websites.mjs',
  );
  run(
    '2/4 Shared catalog assignProducts',
    'node scripts/assign-masonry-shared-catalog.mjs',
  );
  run(
    '3/4 Category — same equipment category as CHEP (fixes PERMISSION_DENIED if role is category-scoped)',
    'node scripts/link-masonry-pallet-equipment-category.mjs',
  );
  run(
    `4/4 MSI source-items (template from ${ref})`,
    'node scripts/set-masonry-stock.mjs',
  );
  console.log('\nOK  Masonry SKUs aligned with pallet configuration (websites + catalog + category + MSI).');
} catch (e) {
  process.exit(e.status ?? 1);
}
