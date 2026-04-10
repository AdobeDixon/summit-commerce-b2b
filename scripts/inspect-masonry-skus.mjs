#!/usr/bin/env node
/**
 * Print salability-related fields for FEATURED_EQUIPMENT_SKUS from Adobe Commerce REST:
 * product status, visibility, stock_item (legacy), and MSI source-items.
 *
 *   npm run inspect-masonry-skus
 *
 * Use this to see if ordering fails due to out-of-stock / wrong source / disabled product,
 * vs B2B shared catalog assignment.
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

function buildSourceItemsBySkuUrl(baseUrl, sku) {
  const params = new URLSearchParams();
  params.append('searchCriteria[pageSize]', '20');
  params.append('searchCriteria[filterGroups][0][filters][0][field]', 'sku');
  params.append('searchCriteria[filterGroups][0][filters][0][value]', sku);
  params.append('searchCriteria[filterGroups][0][filters][0][condition_type]', 'eq');
  const segment = withRestRoot('V1/inventory/source-items');
  return `${baseUrl.replace(/\/+$/, '')}/${segment}?${params.toString()}`;
}

async function getImsAccessToken() {
  const clientId = getEnv('IMS_CLIENT_ID');
  const clientSecret = getEnv('IMS_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Missing IMS_CLIENT_ID / IMS_CLIENT_SECRET (or COMMERCE_ACCESS_TOKEN).');
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

function unwrapProduct(data) {
  if (data && typeof data === 'object' && data.product) return data.product;
  return data;
}

async function main() {
  const baseUrl = getApiEndpoint();
  if (!baseUrl) {
    console.error('Could not determine API base URL.');
    process.exit(1);
  }

  let auth;
  const presetToken = getEnv('COMMERCE_ACCESS_TOKEN');
  if (presetToken) {
    auth = { token: presetToken, clientId: getEnv('IMS_CLIENT_ID') || '' };
  } else {
    const { accessToken, clientId } = await getImsAccessToken();
    auth = { token: accessToken, clientId };
  }

  const orgId = getEnv('IMS_ORG_ID');
  const headers = {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
    ...getCommerceStoreHeaders(),
  };
  if (auth.clientId) headers['x-api-key'] = auth.clientId;
  if (orgId) headers['x-gw-ims-org-id'] = orgId;

  console.log('REST base:', baseUrl);
  console.log('Store headers:', JSON.stringify(getCommerceStoreHeaders()));
  console.log('');

  for (const sku of FEATURED_EQUIPMENT_SKUS) {
    const pUrl = buildProductUrl(baseUrl, sku);
    const pRes = await fetch(pUrl, { method: 'GET', headers });
    const pText = await pRes.text();
    let pData;
    try {
      pData = JSON.parse(pText);
    } catch {
      pData = {};
    }

    if (!pRes.ok) {
      console.log(`--- ${sku} ---`);
      console.log(`  GET product FAILED ${pRes.status}: ${pText.slice(0, 200)}`);
      console.log('');
      continue;
    }

    const p = unwrapProduct(pData);
    const si = p.stock_item || {};
    const ext = p.extension_attributes || {};

    console.log(`--- ${sku} ---`);
    console.log(`  name:           ${p.name}`);
    console.log(`  status:         ${p.status} (1=enabled)`);
    console.log(`  visibility:     ${p.visibility} (4=Catalog+Search)`);
    console.log(`  type_id:        ${p.type_id}`);
    console.log(`  attribute_set_id: ${p.attribute_set_id}`);
    console.log(`  price:          ${p.price}`);

    console.log('  stock_item (catalog view / legacy):');
    console.log(`    qty:            ${si.qty ?? 'n/a'}`);
    console.log(`    is_in_stock:    ${si.is_in_stock ?? 'n/a'}`);
    console.log(`    manage_stock:   ${si.manage_stock ?? 'n/a'}`);
    console.log(`    backorders:     ${si.backorders ?? 'n/a'}`);

    if (ext.website_ids) {
      console.log(`  extension_attributes.website_ids: ${JSON.stringify(ext.website_ids)}`);
    }

    const siUrl = buildSourceItemsBySkuUrl(baseUrl, sku);
    const sRes = await fetch(siUrl, { method: 'GET', headers });
    const sText = await sRes.text();
    let sData;
    try {
      sData = JSON.parse(sText);
    } catch {
      sData = {};
    }

    if (sRes.ok && Array.isArray(sData.items)) {
      if (sData.items.length === 0) {
        console.log('  MSI source-items: (none) — run npm run set-masonry-stock');
      } else {
        console.log('  MSI source-items:');
        for (const row of sData.items) {
          console.log(
            `    source=${row.source_code} qty=${row.quantity} status=${row.status} (1=in stock)`,
          );
        }
      }
    } else {
      console.log(`  MSI source-items GET failed: ${sRes.status} ${sText.slice(0, 300)}`);
    }

    console.log('');
  }

  console.log(
    'Notes:\n'
      + '  - Add-to-cart salability uses MSI salable qty + product enabled + (B2B) shared catalog.\n'
      + '  - If source-items are missing or qty=0, run: npm run set-masonry-stock\n'
      + '  - If still blocked, assign SKUs to the company shared catalog: npm run assign-masonry-shared-catalog',
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
