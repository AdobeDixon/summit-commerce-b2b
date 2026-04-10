/**
 * Bodea Dashboard Data Service
 *
 * Responsible for all Commerce GraphQL data fetching for the dashboard.
 * Keeps data access completely separate from UI rendering.
 *
 * DATA SOURCE NOTES:
 * - Customer orders: Real data via CORE_FETCH_GRAPHQL (authenticated customer context)
 * - Product details: Real data via CORE_FETCH_GRAPHQL (public catalog)
 * - Stock quantity: Attempts `stock_item.qty` (legacy catalog inventory) + `only_x_left_in_stock`.
 *   If Commerce does not expose granular qty via GraphQL (MSI not configured or B2B shared
 *   catalog restrictions), qty falls back to null and the UI renders stock_status only.
 *   Full inventory data requires MSI API or a warehouse management integration.
 */

import { getCookie } from '@dropins/tools/lib.js';
import { getConfigValue, getHeaders } from '@dropins/tools/lib/aem/configs.js';
import { CORE_FETCH_GRAPHQL, checkIsAuthenticated } from '../../scripts/commerce.js';
import { COMPANY_SESSION_STORAGE_KEY, ensureB2bCompanyGraphqlContext } from '../order-new-delivery/sites.js';
import {
  COMMERCE_REST_PATH_PREFIX,
  DEFAULT_SPEND_TREND_WEEKS,
  EQUIPMENT_DISPLAY_NAMES,
  FEATURED_EQUIPMENT_SKUS,
  PRIMARY_EQUIPMENT_SKU,
  SPEND_TREND_DATE_RANGE,
} from './dashboard-config.js';

const AUTH_DROPIN_TOKEN_COOKIE = 'auth_dropin_user_token';

/** Demo: artificially show this SKU as low stock on the dashboard */
const DEMO_LOW_STOCK_SKU = PRIMARY_EQUIPMENT_SKU;

/** Must match {@link getDemoOrderForDeliveryToday}; excluded from spend-trend math. */
export const DASHBOARD_DEMO_ORDER_NUMBER = '1002899';

/** Demo: fake order for delivery today — shown in Recent Orders, KPI, and Recent Deliveries */
function getDemoOrderForDeliveryToday() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    number: DASHBOARD_DEMO_ORDER_NUMBER,
    orderDate: `${today}T09:00:00.000Z`,
    status: 'processing',
    statusLabel: 'Processing',
    location: 'Manchester DC – Manchester',
    city: 'Manchester',
    items: [
      {
        name: EQUIPMENT_DISPLAY_NAMES[PRIMARY_EQUIPMENT_SKU],
        sku: PRIMARY_EQUIPMENT_SKU,
        qty: 50,
      },
      {
        name: EQUIPMENT_DISPLAY_NAMES['HCS-BR-ENG-CLASSAB-P350'],
        sku: 'HCS-BR-ENG-CLASSAB-P350',
        qty: 25,
      },
    ],
    primaryEquipment: EQUIPMENT_DISPLAY_NAMES[PRIMARY_EQUIPMENT_SKU],
    total: { value: 1250, currency: 'GBP' },
  };
}

function getSyntheticLowStockItem() {
  return {
    sku: DEMO_LOW_STOCK_SKU,
    name: EQUIPMENT_DISPLAY_NAMES[DEMO_LOW_STOCK_SKU],
    stockStatus: 'IN_STOCK',
    qty: 120,
    qtyIsReal: false,
    thumbnail: null,
  };
}

/* ── GraphQL Queries ───────────────────────────────────────────────────── */

// NOTE: sort argument intentionally omitted — its schema type varies across Magento 2.4.x
// patch releases (field/order vs sort_field/sort_direction) and causes silent failures.
// Orders return in default Commerce order (newest first in most environments).
// Adobe Commerce CustomerOrder uses shipping_address (singular), not shipping_addresses.
// Paginate until we cover the spend-trend rolling window (or hit a page cap): page 1 alone
// is not enough when the newest N orders are all recent — older weeks would show as empty.
const CUSTOMER_ORDERS_PAGE_SIZE = 100;
/** Stop after this many pages to avoid unbounded fetches (newest-first pages). */
const DASHBOARD_ORDERS_MAX_PAGES = 15;

const CUSTOMER_ORDERS_QUERY = `
  query GetDashboardOrders($currentPage: Int!, $pageSize: Int!) {
    customer {
      firstname
      lastname
      email
      orders(currentPage: $currentPage, pageSize: $pageSize) {
        total_count
        page_info {
          current_page
          total_pages
          page_size
        }
        items {
          number
          order_date
          status
          items {
            product_name
            product_sku
            quantity_ordered
          }
          shipping_address {
            city
            company
            firstname
            lastname
          }
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

const EQUIPMENT_PRODUCTS_QUERY = `
  query GetEquipmentProducts($skus: [String!]!) {
    products(filter: { sku: { in: $skus } }) {
      items {
        sku
        name
        stock_status
        only_x_left_in_stock
        thumbnail {
          url
          label
        }
        ... on SimpleProduct {
          stock_item {
            qty
            is_in_stock
          }
        }
      }
    }
  }
