#!/usr/bin/env node
/**
 * Set MSI source items for the six masonry SKUs (POST /V1/inventory/source-items).
 *
 * Two modes:
 *   1) Reference pallet (recommended — matches CHEP rows source-by-source):
 *        MASONRY_MSI_REFERENCE_SKU=CHEP-EU-WOOD-1200X800-03 npm run set-masonry-stock
 *      Copies every source-item row (source_code, quantity, status) from that SKU onto each HCS-BR-*.
 *   2) Manual single source + qty (legacy):
 *        MASONRY_STOCK_QTY=1000 MAGENTO_INVENTORY_SOURCE_CODE=default npm run set-masonry-stock
 *
 * Usage:
 *   node scripts/set-masonry-stock.mjs
 *   DRY_RUN=1 npm run set-masonry-stock
 *
 * Env:
 *   MASONRY_MSI_REFERENCE_SKU   - Pallet SKU to copy MSI rows from (e.g. CHEP-EU-WOOD-1200X800-03)
 *   MASONRY_STOCK_QTY           - Used only when MASONRY_MSI_REFERENCE_SKU is unset; default 1000
 *   MAGENTO_INVENTORY_SOURCE_CODE - Used only when reference SKU is unset; default "default"
 *   Same auth as other scripts: .env with IMS_* or COMMERCE_ACCESS_TOKEN
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

function buildInventorySourceItemsUrl(baseUrl) {
  const root = (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
  const segment = root ? `${root}/V1/inventory/source-items` : 'V1/inventory/source-items';
  return `${baseUrl.replace(/\/+$/, '')}/${segment}`;
}

function buildInventorySourceItemsGetUrl(baseUrl, sku) {
  const params = new URLSearchParams({
    'searchCriteria[pageSize]': '50',
    'searchCriteria[filterGroups][0][filters][0][field]': 'sku',
    'searchCriteria[filterGroups][0][filters][0][value]': sku,
    'searchCriteria[filterGroups][0][filters][0][condition_type]': 'eq',
  });
  return `${buildInventorySourceItemsUrl(baseUrl)}?${params.toString()}`;
}

/**
 * @param {string} baseUrl
 * @param {Record<string, string>} headers
 * @param {string} sku
 * @returns {Promise<Array<{ sku: string, source_code: string, quantity: number, status: number }>>}
 */
async function fetchSourceItemsForSku(baseUrl, headers, sku) {
  const url = buildInventorySourceItemsGetUrl(baseUrl, sku);
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('Invalid JSON from GET source-items:', text.slice(0, 400));
    return [];
  }
  if (!res.ok) {
    console.error('GET source-items failed:', res.status, text.slice(0, 400));
    return [];
  }
  return Array.isArray(data.items) ? data.items : [];
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
  const referenceSku = (getEnv('MASONRY_MSI_REFERENCE_SKU') || '').trim();
  const qty = Number.parseFloat(getEnv('MASONRY_STOCK_QTY') || '1000', 10);
  const sourceCode = getEnv('MAGENTO_INVENTORY_SOURCE_CODE') || 'default';

  let auth;
  const dryRunNeedsTemplate = dryRun && referenceSku;
  if (dryRun && !dryRunNeedsTemplate) {
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

  const url = buildInventorySourceItemsUrl(baseUrl);

  /** @type {Array<{ sku: string, source_code: string, quantity: number, status: number }>} */
  let sourceItems;

  if (referenceSku) {
    const template = await fetchSourceItemsForSku(baseUrl, headers, referenceSku);
    if (!template.length) {
      console.error(
        `No MSI source-items found for reference SKU "${referenceSku}". Check the SKU exists and has inventory rows.`,
      );
      process.exit(1);
    }
    console.log(`MSI template from reference SKU ${referenceSku}:`, JSON.stringify(template, null, 2));
    sourceItems = [];
    for (const masonrySku of FEATURED_EQUIPMENT_SKUS) {
      for (const row of template) {
        sourceItems.push({
          sku: masonrySku,
          source_code: row.source_code,
          quantity: Number(row.quantity),
          status: row.status !== undefined && row.status !== null ? Number(row.status) : 1,
        });
      }
    }
  } else {
    sourceItems = FEATURED_EQUIPMENT_SKUS.map((sku) => ({
      sku,
      source_code: sourceCode,
      quantity: qty,
      status: 1,
    }));
  }

  console.log('API base:', baseUrl);
  console.log('POST:', url);
  if (referenceSku) {
    console.log('Mode: copy MSI rows from reference pallet', referenceSku);
  } else {
    console.log('Mode: manual — source_code:', sourceCode, 'quantity:', qty);
  }
  console.log('Source-item rows to POST:', sourceItems.length);
  console.log('Masonry SKUs:', FEATURED_EQUIPMENT_SKUS.length);

  if (dryRun) {
    console.log('[dry-run] body:', JSON.stringify({ sourceItems }, null, 2));
    if (dryRunNeedsTemplate) {
      console.log('[dry-run] Skipped POST (reference template was loaded for preview).');
    }
    process.exit(0);
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sourceItems }),
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (response.ok) {
    console.log('OK  Stock updated for all masonry SKUs.');
    console.log('Response:', typeof data === 'string' ? data : JSON.stringify(data, null, 2));
    process.exit(0);
  }

  console.error(`ERR HTTP ${response.status}`, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  console.error(
    'If source is wrong, set MAGENTO_INVENTORY_SOURCE_CODE to your primary source (check Admin → Stores → Inventory → Sources).',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
