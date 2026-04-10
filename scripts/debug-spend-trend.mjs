#!/usr/bin/env node
/* eslint-disable no-console -- CLI prints JSON diagnostics */
/**
 * Pull paginated customer.orders like the Bodea dashboard and print weekly spend buckets.
 *
 * Requires a bearer token (same as the storefront cookie auth_dropin_user_token):
 *   export COMMERCE_GRAPHQL_BEARER_TOKEN='...'
 * Optional B2B company scope (same as X-Adobe-Company header):
 *   export X_ADOBE_COMPANY='...'
 * Optional endpoint (defaults to config.json commerce-endpoint):
 *   export COMMERCE_GRAPHQL_URL='https://.../graphql'
 *
 * Usage:
 *   node scripts/debug-spend-trend.mjs
 *   node scripts/debug-spend-trend.mjs 4
 * (second arg = week count: 4, 8, or 12)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const envPaths = [
  path.join(repoRoot, '.env'),
  path.join(repoRoot, 'cypress', 'src', 'support', '.env'),
];
for (let pi = 0; pi < envPaths.length; pi += 1) {
  const p = envPaths[pi];
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n');
    for (let li = 0; li < lines.length; li += 1) {
      const line = lines[li];
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
    break;
  }
}

const DASHBOARD_DEMO_ORDER_NUMBER = '1002899';
const PAGE_SIZE = 100;
const MAX_PAGES = 15;
const DEFAULT_WEEKS = 12;

function readCommerceEndpoint() {
  try {
    const raw = fs.readFileSync(path.join(repoRoot, 'config.json'), 'utf8');
    const j = JSON.parse(raw);
    return j?.public?.default?.['commerce-endpoint'] ?? null;
  } catch {
    return null;
  }
}

function startOfIsoWeek(d) {
  const date = new Date(d.getTime());
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function dateKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getRollingNMondayKeys(weekCount) {
  const n = Math.min(Math.max(Math.floor(weekCount), 1), 52);
  const keys = [];
  const anchor = startOfIsoWeek(new Date());
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i * 7);
    keys.push(dateKeyLocal(d));
  }
  return keys;
}

function getSpendTrendWindowOldestMondayKey(weekCount = DEFAULT_WEEKS) {
  return getRollingNMondayKeys(weekCount)[0] ?? null;
}

const QUERY = `
  query GetDashboardOrders($currentPage: Int!, $pageSize: Int!) {
    customer {
      email
      orders(currentPage: $currentPage, pageSize: $pageSize) {
        total_count
        items {
          number
          order_date
          total {
            grand_total {
              value
              currency
            }
          }
        }
      }
    }
  }
`;

function aggregateWeekly(items, weekCount, demoNumber) {
  const slots = getRollingNMondayKeys(weekCount);
  const slotSet = new Set(slots);
  const amounts = new Map();
  const counts = new Map();
  let currency = 'USD';

  items.forEach((order) => {
    if (order.number === demoNumber) return;
    const createdRaw = order.order_date;
    if (!createdRaw) return;
    const d = new Date(createdRaw);
    if (Number.isNaN(d.getTime())) return;
    const weekStart = startOfIsoWeek(d);
    const key = dateKeyLocal(weekStart);
    if (!slotSet.has(key)) return;
    const val = Number(order.total?.grand_total?.value);
    if (Number.isNaN(val)) return;
    currency = order.total?.grand_total?.currency ?? currency;
    amounts.set(key, (amounts.get(key) ?? 0) + val);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return {
    slots: slots.map((key) => ({
      weekKey: key,
      amount: amounts.get(key) ?? 0,
      orderCount: counts.get(key) ?? 0,
    })),
    currency,
  };
}

async function main() {
  const token = process.env.COMMERCE_GRAPHQL_BEARER_TOKEN
    || process.env.CHEP_DEMO_CUSTOMER_TOKEN
    || process.env.AUTH_DROPIN_USER_TOKEN;
  const url = process.env.COMMERCE_GRAPHQL_URL || readCommerceEndpoint();
  const companyId = process.env.X_ADOBE_COMPANY || '';
  const weekArg = Number(process.argv[2]);
  const periodWeeks = [4, 8, 12].includes(weekArg) ? weekArg : DEFAULT_WEEKS;

  if (!token || !url) {
    console.error(
      'Set COMMERCE_GRAPHQL_BEARER_TOKEN (or CHEP_DEMO_CUSTOMER_TOKEN) and ensure config.json has commerce-endpoint, or set COMMERCE_GRAPHQL_URL.',
    );
    process.exit(1);
  }

  const windowOldestKey = getSpendTrendWindowOldestMondayKey(DEFAULT_WEEKS);
  const windowStartMs = windowOldestKey
    ? new Date(`${windowOldestKey}T00:00:00`).getTime()
    : 0;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    Store: 'default',
  };
  if (companyId) {
    headers['X-Adobe-Company'] = companyId;
  }

  const rawOrders = [];
  let totalCount = 0;
  let customerEmail = null;
  let page = 1;

  /* eslint-disable no-await-in-loop -- paginated storefront GraphQL */
  for (; page <= MAX_PAGES; page += 1) {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: QUERY,
        variables: { currentPage: page, pageSize: PAGE_SIZE },
      }),
    });
    const json = await res.json();
    if (json.errors?.length) {
      console.error('GraphQL errors:', JSON.stringify(json.errors, null, 2));
      process.exit(1);
    }
    const c = json.data?.customer;
    if (c?.email) customerEmail = c.email;
    const batch = c?.orders?.items ?? [];
    totalCount = c?.orders?.total_count ?? totalCount;
    rawOrders.push(...batch);

    const fetchedAll = rawOrders.length >= totalCount && totalCount > 0;
    const oldestOnPage = batch.length ? batch[batch.length - 1]?.order_date : null;
    const oldestMs = oldestOnPage ? new Date(oldestOnPage).getTime() : NaN;
    const pastWindow = windowStartMs > 0 && Number.isFinite(oldestMs) && oldestMs < windowStartMs;

    if (fetchedAll || batch.length < PAGE_SIZE || pastWindow) {
      break;
    }
  }
  /* eslint-enable no-await-in-loop */

  const dates = rawOrders
    .filter((o) => o.number !== DASHBOARD_DEMO_ORDER_NUMBER)
    .map((o) => o.order_date)
    .filter(Boolean)
    .sort();

  const full = aggregateWeekly(rawOrders, DEFAULT_WEEKS, DASHBOARD_DEMO_ORDER_NUMBER);
  const sliced = periodWeeks < DEFAULT_WEEKS
    ? { ...full, slots: full.slots.slice(-periodWeeks) }
    : full;

  console.log(JSON.stringify({
    customerEmail,
    graphqlUrl: url,
    companyHeader: companyId || '(none)',
    totalCountReported: totalCount,
    pagesFetched: page,
    ordersLoaded: rawOrders.length,
    orderDateOldest: dates[0] ?? null,
    orderDateNewest: dates[dates.length - 1] ?? null,
    rollingWindowOldestMonday: windowOldestKey,
    periodWeeksRequested: periodWeeks,
    weeklyBuckets12w: full.slots,
    weeklyBucketsForPeriod: sliced.slots,
    currency: full.currency,
  }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