`;

/* ── Data Transformers ─────────────────────────────────────────────────── */

/**
 * Normalise a raw Commerce order into a clean dashboard order object.
 */
function normaliseOrder(rawOrder) {
  const shippingAddr = rawOrder.shipping_address ?? rawOrder.shipping_addresses?.[0] ?? null;

  return {
    number: rawOrder.number,
    orderDate: rawOrder.order_date,
    status: rawOrder.status?.toLowerCase().replace(/\s+/g, '_') ?? 'unknown',
    statusLabel: rawOrder.status ?? 'Unknown',
    location: shippingAddr
      ? [shippingAddr.company, shippingAddr.city].filter(Boolean).join(' – ')
      : null,
    city: shippingAddr?.city ?? null,
    items: (rawOrder.items ?? []).map((item) => ({
      name: item.product_name,
      sku: item.product_sku,
      qty: item.quantity_ordered,
    })),
    total: rawOrder.total?.grand_total ?? null,
    /** Primary equipment SKU is the first item line, used for display label */
    primaryEquipment: rawOrder.items?.[0]?.product_name ?? null,
  };
}

/**
 * Normalise raw Commerce product data into a clean stock object.
 *
 * Qty resolution order:
 *   1. stock_item.qty  — legacy catalog inventory (real Commerce data)
 *   2. only_x_left_in_stock — shown when below admin threshold (real data, partial)
 *   3. null — qty unavailable; UI should fall back to stock_status display only
 */
function normaliseProduct(rawProduct) {
  const stockItemQty = rawProduct.stock_item?.qty ?? null;
  const leftInStock = rawProduct.only_x_left_in_stock ?? null;

  let qty = null;
  if (stockItemQty !== null) {
    qty = Math.round(stockItemQty);
  } else if (leftInStock !== null) {
    qty = Math.round(leftInStock);
  }

  return {
    sku: rawProduct.sku,
    name: rawProduct.name,
    stockStatus: rawProduct.stock_status, // 'IN_STOCK' | 'OUT_OF_STOCK'
    qty,
    /** True when qty was sourced from real Commerce inventory data */
    qtyIsReal: stockItemQty !== null || leftInStock !== null,
    thumbnail: rawProduct.thumbnail?.url ?? null,
  };
}

/* ── Spend trend (REST: GET /V1/orders?dateRange=rolling12w) ─────────────── */

/**
 * Resolve core Commerce base URL (origin + optional locale path) from GraphQL endpoint config.
 * @returns {string|null}
 */
function resolveCoreCommerceBaseUrl() {
  const core = getConfigValue('commerce-core-endpoint') || getConfigValue('commerce-endpoint');
  if (!core || typeof core !== 'string') return null;
  try {
    const u = new URL(core);
    const path = u.pathname.replace(/\/graphql\/?$/i, '').replace(/\/$/, '');
    return `${u.origin}${path}`;
  } catch {
    return null;
  }
}

/**
 * Full URL for spend trend (rolling 12 weeks).
 * @returns {string|null}
 */
function buildSpendTrendOrdersUrl() {
  const base = resolveCoreCommerceBaseUrl();
  if (!base) return null;
  const prefix = COMMERCE_REST_PATH_PREFIX.replace(/\/$/, '');
  const params = new URLSearchParams({ dateRange: SPEND_TREND_DATE_RANGE });
  return `${base}${prefix}/V1/orders?${params.toString()}`;
}

function startOfIsoWeek(d) {
  const date = new Date(d.getTime());
  const day = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Local YYYY-MM-DD (avoids UTC day shift vs ISO string). */
function dateKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Oldest → newest: N Monday week-starts ending at the current ISO week.
 * @param {number} weekCount
 * @returns {string[]}
 */
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

/** Oldest Monday (YYYY-MM-DD) in the rolling spend window — pagination can stop once older. */
function getSpendTrendWindowOldestMondayKey(weekCount = DEFAULT_SPEND_TREND_WEEKS) {
  const keys = getRollingNMondayKeys(weekCount);
  return keys[0] ?? null;
}

function formatWeekLabel(weekStartDate) {
  try {
    return weekStartDate.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
  } catch {
    return '—';
  }
}

function orderGrandTotalToNumber(order) {
  const g = order?.grand_total;
  if (typeof g === 'number' && !Number.isNaN(g)) return { value: g, currency: order.order_currency_code ?? 'GBP' };
  if (g != null && typeof g === 'object') {
    const value = Number(g.base_grand_total ?? g.value ?? g.grand_total);
    const currency = g.currency_code ?? g.currency ?? 'GBP';
    if (!Number.isNaN(value)) return { value, currency };
  }
  const ext = order?.extension_attributes;
  if (ext?.grand_total != null) {
    const value = Number(ext.grand_total);
    if (!Number.isNaN(value)) return { value, currency: order.order_currency_code ?? 'GBP' };
  }
  return { value: NaN, currency: 'GBP' };
}

/**
 * Bucket REST order items into N rolling ISO weeks (fixed slots).
 * @param {object[]} items
 * @param {number} [weekCount]
 * @returns {{ points: Array<object>, currency: string, orderCount: number }}
 */
function aggregateOrdersIntoWeeklyPoints(items, weekCount = DEFAULT_SPEND_TREND_WEEKS) {
  const slots = getRollingNMondayKeys(weekCount);
  const slotSet = new Set(slots);
  const amounts = new Map();
  const counts = new Map();
  let currency = 'GBP';
  let orderCount = 0;

  items.forEach((order) => {
    const createdRaw = order.created_at ?? order.createdAt;
    if (!createdRaw) return;
    const d = new Date(createdRaw);
    if (Number.isNaN(d.getTime())) return;

    const weekStart = startOfIsoWeek(d);
    const key = dateKeyLocal(weekStart);
    if (!slotSet.has(key)) return;

    const { value, currency: cur } = orderGrandTotalToNumber(order);
    if (Number.isNaN(value)) return;
    currency = cur || currency;
    orderCount += 1;

    amounts.set(key, (amounts.get(key) ?? 0) + value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  const points = slots.map((key, idx) => {
    const weekStart = new Date(`${key}T12:00:00`);
    return {
      weekKey: key,
      weekIndex: idx,
      label: formatWeekLabel(weekStart),
      amount: amounts.get(key) ?? 0,
      orderCount: counts.get(key) ?? 0,
      currency,
    };
  });

  return {
    points,
    currency,
    orderCount,
    periodWeeks: weekCount,
  };
}

/**
 * Map API trend arrays (possibly without week keys) onto rolling N slots.
 */
function mergeTrendPointsOntoRollingN(
  incoming,
  currencyHint,
  weekCount = DEFAULT_SPEND_TREND_WEEKS,
) {
  const slots = getRollingNMondayKeys(weekCount);
  const slotSet = new Set(slots);
  const amounts = new Map();
  let cur = currencyHint ?? 'GBP';

  incoming.forEach((p, idx) => {
    const rawKey = p.weekKey ?? p.week_start ?? p.period_start ?? p.periodStart;
    const amt = Number(p.amount ?? p.total ?? p.grand_total ?? p.spend ?? p.value);
    if (Number.isNaN(amt)) return;
    cur = p.currency_code ?? p.currency ?? cur;
    if (typeof rawKey === 'string' && rawKey.length >= 10) {
      const key = rawKey.slice(0, 10);
      if (slotSet.has(key)) {
        amounts.set(key, (amounts.get(key) ?? 0) + amt);
      }
    } else if (incoming.length === weekCount && idx < weekCount) {
      amounts.set(slots[idx], amt);
    }
  });

  if (amounts.size === 0 && incoming.length === weekCount) {
    slots.forEach((key, idx) => {
      const p = incoming[idx];
      const amt = Number(p.amount ?? p.total ?? p.value);
      if (!Number.isNaN(amt)) amounts.set(key, amt);
      cur = p.currency ?? cur;
    });
  }

  const points = slots.map((key, idx) => {
    const weekStart = new Date(`${key}T12:00:00`);
    return {
      weekKey: key,
      weekIndex: idx,
      label: formatWeekLabel(weekStart),
      amount: amounts.get(key) ?? 0,
      orderCount: 0,
      currency: cur,
    };
  });

  return {
    points,
    currency: cur,
    orderCount: 0,
    periodWeeks: weekCount,
  };
}

/**
 * Trim rolling week points to the last N weeks (for period filter) and recompute totals.
 * Points are oldest → newest (see getRollingNMondayKeys).
 * @param {object} spendTrendData
 * @param {number} periodWeeks
 * @returns {object}
 */
export function sliceSpendTrendToPeriodWeeks(spendTrendData, periodWeeks) {
  if (spendTrendData == null || typeof spendTrendData !== 'object') {
    return spendTrendData;
  }
  const pts = spendTrendData.points ?? [];
  const pw = Math.min(Math.max(Math.floor(periodWeeks), 1), 52);
  if (!pts.length) {
    return addSpendTrendMetrics({ ...spendTrendData, periodWeeks: pw });
  }
  const sliced = pts.length <= pw ? pts : pts.slice(-pw);
  return addSpendTrendMetrics({
    ...spendTrendData,
    points: sliced,
    periodWeeks: sliced.length,
  });
}

function addSpendTrendMetrics(base) {
  const pts = base.points ?? [];
  const totalSpendPeriod = pts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  let oc = 0;
  if (typeof base.orderCount === 'number') {
    oc = base.orderCount;
  } else if (typeof base.orderCountPeriod === 'number') {
    oc = base.orderCountPeriod;
  } else if (typeof base.orderCount12w === 'number') {
    oc = base.orderCount12w;
  }
  const periodWeeks = typeof base.periodWeeks === 'number'
    ? base.periodWeeks
    : (pts.length || 1);
  const avgOrderValue = oc > 0 ? totalSpendPeriod / oc : null;
  const avgWeeklySpend = periodWeeks > 0 ? totalSpendPeriod / periodWeeks : 0;
  return {
    ...base,
    totalSpendPeriod,
    periodWeeks,
    orderCountPeriod: oc,
    avgOrderValue,
    avgWeeklySpend,
    totalSpend12w: totalSpendPeriod,
    orderCount12w: oc,
  };
}

/**
 * Build weekly spend from GraphQL dashboard orders for a rolling N-week window.
 * @param {{ orders?: object[] }} ordersData
 * @param {number} [periodWeeks]
 * @returns {object}
 */
export function buildSpendTrendFromOrders(ordersData, periodWeeks = DEFAULT_SPEND_TREND_WEEKS) {
  const list = (ordersData?.orders ?? []).filter(
    (o) => o && o.number !== DASHBOARD_DEMO_ORDER_NUMBER,
  );
  if (!list.length) {
    return addSpendTrendMetrics({
      points: [],
      currency: 'GBP',
      orderCount: 0,
      periodWeeks,
      error: null,
      source: 'graphql',
    });
  }

  const items = list
    .map((o) => {
      const val = o.total?.value;
      const num = typeof val === 'number' ? val : Number(val);
      return {
        created_at: o.orderDate,
        grand_total: num,
        order_currency_code: o.total?.currency ?? 'GBP',
      };
    })
    .filter((row) => row.created_at && !Number.isNaN(row.grand_total));

  const agg = aggregateOrdersIntoWeeklyPoints(items, periodWeeks);
  return addSpendTrendMetrics({
    points: agg.points,
    currency: agg.currency,
    orderCount: agg.orderCount,
    periodWeeks,
    error: null,
    source: 'graphql',
  });
}

/**
 * Snapshot for `?dashboardDebugSpend=1`: order dates vs weekly buckets (order # only).
 * @param {object} params
 * @returns {object}
 */
export function collectSpendTrendDebugSnapshot({
  ordersData,
  spendTrendData,
  resolved,
  pathUsed,
}) {
  const rows = (ordersData?.orders ?? []).filter(
    (o) => o && o.number !== DASHBOARD_DEMO_ORDER_NUMBER,
  );
  const dates = rows
    .map((o) => o.orderDate)
    .filter(Boolean)
    .sort();
  const sample = rows.slice(0, 8).map((o) => ({
    number: o.number,
    orderDate: o.orderDate,
    total: o.total?.value,
    currency: o.total?.currency,
  }));
  return {
    pathUsed,
    totalCountFromApi: ordersData?.totalCount,
    ordersLoadedExcludingDemo: rows.length,
    orderDateOldest: dates[0] ?? null,
    orderDateNewest: dates[dates.length - 1] ?? null,
    restPoints: (spendTrendData?.points ?? []).length,
    restError: spendTrendData?.error ?? null,
    resolvedSource: resolved?.source,
    resolvedPeriodWeeks: resolved?.periodWeeks,
    weeklyPoints: (resolved?.points ?? []).map((p) => ({
      weekKey: p.weekKey,
      amount: p.amount,
      orderCount: p.orderCount,
    })),
    totalSpendPeriod: resolved?.totalSpendPeriod,
    sampleOrdersNewestFirst: sample,
  };
}

/**
 * Normalise various API shapes into chart points.
 * Supports pre-aggregated arrays (`trend`, `points`, `series`, …) or Magento `items` orders list.
 */
function normaliseSpendTrendPayload(payload) {
  if (Array.isArray(payload)) {
    return normaliseSpendTrendPayload({ trend: payload });
  }
  if (payload == null || typeof payload !== 'object') {
    return { points: [], currency: 'GBP', error: null };
  }

  const currencyHint = payload.currency ?? payload.currency_code;
  const tryPoint = (raw) => {
    if (raw == null || typeof raw !== 'object') return null;
    const amount = Number(
      raw.amount ?? raw.total ?? raw.grand_total ?? raw.spend ?? raw.value ?? raw.order_total,
    );
    const label = String(
      raw.label ?? raw.week ?? raw.period ?? raw.period_label ?? raw.name ?? raw.week_start ?? '—',
    );
    const cur = raw.currency_code ?? raw.currency ?? currencyHint ?? 'GBP';
    if (Number.isNaN(amount)) return null;
    const weekKey = raw.weekKey ?? raw.week_start ?? raw.period_start ?? raw.periodStart ?? null;
    return {
      label,
      amount,
      currency: cur,
      weekKey,
    };
  };

  const arrayKeys = ['trend', 'points', 'series', 'weeks', 'data', 'spend_trend'];
  for (let i = 0; i < arrayKeys.length; i += 1) {
    const arr = payload[arrayKeys[i]];
    if (Array.isArray(arr) && arr.length) {
      const parsed = arr.map(tryPoint).filter((p) => p != null && p.amount >= 0);
      if (parsed.length) {
        const merged = mergeTrendPointsOntoRollingN(
          parsed,
          currencyHint ?? parsed[0].currency,
          DEFAULT_SPEND_TREND_WEEKS,
        );
        return { ...merged, error: null };
      }
    }
  }

  const { items } = payload;
  if (Array.isArray(items) && items.length) {
    const agg = aggregateOrdersIntoWeeklyPoints(items, DEFAULT_SPEND_TREND_WEEKS);
    return {
      points: agg.points,
      currency: currencyHint ?? agg.currency,
      orderCount: agg.orderCount,
      periodWeeks: agg.periodWeeks,
      error: null,
    };
  }

  return { points: [], currency: currencyHint ?? 'GBP', error: null };
}

/**
 * Fetch rolling 12-week spend trend from REST `GET /V1/orders?dateRange=rolling12w`.
 * @returns {Promise<{ points: Array, currency: string, error: string|null }>}
 */
async function fetchSpendTrend() {
  if (!checkIsAuthenticated()) {
    return { points: [], currency: 'GBP', error: null };
  }

  const url = buildSpendTrendOrdersUrl();
  const token = getCookie(AUTH_DROPIN_TOKEN_COOKIE);
  if (!url || !token) {
    console.warn('[DashboardService] Spend trend: missing REST URL or auth token.');
    return { points: [], currency: 'GBP', error: 'configuration' };
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...getHeaders('all'),
      },
      credentials: 'omit',
    });
  } catch (err) {
    console.warn('[DashboardService] Spend trend request failed:', err?.message ?? err);
    return { points: [], currency: 'GBP', error: 'network' };
  }

  if (!response.ok) {
    let bodySnippet = '';
    try {
      bodySnippet = (await response.text()).slice(0, 200);
    } catch {
      bodySnippet = '';
    }
    console.warn(
      '[DashboardService] Spend trend HTTP error:',
      response.status,
      response.statusText,
      bodySnippet,
    );
    return { points: [], currency: 'GBP', error: 'http' };
  }

  let json;
  try {
    json = await response.json();
  } catch (err) {
    console.warn('[DashboardService] Spend trend: invalid JSON', err?.message ?? err);
    return { points: [], currency: 'GBP', error: 'parse' };
  }

  const normalised = normaliseSpendTrendPayload(json);
  const merged = addSpendTrendMetrics({
    ...normalised,
    points: normalised.points ?? [],
  });
  console.info('[DashboardService] Spend trend loaded:', {
    pointCount: merged.points.length,
    currency: merged.currency,
  });
  return { ...merged, error: null };
}

/** GraphQL: company credit (fallback if REST unavailable). */
const GET_COMPANY_CREDIT_DASHBOARD = `
  query GetDashboardCompanyCredit {
    company {
      id
      credit {
        credit_limit {
          value
          currency
        }
        outstanding_balance {
          value
          currency
        }
        available_credit {
          value
          currency
        }
      }
    }
  }
