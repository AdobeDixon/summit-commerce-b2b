#!/usr/bin/env node
/**
 * Assign the six masonry SKUs to a B2B shared catalog (fixes “unavailable for shared catalog” on add-to-cart).
 *
 * Default: resolves the **public** shared catalog (type = 1), usually named “Default (General)”.
 * Override: set SHARED_CATALOG_ID to a specific catalog id.
 *
 * Usage:
 *   node scripts/assign-masonry-shared-catalog.mjs
 *   SHARED_CATALOG_ID=2 node scripts/assign-masonry-shared-catalog.mjs
 *   DRY_RUN=1 npm run assign-masonry-shared-catalog
 *
 * Env: same IMS / API as other Commerce scripts (.env).
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { FEATURED_EQUIPMENT_SKUS } from '../blocks/bodea-dashboard/dashboard-config.js';

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

function buildSharedCatalogSearchUrl(baseUrl) {
  const root = (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
  const segment = root ? `${root}/V1/sharedCatalog` : 'V1/sharedCatalog';
  const params = new URLSearchParams({
    'searchCriteria[pageSize]': '20',
    'searchCriteria[filter_groups][0][filters][0][field]': 'type',
    'searchCriteria[filter_groups][0][filters][0][value]': '1',
    'searchCriteria[filter_groups][0][filters][0][condition_type]': 'eq',
  });
  return `${baseUrl.replace(/\/+$/, '')}/${segment}?${params.toString()}`;
}

function buildAssignProductsUrl(baseUrl, catalogId) {
  const root = (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
  const segment = root
    ? `${root}/V1/sharedCatalog/${catalogId}/assignProducts`
    : `V1/sharedCatalog/${catalogId}/assignProducts`;
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

/**
 * @param {string} baseUrl
 * @param {Record<string, string>} headers
 * @returns {Promise<number|null>}
 */
async function resolvePublicSharedCatalogId(baseUrl, headers) {
  const forced = getEnv('SHARED_CATALOG_ID');
  if (forced) {
    const id = Number.parseInt(forced, 10);
    if (!Number.isNaN(id)) {
      console.log('Using SHARED_CATALOG_ID from env:', id);
      return id;
    }
  }

  const searchUrl = buildSharedCatalogSearchUrl(baseUrl);
  const res = await fetch(searchUrl, { method: 'GET', headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('Invalid JSON from shared catalog search:', text);
    return null;
  }

  if (!res.ok) {
    console.error('GET sharedCatalog search failed:', res.status, text);
    return null;
  }

  const items = data.items ?? [];
  const publicCat = items.find((c) => c.type === 1) ?? items[0];
  if (!publicCat?.id) {
    console.error('No shared catalog found. Set SHARED_CATALOG_ID manually.');
    return null;
  }

  console.log(
    `Resolved shared catalog: id=${publicCat.id} name="${publicCat.name}" type=${publicCat.type}`,
  );
  return publicCat.id;
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

  const catalogId = dryRun ? 0 : await resolvePublicSharedCatalogId(baseUrl, headers);
  if (!dryRun && catalogId == null) {
    process.exit(1);
  }

  const payload = {
    products: FEATURED_EQUIPMENT_SKUS.map((sku) => ({ sku })),
  };

  const assignUrl = buildAssignProductsUrl(baseUrl, catalogId || 0);

  console.log('API base:', baseUrl);
  console.log('SKUs:', FEATURED_EQUIPMENT_SKUS.join(', '));

  if (dryRun) {
    console.log('[dry-run] POST', assignUrl.replace(/\/0\//, '/{id}/'));
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  const postRes = await fetch(assignUrl, {
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
    console.log('OK  Products assigned to shared catalog', catalogId);
    console.log('Response:', postData === true ? 'true' : postText);
    process.exit(0);
  }

  console.error(
    `ERR HTTP ${postRes.status}`,
    typeof postData === 'string' ? postData : JSON.stringify(postData, null, 2),
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
