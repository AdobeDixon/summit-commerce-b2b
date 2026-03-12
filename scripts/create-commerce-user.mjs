#!/usr/bin/env node
/**
 * Create a customer in Adobe Commerce via REST API.
 * Requires Adobe IMS server-to-server credentials.
 *
 * Usage:
 *   node scripts/create-commerce-user.mjs [email] [password]
 *   npm run create-user -- rob@adobedemo.com Password1
 *
 * Env vars (also support CYPRESS_ prefix, or use .env in project root):
 *   API_ENDPOINT  - REST base URL (optional; derived from config.json if not set)
 *   IMS_CLIENT_ID, IMS_ORG_ID, IMS_CLIENT_SECRET - Adobe IMS credentials
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

// Load .env from project root or cypress support folder (same as tokenManager)
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

const email = process.argv[2] || 'rob@adobedemo.com';
const password = process.argv[3] || 'Password1';

function getEnv(name) {
  return process.env[name] || process.env[`CYPRESS_${name}`];
}

function getApiEndpoint() {
  const endpoint = getEnv('API_ENDPOINT');
  if (endpoint) return endpoint.replace(/\/graphql$/, '');

  // Derive from config.json
  try {
    const configPath = join(__dirname, '..', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const graphqlUrl = config?.public?.default?.['commerce-endpoint'];
    if (graphqlUrl) {
      return graphqlUrl.replace(/\/graphql$/, '');
    }
  } catch (e) {
    // ignore
  }
  return null;
}

async function getAccessToken() {
  const clientId = getEnv('IMS_CLIENT_ID');
  const clientSecret = getEnv('IMS_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing IMS credentials. Set IMS_CLIENT_ID and IMS_CLIENT_SECRET (or CYPRESS_IMS_CLIENT_ID, CYPRESS_IMS_CLIENT_SECRET)'
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

async function createCustomer(baseUrl, token, customerData) {
  const orgId = getEnv('IMS_ORG_ID');
  const clientId = getEnv('IMS_CLIENT_ID');

  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'x-api-key': clientId,
  };
  if (orgId) headers['x-gw-ims-org-id'] = orgId;

  const payload = {
    customer: {
      email: customerData.email,
      firstname: customerData.firstname || 'Rob',
      lastname: customerData.lastname || 'Demo',
      website_id: 1,
      store_id: 1,
      group_id: 1,
    },
    password: customerData.password,
  };

  const url = `${baseUrl}/V1/customers`;
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  return { status: response.status, statusText: response.statusText, data };
}

async function main() {
  const baseUrl = getApiEndpoint();
  if (!baseUrl) {
    console.error(
      'Could not determine API endpoint. Set API_ENDPOINT or ensure config.json has commerce-endpoint.'
    );
    process.exit(1);
  }

  console.log('Creating customer:', email);
  console.log('API base:', baseUrl);

  try {
    const token = await getAccessToken();
    const { status, statusText, data } = await createCustomer(baseUrl, token, {
      email,
      password,
      firstname: 'Rob',
      lastname: 'Demo',
    });

    if (status >= 200 && status < 300) {
      if (data?.id) {
        console.log('Customer created successfully.');
        console.log('  ID:', data.id);
        console.log('  Email:', data.email);
        console.log('  Name:', data.firstname, data.lastname);
      } else {
        console.log('Response:', JSON.stringify(data, null, 2));
      }
    } else {
      console.error('Failed to create customer.');
      console.error('Status:', status, statusText);
      console.error('Response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();