`;

/**
 * Normalise Magento REST company credit record (GET .../V1/companyCredits/company/{companyId}).
 * @param {object} data
 * @returns {object|null}
 */
function normaliseRestCompanyCredit(data) {
  if (data == null || typeof data !== 'object') return null;
  const currency = data.currency_code ?? data.currencyCode ?? 'GBP';
  const toNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
  };

  let creditLimit = toNum(data.credit_limit ?? data.creditLimit);
  let outstanding = toNum(
    data.outstanding_balance
      ?? data.outstandingBalance
      ?? data.balance
      ?? data.company_balance,
  );
  let available = toNum(
    data.available_credit
      ?? data.availableCredit
      ?? data.available_balance
      ?? data.availableBalance,
  );

  if (!Number.isFinite(creditLimit)) creditLimit = NaN;
  if (!Number.isFinite(outstanding)) outstanding = 0;
  if (!Number.isFinite(available) && Number.isFinite(creditLimit)) {
    available = Math.max(0, creditLimit - outstanding);
  }
  if (!Number.isFinite(available)) return null;

  return {
    creditLimit,
    outstandingBalance: Math.max(0, outstanding),
    availableCredit: Math.max(0, available),
    currency,
    error: null,
  };
}

/**
 * REST: GET /V1/companyCredits/company/{companyId} (customer Bearer token).
 * @param {string|number} companyId
 * @returns {Promise<object|null>}
 */
async function fetchRestCompanyCreditByCompanyId(companyId) {
  if (companyId == null || companyId === '') return null;
  const base = resolveCoreCommerceBaseUrl();
  const token = getCookie(AUTH_DROPIN_TOKEN_COOKIE);
  const prefix = COMMERCE_REST_PATH_PREFIX.replace(/\/$/, '');
  if (!base || !token) return null;

  const url = `${base}${prefix}/V1/companyCredits/company/${companyId}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...getHeaders('all'),
      },
      credentials: 'omit',
    });
    if (!response.ok) return null;
    const json = await response.json();
    const rest = normaliseRestCompanyCredit(json);
    if (rest && Number.isFinite(rest.creditLimit)) {
      console.info('[DashboardService] Company credit loaded via REST');
      return { ...rest, source: 'rest' };
    }
  } catch (err) {
    console.warn('[DashboardService] Company credit REST failed:', err?.message ?? err);
  }
  return null;
}

