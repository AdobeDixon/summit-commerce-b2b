#!/usr/bin/env node
/**
 * Align masonry SKU website assignment with legacy CHEP pallet products.
 *
 * Observed: CHEP-* SKUs use extension_attributes.website_ids [1, 2] (Main Website + Bodea Website).
 * create-masonry-products.mjs only assigned website 1, so products were invisible / not salable
 * on the Bodea website (id 2) — a common cause of add-to-cart failures for that storefront.
 *
 * Usage:
 *   node scripts/assign-masonry-product-websites.mjs
 *   MASONRY_PRODUCT_WEBSITE_IDS=1,2 npm run assign-masonry-product-websites
 *   DRY_RUN=1 npm run assign-masonry-product-websites
 *
 * Env: same IMS / API as other Commerce scripts (.env).
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { FEATURED_EQUIPMENT_SKUS } from '../blocks/chep-dashboard/dashboard-config.js';

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
  if (graphqlUrl) return graphqlUrl.replace(/\/graphql$/, '');
  return null;
}

function getCommerceStoreHeaders() {
  const pub = getPublicConfig();
  const cs = pub?.headers?.cs;
  const h = {};
  if (cs?.['Magento-Store-Code']) h['Magento-Store-Code'] = cs['Magento-Store-Code'];
  if (cs?.['Magento-Store-View-Code']) {
    h['Magento-Store-View-Code'] = cs['Magento-Store-View-Code'];
  }
  if (cs?.['Magento-Website-Code']) {
    h['Magento-Website-Code'] = cs['Magento-Website-Code'];
  }
  const all = pub?.headers?.all;
  if (all?.Store && !h['Magento-Store-View-Code']) h.Store = all.Store;
  return h;
}

function buildProductUrl(baseUrl, sku) {
  const root = (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
  const segment = root ? `${root}/V1/products` : 'V1/products';
  return `${baseUrl.replace(/\/+$/, '')}/${segment}/${encodeURIComponent(sku)}`;
}

function unwrapProduct(data) {
  if (data && typeof data === 'object' && 'product' in data && data.product) {
    return data.product;
  }
  return data;
}

function stripProductReadOnly(product) {
  const p = { ...product };
  delete p.id;
  delete p.media_gallery_entries;
  delete p.options;
  delete p.product_links;
  return p;
}

function parseWebsiteIds() {
  const raw = getEnv('MASONRY_PRODUCT_WEBSITE_IDS') || '1,2';
  return raw
    .split(/[, ]+/)
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
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
    console.error('Could not determine API base URL.');
    process.exit(1);
  }

  const dryRun = getEnv('DRY_RUN') === '1' || process.argv.includes('--dry-run');
  const websiteIds = parseWebsiteIds();

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
  console.log('website_ids target:', JSON.stringify(websiteIds), '(match legacy CHEP: Main + Bodea)');

  let ok = 0;
  let failed = 0;

  for (const sku of FEATURED_EQUIPMENT_SKUS) {
    const url = buildProductUrl(baseUrl, sku);

    if (dryRun) {
      console.log(`[dry-run] PUT ${sku} extension_attributes.website_ids`, websiteIds);
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

    if (!getRes.ok) {
      console.error(`ERR GET ${sku}`, getRes.status, getText.slice(0, 400));
      failed += 1;
      continue;
    }

    const existing = unwrapProduct(getData);
    const ext = {
      ...(existing.extension_attributes &&
      typeof existing.extension_attributes === 'object'
        ? existing.extension_attributes
        : {}),
      website_ids: websiteIds,
    };

    const merged = stripProductReadOnly({
      ...existing,
      sku,
      extension_attributes: ext,
    });

    const putRes = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ product: merged }),
    });
    const putText = await putRes.text();

    if (putRes.ok) {
      console.log(`OK  ${sku} website_ids ->`, websiteIds.join(', '));
      ok += 1;
    } else {
      console.error(`ERR PUT ${sku} HTTP ${putRes.status}`, putText.slice(0, 600));
      failed += 1;
    }
  }

  console.log(`\nDone: ${ok} ok, ${failed} failed${dryRun ? ' (dry run)' : ''}.`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
