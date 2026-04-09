#!/usr/bin/env node
/**
 * Link masonry SKUs to the same catalog category as legacy CHEP pallet products.
 *
 * B2B company roles often restrict purchasing by category. CHEP equipment uses category id 48;
 * masonry was only in "Brick" (e.g. 49), which can yield GraphQL user_errors code PERMISSION_DENIED
 * ("You cannot add … to the cart") even when shared catalog + MSI + websites are correct.
 *
 * This script GET-merge-PUTs extension_attributes.category_links to add the pallet category
 * without removing existing links (e.g. Brick 49).
 *
 * Env:
 *   PALLET_EQUIPMENT_CATEGORY_ID - Default 48 (match CHEP category_ids in your catalog)
 *   DRY_RUN=1
 *
 * Usage:
 *   node scripts/link-masonry-pallet-equipment-category.mjs
 *   npm run link-masonry-pallet-category
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

function withRestRoot(pathSegment) {
  const root = (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
  return root ? `${root}/${pathSegment}` : pathSegment;
}

function buildProductUrl(baseUrl, sku) {
  const segment = withRestRoot(`V1/products/${encodeURIComponent(sku)}`);
  return `${baseUrl.replace(/\/+$/, '')}/${segment}`;
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

/**
 * @param {number} categoryId
 * @param {Record<string, unknown>} ext
 */
function mergeCategoryLink(categoryId, ext) {
  const idStr = String(categoryId);
  const next = { ...ext };
  const links = Array.isArray(next.category_links) ? [...next.category_links] : [];
  if (!links.some((l) => String(l.category_id) === idStr)) {
    links.push({ position: links.length, category_id: idStr });
  }
  next.category_links = links;
  return next;
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
  const categoryId = Number.parseInt(getEnv('PALLET_EQUIPMENT_CATEGORY_ID') || '48', 10);
  if (Number.isNaN(categoryId)) {
    console.error('PALLET_EQUIPMENT_CATEGORY_ID must be a number.');
    process.exit(1);
  }

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
  console.log('Adding category_id', categoryId, '(pallet equipment category; CHEP uses this id).');

  let ok = 0;
  let failed = 0;

  for (const sku of FEATURED_EQUIPMENT_SKUS) {
    const productUrl = buildProductUrl(baseUrl, sku);

    if (dryRun) {
      console.log(`[dry-run] PUT ${sku} + category_links ${categoryId}`);
      ok += 1;
      continue;
    }

    const getRes = await fetch(productUrl, { method: 'GET', headers });
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
    const ext = /** @type {Record<string, unknown>} */ (
      existing.extension_attributes && typeof existing.extension_attributes === 'object'
        ? existing.extension_attributes
        : {}
    );
    const mergedExt = mergeCategoryLink(categoryId, ext);

    const merged = stripProductReadOnly({
      ...existing,
      extension_attributes: mergedExt,
    });

    const putRes = await fetch(productUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ product: merged }),
    });
    const putText = await putRes.text();
    if (putRes.ok) {
      console.log(`OK  ${sku} includes category ${categoryId}`);
      ok += 1;
    } else {
      console.error(`ERR PUT ${sku} HTTP ${putRes.status}`, putText.slice(0, 800));
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