/**
 * Company credit for dashboard: prefers REST
 * `GET /V1/companyCredits/company/{companyId}`, else GraphQL.
 * @returns {Promise<object>}
 */
async function fetchCompanyCreditDashboard() {
  if (!checkIsAuthenticated()) {
    return { error: null, skip: true };
  }

  const b2b = getConfigValue('commerce-b2b-enabled');
  if (b2b === false || b2b === 'false') {
    return { error: 'not_b2b' };
  }

  await ensureB2bCompanyGraphqlContext();

  let gqlRes;
  try {
    gqlRes = await CORE_FETCH_GRAPHQL.fetchGraphQl(GET_COMPANY_CREDIT_DASHBOARD, {
      method: 'GET',
      cache: 'no-cache',
    });
  } catch (err) {
    console.warn('[DashboardService] Company credit GraphQL failed:', err?.message ?? err);
    const sid = sessionStorage.getItem(COMPANY_SESSION_STORAGE_KEY);
    const restFallback = sid ? await fetchRestCompanyCreditByCompanyId(sid) : null;
    return restFallback ?? { error: 'network' };
  }

  if (gqlRes?.errors?.length) {
    const msg = gqlRes.errors.map((e) => e.message).join('; ');
    console.warn('[DashboardService] Company credit GraphQL errors:', msg);
    const sid = sessionStorage.getItem(COMPANY_SESSION_STORAGE_KEY);
    const restFallback = sid ? await fetchRestCompanyCreditByCompanyId(sid) : null;
    if (restFallback) return restFallback;
    if (/payment on account is disabled/i.test(msg)) {
      return { error: 'poa_disabled' };
    }
    return { error: 'graphql' };
  }

  const company = gqlRes?.data?.company;
  if (!company?.id) {
    const sid = sessionStorage.getItem(COMPANY_SESSION_STORAGE_KEY);
    const restFallback = sid ? await fetchRestCompanyCreditByCompanyId(sid) : null;
    return restFallback ?? { error: 'no_company' };
  }

  const restPreferred = await fetchRestCompanyCreditByCompanyId(company.id);
  if (restPreferred) return restPreferred;

  const c = company.credit;
  if (!c?.credit_limit) {
    return { error: 'no_credit' };
  }

  const creditLimit = Number(c.credit_limit.value);
  const outstandingBalance = Number(c.outstanding_balance?.value ?? 0);
  const availableCredit = Number(c.available_credit?.value ?? 0);
  const currency = c.credit_limit.currency || 'GBP';

  if (!Number.isFinite(creditLimit)) {
    return { error: 'no_credit' };
  }

  console.info('[DashboardService] Company credit loaded via GraphQL');
  return {
    creditLimit,
    outstandingBalance: Math.max(0, outstandingBalance),
    availableCredit: Math.max(0, availableCredit),
    currency,
    error: null,
    source: 'graphql',
  };
}

