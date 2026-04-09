#!/usr/bin/env node
/**
 * List B2B shared catalogs (GET /V1/sharedCatalog) to pick SHARED_CATALOG_ID for
 * scripts/assign-masonry-shared-catalog.mjs when the company does not use the public catalog.
 *
 *   node scripts/list-shared-catalogs.mjs
 *   npm run list-shared-catalogs
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

async function main() {
  const baseUrl = getApiEndpoint();
  if (!baseUrl) {
    console.error('Set API_ENDPOINT or commerce-endpoint in config.json.');
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

  const params = new URLSearchParams();
  params.append('searchCriteria[pageSize]', '50');
  const segment = withRestRoot('V1/sharedCatalog');
  const url = `${baseUrl.replace(/\/+$/, '')}/${segment}?${params.toString()}`;

  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('Invalid JSON:', text);
    process.exit(1);
  }
  if (!res.ok) {
    console.error('GET failed:', res.status, text);
    process.exit(1);
  }

  const items = data.items ?? [];
  console.log(`API: ${baseUrl}\n`);
  console.log('id\ttype\tname');
  console.log('type: 0 = custom, 1 = public (Default General)\n');
  for (const c of items) {
    console.log(`${c.id}\t${c.type}\t${c.name}`);
  }
  if (!items.length) {
    console.log('(no shared catalogs returned)');
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
