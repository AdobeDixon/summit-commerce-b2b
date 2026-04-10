#!/usr/bin/env node
/**
 * Create the six masonry brick products in Adobe Commerce (POST /V1/products).
 * SKUs and names come from blocks/bodea-dashboard/dashboard-config.js.
 *
 * Skips a SKU if GET /V1/products/:sku already returns 200.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/create-masonry-products.mjs
 *   node scripts/create-masonry-products.mjs
 *   npm run create-masonry-products
 *
 * Env (same as other Commerce scripts; use .env with IMS_*):
 *   MAGENTO_ATTRIBUTE_SET_ID  - Default 4 (Magento "Default" attribute set; change if your catalog differs)
 *   MASONRY_PRODUCT_BASE_PRICE - Default 1 (placeholder list price; adjust in Admin)
 *   MASONRY_PRODUCT_WEBSITE_IDS - Comma-separated website ids (default 1,2 = Main + Bodea; matches legacy CHEP)
 *   API_ENDPOINT, IMS_CLIENT_ID, IMS_CLIENT_SECRET, IMS_ORG_ID, COMMERCE_ACCESS_TOKEN — see update-commerce-product-names.mjs
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  EQUIPMENT_CATALOG_NAMES,
  FEATURED_EQUIPMENT_SKUS,
} from '../blocks/bodea-dashboard/dashboard-config.js';

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

function buildProductsCollectionUrl(baseUrl) {
  const root = (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
  const segment = root ? `${root}/V1/products` : 'V1/products';
  return `${baseUrl.replace(/\/+$/, '')}/${segment}`;
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

  const attributeSetId = Number.parseInt(getEnv('MAGENTO_ATTRIBUTE_SET_ID') || '4', 10);
  const basePrice = Number.parseFloat(getEnv('MASONRY_PRODUCT_BASE_PRICE') || '1', 10);
  const websiteIds = (getEnv('MASONRY_PRODUCT_WEBSITE_IDS') || '1,2')
    .split(/[, ]+/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));

  const collectionUrl = buildProductsCollectionUrl(baseUrl);

  console.log('API base:', baseUrl);
  console.log('POST:', collectionUrl);
  console.log('attribute_set_id:', attributeSetId, 'base price:', basePrice, 'website_ids:', websiteIds);
  console.log('Products:', FEATURED_EQUIPMENT_SKUS.length);

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const sku of FEATURED_EQUIPMENT_SKUS) {
    const name = EQUIPMENT_CATALOG_NAMES[sku];
    if (!name) {
      console.error(`Missing EQUIPMENT_CATALOG_NAMES for ${sku}`);
      failed += 1;
      continue;
    }

    const oneUrl = buildProductUrl(baseUrl, sku);

    if (dryRun) {
      console.log(`[dry-run] GET ${oneUrl} — if 404, POST create "${name}"`);
      created += 1;
      continue;
    }

    const getRes = await fetch(oneUrl, { method: 'GET', headers });
    if (getRes.ok) {
      console.log(`SKIP ${sku} (already exists)`);
      skipped += 1;
      continue;
    }

    if (getRes.status !== 404) {
      const t = await getRes.text();
      console.error(`ERR GET ${sku} HTTP ${getRes.status}`, t);
      failed += 1;
      continue;
    }

    const payload = {
      product: {
        sku,
        name,
        type_id: 'simple',
        attribute_set_id: attributeSetId,
        price: basePrice,
        status: 1,
        visibility: 4,
        weight: 1,
        extension_attributes: {
          website_ids: websiteIds,
        },
      },
    };

    const postRes = await fetch(collectionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const postText = await postRes.text();
    let postData;
    try {
      postData = JSON.parse(postText);
    } catch {
      postData = postText;
    }

    if (postRes.ok) {
      console.log(`OK  created ${sku}`);
      created += 1;
    } else {
      console.error(
        `ERR POST ${sku} HTTP ${postRes.status}`,
        typeof postData === 'string' ? postData : JSON.stringify(postData, null, 2),
      );
      failed += 1;
    }
  }

  console.log(`\nDone: ${created} created, ${skipped} skipped, ${failed} failed${dryRun ? ' (dry run)' : ''}.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