/**
 * Derive KPI summary values from real orders and stock data.
 *
 * DERIVATION NOTES:
 * - activeOrders:    total_count from customer.orders GraphQL query (real Commerce count)
 *                    This is the authoritative number — it is NOT capped by pageSize.
 * - deliveringToday: orders created on today's date with status = processing (proxy;
 *                    true "delivering today" requires fulfilment/TMS integration)
 * - pickupOrders:    orders with status = pending (proxy; pickup ≠ pending in all setups)
 * - lowStockAlerts:  products whose qty < LOW_STOCK_THRESHOLD or OUT_OF_STOCK (real)
 * - equipmentTypes:  count of distinct featured SKUs (config)
 */
export function deriveKpis(ordersData, stockData, lowStockThreshold) {
  const orders = ordersData?.orders ?? [];
  const totalOrders = ordersData?.totalCount ?? 0;
  const products = stockData ?? [];

  const today = new Date().toISOString().slice(0, 10);

  // Use the real Commerce total_count, not a count of the paginated slice.
  // Filtering the 10-item page would give 0 if all recent orders happen to be complete.
  const activeOrders = totalOrders;

  const deliveringToday = orders.filter(
    (o) => o.status === 'processing' && o.orderDate?.slice(0, 10) === today,
  ).length;

  const pickupOrders = orders.filter((o) => o.status === 'pending').length;

  const lowStockAlerts = products.filter((p) => {
    if (p.stockStatus === 'OUT_OF_STOCK') return true;
    if (p.qty !== null && p.qty < lowStockThreshold) return true;
    return false;
  }).length;

  return {
    totalOrders,
    activeOrders,
    deliveringToday,
    pickupOrders,
    lowStockAlerts,
    equipmentTypes: FEATURED_EQUIPMENT_SKUS.length,
  };
}

