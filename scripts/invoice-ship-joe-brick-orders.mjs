#!/usr/bin/env node
/**
 * Invoice and ship a random 50% of Joe's brick demo orders (REST API).
 * Uses the same auth as scripts/set-masonry-stock.mjs (IMS or COMMERCE_ACCESS_TOKEN).
 *
 * Order list:
 *   - Default: reads .demo-order-runs/joe-terrablocks-brick-orders.json (orderNumber fields)
 *   - Override: ORDER_NUMBERS=000000037,000000038,...
 *
 * Random selection:
 *   - Picks floor(N/2) orders at random (set INVOICE_SHIP_SEED for deterministic selection)
 *
 * Env:
 *   API_ENDPOINT, IMS_*, COMMERCE_ACCESS_TOKEN, IMS_ORG_ID, MAGENTO_REST_ROOT — same as other Commerce scripts
 *   DRY_RUN=1 — log chosen orders and HTTP targets only
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
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

function buildV1Url(baseUrl, segment) {
  const root = (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
  const path = root ? `${root}/${segment}` : segment;
  return `${baseUrl.replace(/\/+$/, '')}/${path}`;
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

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6D2B79F5;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(arr, seedStr) {
  const seedNum = [...seedStr].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 100000;
  const rand = mulberry32(seedNum);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function shuffleRandom(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadOrderNumbersFromRunState() {
  const runPath = join(projectRoot, '.demo-order-runs', 'joe-terrablocks-brick-orders.json');
  if (!existsSync(runPath)) {
    return null;
  }
  const data = JSON.parse(readFileSync(runPath, 'utf8'));
  const orders = data.orders ?? [];
  return orders.map((o) => o.orderNumber).filter(Boolean);
}

function buildAuthHeaders(token, clientId) {
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
  return headers;
}

async function restGet(baseUrl, headers, pathSegment) {
  const url = buildV1Url(baseUrl, pathSegment);
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, url };
}

async function restPost(baseUrl, headers, pathSegment, body) {
  const url = buildV1Url(baseUrl, pathSegment);
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { ok: res.ok, status: res.status, data, url };
}

/**
 * @param {string} baseUrl
 * @param {Record<string, string>} headers
 * @param {string} incrementId
 * @returns {Promise<object|null>}
 */
async function fetchOrderByIncrementId(baseUrl, headers, incrementId) {
  const q = new URLSearchParams({
    'searchCriteria[filterGroups][0][filters][0][field]': 'increment_id',
    'searchCriteria[filterGroups][0][filters][0][value]': incrementId,
    'searchCriteria[filterGroups][0][filters][0][condition_type]': 'eq',
    'searchCriteria[pageSize]': '1',
    'searchCriteria[currentPage]': '1',
  });
  const path = `V1/orders?${q.toString()}`;
  const { ok, data, status } = await restGet(baseUrl, headers, path);
  if (!ok) {
    throw new Error(`GET orders increment_id=${incrementId} HTTP ${status}: ${JSON.stringify(data)}`);
  }
  const items = data.items ?? [];
  return items[0] ?? null;
}

/**
 * @param {object} order
 * @returns {{ order_item_id: number, qty: number }[]}
 */
function buildShipItems(order) {
  const lines = order.items ?? [];
  const out = [];
  for (const line of lines) {
    const id = line.item_id ?? line.order_item_id;
    const ordered = Number(line.qty_ordered ?? line.qty ?? 0);
    const shipped = Number(line.qty_shipped ?? 0);
    const canceled = Number(line.qty_canceled ?? 0);
    const qty = Math.max(0, ordered - shipped - canceled);
    if (id != null && qty > 0) {
      out.push({ order_item_id: Number(id), qty });
    }
  }
  return out;
}

