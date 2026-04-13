#!/usr/bin/env node
/* eslint-disable import/extensions, no-console, no-await-in-loop, no-restricted-syntax */
/**
 * Set Adobe Commerce list `price` for featured HCS-BR-* masonry SKUs (USD per pack).
 * Prices: EQUIPMENT_CATALOG_PRICES_USD in blocks/bodea-dashboard/dashboard-config.js.
 *
 * Usage:
 *   DRY_RUN=1 node scripts/update-masonry-product-prices.mjs
 *   node scripts/update-masonry-product-prices.mjs
 *   npm run update-masonry-product-prices
 *
 * Env: same as update-commerce-product-names.mjs (API_ENDPOINT, IMS_*, COMMERCE_ACCESS_TOKEN, …).
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { EQUIPMENT_CATALOG_PRICES_USD } from '../blocks/bodea-dashboard/dashboard-config.js';

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

function unwrapProduct(data) {
  if (data && typeof data === 'object' && 'product' in data && data.product) {
    return /** @type {Record<string, unknown>} */ (data.product);
  }
  return /** @type {Record<string, unknown>} */ (data);
}

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

async function putProductPrices(baseUrl, auth) {
  const dryRun = getEnv('DRY_RUN') === '1' || process.argv.includes('--dry-run');
  const { token, clientId } = auth;
  const orgId = getEnv('IMS_ORG_ID');

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...getCommerceStoreHeaders(),
  };
  if (clientId) {
    headers['x-api-key'] = clientId;
  }
  if (orgId) {
    headers['x-gw-ims-org-id'] = orgId;
  }

  const entries = Object.entries(EQUIPMENT_CATALOG_PRICES_USD);
  let ok = 0;
  let failed = 0;

  for (const [sku, price] of entries) {
    const url = buildProductUrl(baseUrl, sku);

    if (dryRun) {
      console.log(`[dry-run] GET ${url} then PUT price ${price}`);
      ok += 1;
    } else {
      const getRes = await fetch(url, { method: 'GET', headers });
      const getText = await getRes.text();
      let getData;
      try {
        getData = JSON.parse(getText);
      } catch {
        getData = {};
      }

      if (!getRes.ok) {
        console.error(
          `ERR GET ${sku} HTTP ${getRes.status}`,
          typeof getData === 'object' ? JSON.stringify(getData, null, 2) : getText,
        );
        failed += 1;
      } else {
        const existing = unwrapProduct(getData);
        const merged = stripProductReadOnly({
          ...existing,
          sku,
          price,
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
          console.log(`OK  ${sku} price=${price}`);
          ok += 1;
        } else {
          console.error(
            `ERR ${sku} HTTP ${response.status}`,
            typeof data === 'string' ? data : JSON.stringify(data, null, 2),
          );
          failed += 1;
        }
      }
    }
  }

  console.log(`\nDone: ${ok} succeeded, ${failed} failed${dryRun ? ' (dry run)' : ''}.`);
  if (failed > 0) {
    process.exit(1);
  }
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

  console.log('API base:', baseUrl);
  console.log('SKUs to update:', Object.keys(EQUIPMENT_CATALOG_PRICES_USD).length);

  let auth;
  if (dryRun) {
    console.log('Auth: skipped (dry run)');
    auth = { token: '', clientId: '' };
  } else {
    const presetToken = getEnv('COMMERCE_ACCESS_TOKEN');
    if (presetToken) {
      console.log('Auth: COMMERCE_ACCESS_TOKEN (Bearer)');
      auth = { token: presetToken, clientId: getEnv('IMS_CLIENT_ID') || '' };
    } else {
      console.log('Auth: Adobe IMS client credentials');
      const { accessToken, clientId } = await getImsAccessToken();
      auth = { token: accessToken, clientId };
    }
  }

  await putProductPrices(baseUrl, auth);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