/* ── Lightweight customer identity query ───────────────────────────────── */

const CUSTOMER_IDENTITY_QUERY = `
  query GetCustomerIdentity {
    customer {
      firstname
      lastname
      email
    }
  }
`;

/* ── Service ───────────────────────────────────────────────────────────── */

export const DashboardService = {
  /**
   * Fetch just the customer's name and email.
   * Runs independently of the orders query so the topbar name always resolves.
   * Returns null if unauthenticated or the query fails.
   */
  async fetchCustomerIdentity() {
    if (!checkIsAuthenticated()) return null;

    let response;
    try {
      response = await CORE_FETCH_GRAPHQL.fetchGraphQl(CUSTOMER_IDENTITY_QUERY, {
        method: 'POST',
      });
    } catch (err) {
      console.warn('[DashboardService] Customer identity request failed:', err.message);
      return null;
    }

    if (response?.errors?.length) {
      console.warn('[DashboardService] Customer identity errors:', response.errors.map((e) => e.message).join('; '));
      return null;
    }

    const c = response?.data?.customer;
    if (!c) return null;

    console.info('[DashboardService] Customer identity loaded:', { firstname: c.firstname, email: c.email });
    return { firstname: c.firstname, lastname: c.lastname, email: c.email };
  },

  /**
   * Fetch recent orders for the authenticated customer.
   * Returns null if not authenticated or if the query fails.
   */
  async fetchOrders() {
    if (!checkIsAuthenticated()) {
      return null;
    }

    const windowOldestKey = getSpendTrendWindowOldestMondayKey(DEFAULT_SPEND_TREND_WEEKS);
    const windowStartMs = windowOldestKey
      ? new Date(`${windowOldestKey}T00:00:00`).getTime()
      : 0;

    let customer = null;
    const rawOrders = [];
    let totalCount = 0;
    let page = 1;

    /* Sequential pagination — must not parallelize or we may hit rate limits / skip pages. */
    /* eslint-disable no-await-in-loop -- one GraphQL page at a time */
    for (; page <= DASHBOARD_ORDERS_MAX_PAGES; page += 1) {
      let response;
      try {
        response = await CORE_FETCH_GRAPHQL.fetchGraphQl(CUSTOMER_ORDERS_QUERY, {
          method: 'POST',
          variables: {
            currentPage: page,
            pageSize: CUSTOMER_ORDERS_PAGE_SIZE,
          },
        });
      } catch (err) {
        console.warn('[DashboardService] Orders network request failed:', err.message);
        return null;
      }

      if (response?.errors?.length) {
        const msgs = response.errors.map((e) => e.message).join('; ');
        console.warn('[DashboardService] Orders GraphQL errors:', msgs);
        console.info('[DashboardService] Full error response:', response);
        return null;
      }

      const c = response?.data?.customer;

      if (!c) {
        console.warn('[DashboardService] Orders query returned no customer data.', {
          hasData: !!response?.data,
          keys: response?.data ? Object.keys(response.data) : [],
        });
        return null;
      }

      customer = c;
      const batch = c.orders?.items ?? [];
      totalCount = c.orders?.total_count ?? totalCount;
      rawOrders.push(...batch);

      const fetchedAll = rawOrders.length >= totalCount && totalCount > 0;
      const oldestOnPage = batch.length ? batch[batch.length - 1]?.order_date : null;
      const oldestMs = oldestOnPage ? new Date(oldestOnPage).getTime() : NaN;
      const pastWindow = windowStartMs > 0 && Number.isFinite(oldestMs) && oldestMs < windowStartMs;

      if (fetchedAll || batch.length < CUSTOMER_ORDERS_PAGE_SIZE || pastWindow) {
        break;
      }
    }
    /* eslint-enable no-await-in-loop */

    if (page > DASHBOARD_ORDERS_MAX_PAGES && rawOrders.length < totalCount) {
      console.warn(
        '[DashboardService] Orders pagination stopped at max pages;',
        'spend trend may miss older weeks if recent order volume is very high.',
        { totalCount, loaded: rawOrders.length },
      );
    }

    console.info('[DashboardService] Orders loaded:', {
      totalCount,
      itemCount: rawOrders.length,
      pages: page,
      firstname: customer?.firstname,
    });

    const normalisedOrders = rawOrders.map(normaliseOrder);
    // Only show demo enriched data (delivery today, etc.) when customer has real orders
    const orders = totalCount > 0
      ? [getDemoOrderForDeliveryToday(), ...normalisedOrders]
      : normalisedOrders;

    return {
      customer: {
        firstname: customer.firstname ?? '',
        lastname: customer.lastname ?? '',
        email: customer.email ?? '',
      },
      totalCount,
      orders,
    };
  },

  /**
   * Fetch product details and stock levels for the featured equipment SKUs.
   * This query is public (no authentication required for product catalog).
   * Returns an empty array if the query fails.
   */
  async fetchEquipmentStock() {
    let response;
    try {
      response = await CORE_FETCH_GRAPHQL.fetchGraphQl(EQUIPMENT_PRODUCTS_QUERY, {
        method: 'POST',
        variables: { skus: FEATURED_EQUIPMENT_SKUS },
      });
    } catch (err) {
      console.warn('[DashboardService] Equipment stock network request failed:', err.message);
      return [getSyntheticLowStockItem()];
    }

    if (response?.errors?.length) {
      const msgs = response.errors.map((e) => e.message).join('; ');
      console.warn('[DashboardService] Equipment stock GraphQL errors:', msgs);
      console.info('[DashboardService] Full stock error response:', response);
      return [getSyntheticLowStockItem()];
    }

    const items = response?.data?.products?.items ?? [];
    let products = items.map(normaliseProduct);

    /* Demo: artificially populate DEMO_LOW_STOCK_SKU as low stock */
    const existingIdx = products.findIndex((p) => p.sku === DEMO_LOW_STOCK_SKU);
    const syntheticLowStock = getSyntheticLowStockItem();
    if (existingIdx >= 0) {
      products[existingIdx] = { ...products[existingIdx], ...syntheticLowStock };
    } else {
      products = [syntheticLowStock, ...products];
    }

    console.info('[DashboardService] Equipment stock loaded:', {
      count: products.length,
      skus: products.map((i) => i.sku),
    });
    return products;
  },

  /**
   * Load all dashboard data in parallel.
   * Resolves with { customerIdentity, ordersData, stockData, spendTrendData, companyCreditData }.
   * Each field may be null/[] if its query fails — handled gracefully.
   */
  async loadAll() {
    const isAuthenticated = checkIsAuthenticated();
    if (isAuthenticated) {
      await ensureB2bCompanyGraphqlContext();
    }

    const [
      identityResult,
      ordersResult,
      stockResult,
      spendTrendResult,
      companyCreditResult,
    ] = await Promise.allSettled([
      isAuthenticated ? this.fetchCustomerIdentity() : Promise.resolve(null),
      isAuthenticated ? this.fetchOrders() : Promise.resolve(null),
      this.fetchEquipmentStock(),
      isAuthenticated
        ? fetchSpendTrend()
        : Promise.resolve({ points: [], currency: 'GBP', error: null }),
      isAuthenticated
        ? fetchCompanyCreditDashboard()
        : Promise.resolve({ error: null, skip: true }),
    ]);

    let spendTrendData = spendTrendResult.status === 'fulfilled'
      ? spendTrendResult.value
      : { points: [], currency: 'GBP', error: 'network' };

    const ordersDataResolved = ordersResult.status === 'fulfilled' ? ordersResult.value : null;

    /* REST spend-trend often unavailable; derive weekly totals from GraphQL orders when needed */
    if (
      ordersDataResolved?.orders?.length
      && (!spendTrendData.points?.length || spendTrendData.error)
    ) {
      const derived = buildSpendTrendFromOrders(ordersDataResolved, DEFAULT_SPEND_TREND_WEEKS);
      if (derived.points.length) {
        spendTrendData = {
          ...derived,
          error: null,
          source: 'graphql',
        };
      }
    }

    let companyCreditData = companyCreditResult.status === 'fulfilled'
      ? companyCreditResult.value
      : { error: 'network' };

    if (companyCreditData?.skip) {
      companyCreditData = { error: null };
    }

    return {
      customerIdentity: identityResult.status === 'fulfilled' ? identityResult.value : null,
      ordersData: ordersDataResolved,
      stockData: stockResult.status === 'fulfilled' ? stockResult.value : [],
      spendTrendData,
      companyCreditData,
    };
  },
};