async function main() {
  const baseUrl = getApiEndpoint();
  if (!baseUrl) {
    console.error('Set API_ENDPOINT or commerce-endpoint in config.json.');
    process.exit(1);
  }

  let orderNumbers = (getEnv('ORDER_NUMBERS') || '')
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (!orderNumbers.length) {
    orderNumbers = loadOrderNumbersFromRunState();
  }

  if (!orderNumbers?.length) {
    console.error(
      'No order numbers. Set ORDER_NUMBERS or ensure .demo-order-runs/joe-terrablocks-brick-orders.json exists.',
    );
    process.exit(1);
  }

  const seedEnv = getEnv('INVOICE_SHIP_SEED');
  const seed = seedEnv || `random-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const shuffled = seedEnv
    ? shuffleWithSeed(orderNumbers, seedEnv)
    : shuffleRandom(orderNumbers);
  const half = Math.floor(orderNumbers.length / 2);
  const selected = shuffled.slice(0, half);
  const skipped = orderNumbers.filter((n) => !selected.includes(n));

  const dryRun = getEnv('DRY_RUN') === '1' || process.argv.includes('--dry-run');

  console.log(JSON.stringify({
    totalOrders: orderNumbers.length,
    invoiceAndShipCount: selected.length,
    selectedOrderNumbers: selected.sort(),
    skippedOrderNumbers: skipped.sort(),
    selectionSeed: seedEnv || '(Math.random shuffle)',
  }, null, 2));

  if (dryRun) {
    console.log('[dry-run] No REST calls.');
    return;
  }

  let auth;
  const presetToken = getEnv('COMMERCE_ACCESS_TOKEN');
  if (presetToken) {
    auth = { token: presetToken, clientId: getEnv('IMS_CLIENT_ID') || '' };
  } else {
    const { accessToken, clientId } = await getImsAccessToken();
    auth = { token: accessToken, clientId };
  }

  const headers = buildAuthHeaders(auth.token, auth.clientId);

  const results = [];
  for (const incrementId of selected) {
    const order = await fetchOrderByIncrementId(baseUrl, headers, incrementId);
    if (!order) {
      results.push({ incrementId, error: 'Order not found' });
      continue;
    }

    const entityId = order.entity_id;
    const state = order.status ?? order.state;

    if (state === 'complete' || state === 'closed') {
      results.push({
        incrementId,
        entityId,
        skipped: true,
        reason: `Already ${state}`,
      });
      continue;
    }

    const invoicePath = `V1/order/${entityId}/invoice`;
    const invRes = await restPost(baseUrl, headers, invoicePath, {
      capture: false,
      notify: false,
    });

    if (!invRes.ok) {
      const msg = String(invRes.data?.message ?? JSON.stringify(invRes.data));
      if (/invoice|already|invoiced/i.test(msg)) {
        console.warn(`Invoice skip/warn ${incrementId}: ${msg}`);
      } else {
        results.push({
          incrementId,
          entityId,
          error: 'invoice_failed',
          detail: invRes.data,
          status: invRes.status,
        });
        continue;
      }
    }

    const orderForShip = await fetchOrderByIncrementId(baseUrl, headers, incrementId) || order;
    const shipItems = buildShipItems(orderForShip);
    const shipPath = `V1/order/${entityId}/ship`;
    const shipBody = {
      items: shipItems.map((i) => ({
        order_item_id: i.order_item_id,
        qty: i.qty,
      })),
      tracks: [
        {
          carrier_code: 'custom',
          title: 'Ground',
          track_number: `TB-${incrementId}-${Date.now().toString(36)}`,
        },
      ],
      notify: false,
    };

    const shipRes = await restPost(baseUrl, headers, shipPath, shipBody);

    if (!shipRes.ok) {
      results.push({
        incrementId,
        entityId,
        error: 'ship_failed',
        invoiceOk: invRes.ok,
        detail: shipRes.data,
        status: shipRes.status,
      });
      continue;
    }

    const refreshed = await fetchOrderByIncrementId(baseUrl, headers, incrementId);
    results.push({
      incrementId,
      entityId,
      invoiceOk: true,
      shipOk: true,
      newStatus: refreshed?.status ?? null,
    });
    console.log(`OK ${incrementId} → status ${refreshed?.status}`);
  }

  const outDir = join(projectRoot, '.demo-order-runs');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'joe-brick-invoice-ship.json');
  writeFileSync(
    outPath,
    `${JSON.stringify({
      completedAt: new Date().toISOString(),
      seed,
      selected,
      skipped,
      results,
    }, null, 2)}\n`,
    'utf8',
  );

  console.log(`Wrote ${outPath}`);

  const failed = results.filter((r) => r.error);
  if (failed.length) {
    console.error('Failures:', JSON.stringify(failed, null, 2));
    process.exit(1);
  }
}

await main();
