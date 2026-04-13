#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Seed company credit for the Terrablock B2B company (demo data).
 * Uses the same Adobe IMS + ACCS REST pattern as scripts/create-commerce-user.mjs
 * and cypress/src/support/b2bCompanyAPICalls.js.
 *
 * Prerequisites:
 * - Company named Terrablock exists (company_name matches search).
 * - Store has company credit enabled (GraphQL storeConfig.company_credit_enabled).
 * - Payment on Account is enabled store-wide: Admin → Stores → Configuration → Sales →
 *   Payment Methods → Payment on Account → Yes. (Not per-company; required for GraphQL
 *   company.credit and checkout. See Experience League “Payment on Account”.)
 *
 * Usage:
 *   node scripts/seed-terrablock-company-credit.mjs
 *   npm run seed-terrablock-credit
 *
 * Optional env (see .env.example):
 *   TERRABLOCK_COMPANY_NAME — default Terrablock
 *   TERRABLOCK_CREDIT_LIMIT — default 750000
 *   TERRABLOCK_CREDIT_CURRENCY — default USD (match config.json unless you know otherwise)
 *   DRY_RUN=1 — only resolve company + print planned actions
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const envPath = [join(projectRoot, '.env'), join(projectRoot, 'cypress', 'src', 'support', '.env')].find(
  (p) => existsSync(p),
);
if (envPath) {
  const content = readFileSync(envPath, 'utf8');
  content.split('\n').forEach((line) => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
    }
  });
}

function getEnv(name) {
  return process.env[name] || process.env[`CYPRESS_${name}`];
}

