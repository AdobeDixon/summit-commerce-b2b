#!/usr/bin/env node
/**
 * Adobe Commerce SKU migration: renames products by PUT {base}/V1/products/{from}
 * with { product: { sku: to, name } } from EQUIPMENT_CATALOG_NAMES.
 *
 * Order: HCS-MSY-* → HCS-BR-* (canonical), then CHEP-* → HCS-BR-* (stragglers).
 * 404 on `from` is skipped (already migrated). Run after backing up the catalog.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/migrate-legacy-skus-to-masonry.mjs
 *   node scripts/migrate-legacy-skus-to-masonry.mjs
 *   npm run migrate-masonry-skus
 *
 * Env: same as scripts/update-commerce-product-names.mjs (.env IMS or COMMERCE_ACCESS_TOKEN).
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  EQUIPMENT_CATALOG_NAMES,
  EQUIPMENT_MSY_TO_BR_SKU_MIGRATION,
  LEGACY_EQUIPMENT_SKU_MIGRATION,
} from '../blocks/chep-dashboard/dashboard-config.js';

const ALL_SKU_MIGRATIONS = [
  ...EQUIPMENT_MSY_TO_BR_SKU_MIGRATION,
  ...LEGACY_EQUIPMENT_SKU_MIGRATION,
];

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

for (const p of [
  join(projectRoot, '.env'),
  join(projectRoot, 'cypress', 'src', 'support', '.env'),
]) {
  if (existsSync(p)) {
    const content = readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
    break;
  }
}

function getEnv(name) {
  return process.env[name] || process.env[`CYPRESS_${name}`];
}

function getPublicConfig() {
  try {
    const configPath = join(projectRoot, 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    return config?.public?.default ?? null;
  } catch {
    return null;
  }
}

function getApiEndpoint() {
  const endpoint = getEnv('API_ENDPOINT');
  if (endpoint) return endpoint.replace(/\/graphql$/, '');

  const pub = getPublicConfig();
  const graphqlUrl = pub?.['commerce-endpoint'];
  if (graphqlUrl) {
    return graphqlUrl.replace(/\/graphql$/, '');
  }
  return null;
}

function getCommerceStoreHeaders() {
  const pub = getPublicConfig();
  const cs = pub?.headers?.cs;
  const h = {};
  if (cs?.['Magento-Store-Code']) {
    h['Magento-Store-Code'] = cs['Magento-Store-Code'];
  }
  if (cs?.['Magento-Store-View-Code']) {
    h['Magento-Store-View-Code'] = cs['Magento-Store-View-Code'];
  }
  if (cs?.['Magento-Website-Code']) {
    h['Magento-Website-Code'] = cs['Magento-Website-Code'];
  }
  const all = pub?.headers?.all;
  if (all?.Store && !h['Magento-Store-View-Code']) {
    h.Store = all.Store;
  }
  return h;
}

function buildProductUrl(baseUrl, sku) {
  const root = (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
  const segment = root ? `${root}/V1/products` : 'V1/products';
  return `${baseUrl.replace(/\/+$/, '')}/${segment}/${encodeURIComponent(sku)}`;
}

/**
 * Normalize GET response to a flat product object (Magento may wrap in `product`).
 * @param {unknown} data
 * @returns {Record<string, unknown>}
 */
function unwrapProduct(data) {
  if (data && typeof data === 'object' && 'product' in data && data.product) {
    return /** @type {Record<string, unknown>} */ (data.product);
  }
  return /** @type {Record<string, unknown>} */ (data);
}

/**
 * Fields that often break PUT when round-tripped from GET (Adobe Commerce SaaS).
 */
function stripProductReadOnly(product) {
  const p = { ...product };
  delete p.id;
  delete p.media_gallery_entries;
  delete p.options;
  delete p.product_links;
  return p;
}

async function getImsAccessToken() {
  const clientId = getEnv('IMS_CLIENT_ID');
  const clientSecret = getEnv('IMS_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing IMS_CLIENT_ID / IMS_CLIENT_SECRET (or set COMMERCE_ACCESS_TOKEN).',
    );
  }

  const response = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope:
        'openid,AdobeID,email,profile,additional_info.roles,additional_info.projectedProductContext,commerce.accs',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IMS token failed: ${response.status} ${text}`);
  }
  const data = await response.json();
  return { accessToken: data.access_token, clientId };
}

async function main() {
  const baseUrl = getApiEndpoint();
  if (!baseUrl) {
    console.error(
      'Could not determine API base URL. Set API_ENDPOINT or add commerce-endpoint to config.json.',
    );
    process.exit(1);
  }

  const dryRun = getEnv('DRY_RUN') === '1' || process.argv.includes('--dry-run');

  let auth;
  if (dryRun) {
    auth = { token: '', clientId: '' };
  } else {
    const presetToken = getEnv('COMMERCE_ACCESS_TOKEN');
    if (presetToken) {
      auth = { token: presetToken, clientId: getEnv('IMS_CLIENT_ID') || '' };
    } else {
      const { accessToken, clientId } = await getImsAccessToken();
      auth = { token: accessToken, clientId };
    }
  }

  const orgId = getEnv('IMS_ORG_ID');
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
    ...getCommerceStoreHeaders(),
  };
  if (auth.clientId) headers['x-api-key'] = auth.clientId;
  if (orgId) headers['x-gw-ims-org-id'] = orgId;

  console.log('API base:', baseUrl);
  console.log('Migrations:', ALL_SKU_MIGRATIONS.length);

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const { from: legacySku, to: newSku } of ALL_SKU_MIGRATIONS) {
    const name = EQUIPMENT_CATALOG_NAMES[newSku];
    if (!name) {
      console.error(`Missing EQUIPMENT_CATALOG_NAMES for ${newSku}`);
      failed += 1;
      continue;
    }

    const url = buildProductUrl(baseUrl, legacySku);

    if (dryRun) {
      console.log(`[dry-run] GET ${url} then PUT sku=${newSku}`);
      console.log(`          name: ${name}`);
      ok += 1;
      continue;
    }

    const getRes = await fetch(url, { method: 'GET', headers });
    const getText = await getRes.text();
    let getData;
    try {
      getData = JSON.parse(getText);
    } catch {
      getData = {};
    }

    if (getRes.status === 404) {
      console.warn(`SKIP ${legacySku} (not found — may already be ${newSku})`);
      skipped += 1;
      continue;
    }

    if (!getRes.ok) {
      console.error(
        `ERR GET ${legacySku} HTTP ${getRes.status}`,
        typeof getData === 'string' ? getText : JSON.stringify(getData, null, 2),
      );
      failed += 1;
      continue;
    }

    const existing = unwrapProduct(getData);
    const merged = stripProductReadOnly({
      ...existing,
      sku: newSku,
      name,
    });

    const response = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ product: merged }),
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (response.ok) {
      console.log(`OK  ${legacySku} -> ${newSku}`);
      ok += 1;
    } else if (response.status === 404) {
      console.warn(`SKIP ${legacySku} (not found — may already be ${newSku})`);
      skipped += 1;
    } else {
      console.error(
        `ERR ${legacySku} HTTP ${response.status}`,
        typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      );
      failed += 1;
    }
  }

  console.log(
    `\nDone: ${ok} ok, ${skipped} skipped, ${failed} failed${dryRun ? ' (dry run)' : ''}.`,
  );
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
