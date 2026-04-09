#!/usr/bin/env node
/**
 * Create a "Brick" category under the "Bodea" parent (or a configured parent id) and
 * link all FEATURED_EQUIPMENT_SKUS to it via category_links (GET-merge-PUT).
 *
 * This does **not** fix B2B "equipment SKUs unavailable / shared catalog" by itself —
 * that message is driven by shared catalog + salability. Use `assign-masonry-shared-catalog`
 * for the company’s catalog. Categories are for navigation/merchandising.
 *
 * Env (same as other Commerce scripts — .env or COMMERCE_ACCESS_TOKEN):
 *   BRICK_PARENT_CATEGORY_NAME  - Default "Bodea" (search exact name in category list)
 *   BRICK_PARENT_CATEGORY_ID      - If set, skip name search and use this parent id
 *   BRICK_CATEGORY_NAME           - Default "Brick" (child category to create or reuse)
 *   DRY_RUN=1
 *
 * Usage:
 *   node scripts/assign-masonry-brick-category.mjs
 *   BRICK_PARENT_CATEGORY_ID=42 node scripts/assign-masonry-brick-category.mjs
 *   npm run assign-masonry-brick-category
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

function withRestRoot(pathSegment) {
  const root = (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
  return root ? `${root}/${pathSegment}` : pathSegment;
}

function buildCategoriesListUrl(baseUrl, searchParams) {
  const segment = withRestRoot('V1/categories/list');
  const qs = searchParams.toString();
  return `${baseUrl.replace(/\/+$/, '')}/${segment}${qs ? `?${qs}` : ''}`;
}

function buildCategoriesPostUrl(baseUrl) {
  const segment = withRestRoot('V1/categories');
  return `${baseUrl.replace(/\/+$/, '')}/${segment}`;
}

function buildProductUrl(baseUrl, sku) {
  const segment = withRestRoot(`V1/products/${encodeURIComponent(sku)}`);
  return `${baseUrl.replace(/\/+$/, '')}/${segment}`;
}

/**
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
 * @param {Record<string, unknown>} product
 * @returns {Record<string, unknown>}
 */
function stripProductReadOnly(product) {
  const p = { ...product };
  delete p.id;
  delete p.media_gallery_entries;
  delete p.options;
  delete p.product_links;
  return p;
}

function searchCriteriaNameEquals(name) {
  const params = new URLSearchParams();
  params.append('searchCriteria[pageSize]', '20');
  params.append('searchCriteria[filterGroups][0][filters][0][field]', 'name');
  params.append('searchCriteria[filterGroups][0][filters][0][value]', name);
  params.append('searchCriteria[filterGroups][0][filters][0][condition_type]', 'eq');
  return params;
}

function searchCriteriaParentAndName(parentId, name) {
  const params = new URLSearchParams();
  params.append('searchCriteria[pageSize]', '20');
  params.append('searchCriteria[filterGroups][0][filters][0][field]', 'parent_id');
  params.append('searchCriteria[filterGroups][0][filters][0][value]', String(parentId));
  params.append('searchCriteria[filterGroups][0][filters][0][condition_type]', 'eq');
  params.append('searchCriteria[filterGroups][0][filters][1][field]', 'name');
  params.append('searchCriteria[filterGroups][0][filters][1][value]', name);
  params.append('searchCriteria[filterGroups][0][filters][1][condition_type]', 'eq');
  return params;
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
 * @param {URLSearchParams} params
 * @returns {Promise<Array<{ id: number, name?: string, parent_id?: number }>>}
 */
async function fetchCategoryList(baseUrl, headers, params) {
  const url = buildCategoriesListUrl(baseUrl, params);
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('Invalid JSON from categories/list:', text);
    return [];
  }
  if (!res.ok) {
    console.error('GET categories/list failed:', res.status, text);
    return [];
  }
  return Array.isArray(data.items) ? data.items : [];
}

/**
 * @param {number} parentCategoryId
 * @param {string} brickName
 * @param {string} baseUrl
 * @param {Record<string, string>} headers
 * @returns {Promise<number|null>}
 */