function getApiEndpoint() {
  const endpoint = getEnv('API_ENDPOINT');
  if (endpoint) return endpoint.replace(/\/graphql$/, '');

  try {
    const configPath = join(projectRoot, 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const graphqlUrl = config?.public?.default?.['commerce-endpoint'];
    if (graphqlUrl) {
      return graphqlUrl.replace(/\/graphql$/, '');
    }
  } catch {
    // ignore
  }
  return null;
}

async function getAccessToken() {
  const clientId = getEnv('IMS_CLIENT_ID');
  const clientSecret = getEnv('IMS_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing IMS credentials. Set IMS_CLIENT_ID and IMS_CLIENT_SECRET (or CYPRESS_*).',
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
  return data.access_token;
}

function apiHeaders(token) {
  const clientId = getEnv('IMS_CLIENT_ID');
  const orgId = getEnv('IMS_ORG_ID');
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-api-key': clientId,
  };
  if (orgId) headers['x-gw-ims-org-id'] = orgId;
  return headers;
}

function joinBasePath(baseUrl, path) {
  const base = baseUrl.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${base}${p}`;
}

async function apiGet(baseUrl, token, path, query) {
  const url = new URL(joinBasePath(baseUrl, path));
  if (query) {
    Object.entries(query).forEach(([k, v]) => url.searchParams.append(k, String(v)));
  }
  const res = await fetch(url.toString(), { headers: apiHeaders(token) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function apiPut(baseUrl, token, path, body) {
  const url = joinBasePath(baseUrl, path);
  const res = await fetch(url, {
    method: 'PUT',
    headers: apiHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function apiPost(baseUrl, token, path, body) {
  const url = joinBasePath(baseUrl, path);
  const res = await fetch(url, {
    method: 'POST',
    headers: apiHeaders(token),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data };
}

async function findCompaniesByName(baseUrl, token, name) {
  const query = {
    'searchCriteria[filterGroups][0][filters][0][field]': 'company_name',
    'searchCriteria[filterGroups][0][filters][0][value]': `%${name}%`,
    'searchCriteria[filterGroups][0][filters][0][conditionType]': 'like',
  };
  return apiGet(baseUrl, token, '/V1/company', query);
}

const OP_REIMBURSED = 4;
const OP_UPDATE = 2;

function movementPayload(currency, m) {
  if (m.type === 'increase') {
    return {
      path: '/increaseBalance',
      body: {
        value: m.value,
        currency,
        operationType: OP_REIMBURSED,
        comment: m.comment,
      },
    };
  }
  return {
    path: '/decreaseBalance',
    body: {
      value: m.value,
      currency,
      operationType: OP_UPDATE,
      comment: m.comment,
    },
  };
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1' || process.argv.includes('--dry-run');
  const companyName = getEnv('TERRABLOCK_COMPANY_NAME') || 'Terrablock';
  const creditLimit = Number(getEnv('TERRABLOCK_CREDIT_LIMIT') || '750000');
  const currency = (getEnv('TERRABLOCK_CREDIT_CURRENCY') || 'USD').toUpperCase();

  const baseUrl = getApiEndpoint();
  if (!baseUrl) {
    console.error(
      'Could not determine API endpoint. Set API_ENDPOINT or ensure config.json has commerce-endpoint.',
    );
    process.exit(1);
  }

  console.log('Terrablock company credit seed');
  console.log('  API base:', baseUrl);
  console.log('  Company search:', companyName);
  console.log('  Target limit:', creditLimit, currency);
  if (dryRun) console.log('  (dry run — no writes)');

  let token;
  try {
    token = await getAccessToken();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const found = await findCompaniesByName(baseUrl, token, companyName);
  if (!found.ok || found.data?.message) {
    console.error('Company search failed:', found.status, JSON.stringify(found.data));
    process.exit(1);
  }

  const items = found.data?.items || [];
  if (items.length === 0) {
    console.error(
      `No company found with company_name matching %${companyName}%. Create the company in Admin or adjust TERRABLOCK_COMPANY_NAME.`,
    );
    process.exit(1);
  }

  const company = items.find((c) => c.company_name === companyName) || items[0];
  const companyId = company.id;
  console.log(`  Resolved company: ${company.company_name} (id: ${companyId})`);

  const creditRes = await apiGet(baseUrl, token, `/V1/companyCredits/company/${companyId}`);
  if (!creditRes.ok || !creditRes.data?.id) {
    console.error(
      'Could not load company credit record. Is B2B company credit enabled for this store?',
      creditRes.status,
      JSON.stringify(creditRes.data),
    );
    process.exit(1);
  }

  const creditId = creditRes.data.id;
  console.log('  Company credit entity id:', creditId);

  if (dryRun) {
    console.log('Dry run complete. Unset DRY_RUN to apply.');
    process.exit(0);
  }

  const putPayload = {
    creditLimit: {
      id: creditId,
      company_id: companyId,
      credit_limit: creditLimit,
      currency_code: currency,
    },
  };

  console.log('Updating credit limit...');
  const updated = await apiPut(baseUrl, token, `/V1/companyCredits/${creditId}`, putPayload);
  if (!updated.ok && updated.data?.message) {
    console.error('PUT companyCredits failed:', updated.status, JSON.stringify(updated.data));
    process.exit(1);
  }
  console.log('  Credit limit set.');

  const movements = [
    {
      type: 'decrease',
      value: 128400.5,
      comment: 'Materials & regional hub orders — Feb cycle (demo)',
    },
    {
      type: 'increase',
      value: 22400.0,
      comment: 'Account repayment — wire ref TB-MAR-02 (demo)',
    },
    {
      type: 'decrease',
      value: 18750.25,
      comment: 'Stock replenishment — Manchester DC PO batch (demo)',
    },
    {
      type: 'increase',
      value: 10050.0,
      comment: 'Credit memo CM-TB-9921 — partial return (demo)',
    },
  ];

  await movements.reduce(async (prior, m, i) => {
    await prior;
    const { path, body } = movementPayload(currency, m);
    const fullPath = `/V1/companyCredits/${creditId}${path}`;
    console.log(`${i + 1}/${movements.length} ${m.type} ${m.value} ${currency}...`);
    const r = await apiPost(baseUrl, token, fullPath, body);
    if (!r.ok && r.data?.message) {
      console.error('Movement failed:', r.status, JSON.stringify(r.data));
      process.exit(1);
    }
    return Promise.resolve();
  }, Promise.resolve());

  console.log('Done. Review /customer/company/credit as a Terrablock company admin.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