async function findOrCreateBrickCategory(parentCategoryId, brickName, baseUrl, headers) {
  const existing = await fetchCategoryList(
    baseUrl,
    headers,
    searchCriteriaParentAndName(parentCategoryId, brickName),
  );
  const found = existing.find(
    (c) => c.parent_id === parentCategoryId && c.name === brickName,
  );
  if (found?.id) {
    console.log(`Brick category already exists: id=${found.id} name="${brickName}"`);
    return found.id;
  }

  const postUrl = buildCategoriesPostUrl(baseUrl);
  const body = {
    category: {
      parent_id: parentCategoryId,
      name: brickName,
      is_active: true,
      include_in_menu: true,
    },
  };

  const postRes = await fetch(postUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const postText = await postRes.text();
  let postData;
  try {
    postData = JSON.parse(postText);
  } catch {
    postData = postText;
  }

  if (!postRes.ok) {
    console.error(
      `POST category failed HTTP ${postRes.status}`,
      typeof postData === 'string' ? postData : JSON.stringify(postData, null, 2),
    );
    return null;
  }

  const newId = typeof postData === 'number' ? postData : postData?.id;
  if (!newId) {
    console.error('POST category returned no id:', postText);
    return null;
  }
  console.log(`Created category "${brickName}" id=${newId} under parent ${parentCategoryId}`);
  return newId;
}

/**
 * @param {number} categoryId
 * @param {Record<string, unknown>} ext
 * @returns {Record<string, unknown>}
 */
function mergeCategoryLinks(categoryId, ext) {
  const idStr = String(categoryId);
  const next = { ...ext };
  const links = Array.isArray(next.category_links) ? [...next.category_links] : [];
  if (!links.some((l) => String(l.category_id) === idStr)) {
    links.push({ position: links.length, category_id: idStr });
  }
  next.category_links = links;
  return next;
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
  const parentName = getEnv('BRICK_PARENT_CATEGORY_NAME') || 'Bodea';
  const brickName = getEnv('BRICK_CATEGORY_NAME') || 'Brick';
  const forcedParentId = getEnv('BRICK_PARENT_CATEGORY_ID');

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

  let parentCategoryId = null;
  if (forcedParentId) {
    parentCategoryId = Number.parseInt(forcedParentId, 10);
    if (Number.isNaN(parentCategoryId)) {
      console.error('BRICK_PARENT_CATEGORY_ID must be a number.');
      process.exit(1);
    }
    console.log(`Using BRICK_PARENT_CATEGORY_ID=${parentCategoryId}`);
  } else {
    const matches = await fetchCategoryList(
      baseUrl,
      headers,
      searchCriteriaNameEquals(parentName),
    );
    const exact = matches.filter((c) => c.name === parentName);
    if (!exact.length) {
      console.error(
        `No category named "${parentName}" found. Create it in Admin (Catalog > Categories) `,
        'or set BRICK_PARENT_CATEGORY_ID to the parent category entity id.',
      );
      process.exit(1);
    }
    if (exact.length > 1) {
      console.warn(
        `Multiple categories named "${parentName}" found; using id=${exact[0].id}. `,
        'Set BRICK_PARENT_CATEGORY_ID to pick a specific one.',
      );
    }
    parentCategoryId = exact[0].id;
    console.log(`Parent category "${parentName}": id=${parentCategoryId}`);
  }

  if (dryRun) {
    console.log(`[dry-run] Would find or create "${brickName}" under parent ${parentCategoryId}`);
    console.log('[dry-run] Would link SKUs:', FEATURED_EQUIPMENT_SKUS.join(', '));
    process.exit(0);
  }

  const brickCategoryId = await findOrCreateBrickCategory(
    parentCategoryId,
    brickName,
    baseUrl,
    headers,
  );
  if (brickCategoryId == null) {
    process.exit(1);
  }

  let ok = 0;
  let failed = 0;

  for (const sku of FEATURED_EQUIPMENT_SKUS) {
    const productUrl = buildProductUrl(baseUrl, sku);
    const getRes = await fetch(productUrl, { method: 'GET', headers });
    const getText = await getRes.text();
    let getData;
    try {
      getData = JSON.parse(getText);
    } catch {
      getData = {};
    }

    if (!getRes.ok) {
      console.error(`ERR GET ${sku} HTTP ${getRes.status}`, getText.slice(0, 500));
      failed += 1;
      continue;
    }

    const existing = unwrapProduct(getData);
    const ext = /** @type {Record<string, unknown>} */ (
      existing.extension_attributes && typeof existing.extension_attributes === 'object'
        ? existing.extension_attributes
        : {}
    );
    const mergedExt = mergeCategoryLinks(brickCategoryId, ext);

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
      console.log(`OK  ${sku} -> category ${brickCategoryId}`);
      ok += 1;
    } else {
      console.error(`ERR PUT ${sku} HTTP ${putRes.status}`, putText.slice(0, 800));
      failed += 1;
    }
  }

  console.log(`\nDone: ${ok} linked, ${failed} failed. Brick category id=${brickCategoryId}.`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
