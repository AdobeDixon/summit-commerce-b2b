#!/usr/bin/env node
/**
 * Place ONE order for joe@terrablock.com with brick SKUs (HCS-BR-*).
 *
 * - Requests 30 cart line inputs (6 SKUs × 5 passes, qty 1 each). Commerce merges identical
 *   SKUs → expect 6 order lines totaling 30 units (not 30 separate lines; needs 30 SKUs or Admin REST).
 * - Order date: GraphQL placeOrder uses server "now". Optional REST patch to March 2026 if
 *   COMMERCE_ACCESS_TOKEN or IMS_* is set and the API accepts entity save.
 *
 * Env: same family as create-joe-terrablocks-brick-orders.mjs
 *   CHEP_DEMO_CUSTOMER_EMAIL / CHEP_DEMO_CUSTOMER_PASSWORD
 *   CHEP_DEMO_SKIP_COMPANY, CHEP_DEMO_FREE_SHIPPING, CHEP_DEMO_PAYMENT_METHOD
 *   MARCH_ORDER_DATE=2026-03-15 (optional; used for REST patch attempt)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

for (const p of [path.join(repoRoot, '.env'), path.join(repoRoot, 'cypress', 'src', 'support', '.env')]) {
  if (fs.existsSync(p)) {
    const content = fs.readFileSync(p, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
    break;
  }
}

const CUSTOMER_EMAIL = process.env.CHEP_DEMO_CUSTOMER_EMAIL ?? 'joe@terrablock.com';
const CUSTOMER_PASSWORD = process.env.CHEP_DEMO_CUSTOMER_PASSWORD ?? 'Password1';
const SKIP_COMPANY_CONTEXT = process.env.CHEP_DEMO_SKIP_COMPANY === 'true'
  || process.env.CHEP_DEMO_SKIP_COMPANY === '1';
const CUSTOMER_TOKEN = process.env.CHEP_DEMO_CUSTOMER_TOKEN ?? '';
const USE_FREE_SHIPPING = process.env.CHEP_DEMO_FREE_SHIPPING === 'true'
  || process.env.CHEP_DEMO_FREE_SHIPPING === '1';
const DEFAULT_SHIPPING_METHOD = USE_FREE_SHIPPING
  ? { carrierCode: 'freeshipping', methodCode: 'freeshipping' }
  : { carrierCode: 'flatrate', methodCode: 'flatrate' };
const DEFAULT_PAYMENT_METHOD_CODE = process.env.CHEP_DEMO_PAYMENT_METHOD ?? 'checkmo';
const ORDER_SOURCE = 'BODEA';
const MARCH_ORDER_DATE = process.env.MARCH_ORDER_DATE ?? '2026-03-15';

const BRICK_SKUS = [
  'HCS-BR-FAC-WIRECUT-P450',
  'HCS-BR-ENG-CLASSAB-P350',
  'HCS-BR-CMU-SOLID-P450',
  'HCS-BR-COM-UTILITY-P450',
  'HCS-BR-PRF-MULTICELL-P450',
  'HCS-BR-AIR-VENT-P030',
];

/** 30 add-to-cart rows: cycle SKUs ×5 — merges to 6 lines @ qty 5 in standard Commerce. */
const THIRTY_CART_ROWS = Array.from({ length: 30 }, (_, i) => ({
  sku: BRICK_SKUS[i % BRICK_SKUS.length],
  quantity: 1,
}));

const CART_CUSTOM_ATTRIBUTE_CODES = Object.freeze({
  orderType: 'chep_order_type',
  transport: 'chep_transport',
  source: 'chep_source',
  siteId: 'chep_site_id',
  siteName: 'chep_site_name',
  contactName: 'chep_contact_name',
  contactPhone: 'chep_contact_phone',
  contactEmail: 'chep_contact_email',
  timeFrom: 'chep_time_from',
  timeTo: 'chep_time_to',
  isSevenDayOrder: 'chep_is_seven_day_order',
});

const GENERATE_CUSTOMER_TOKEN_MUTATION = `
  mutation GenerateCustomerToken($email: String!, $password: String!) {
    generateCustomerToken(email: $email, password: $password) { token }
  }
`;

const GET_CUSTOMER_QUERY = `query GetCustomer { customer { firstname lastname email } }`;

const GET_COMPANY_CONTEXT_QUERY = `
  query GetCustomerCompanies {
    customer { companies { items { id name status } } }
    company { id name status }
    customerGroup { uid }
  }
`;

const GET_CUSTOMER_ADDRESSES_QUERY = `
  query GetCustomerAddressesForOrders {
    customer {
      addresses {
        firstname lastname company city country_code
        region { region region_code region_id }
        telephone postcode street uid id
      }
    }
  }
`;

const GET_CUSTOMER_CART_QUERY = `
  query GetCustomerCart {
    cart: customerCart {
      id
      itemsV2(pageSize: 100, currentPage: 1) {
        items { uid product { sku } quantity }
      }
    }
  }
`;

const ADD_PRODUCTS_TO_CART_MUTATION = `
  mutation AddProductsToCart($cartId: String!, $cartItems: [CartItemInput!]!) {
    addProductsToCart(cartId: $cartId, cartItems: $cartItems) {
      cart {
        id
        itemsV2(pageSize: 100, currentPage: 1) {
          items { uid quantity product { sku } }
        }
      }
      user_errors { code message }
    }
  }
`;

const UPDATE_CART_ITEMS_MUTATION = `
  mutation UpdateCartItems($cartId: String!, $cartItems: [CartItemUpdateInput!]!) {
    updateCartItems(input: { cart_id: $cartId, cart_items: $cartItems }) {
      cart { id }
    }
  }
`;

const SET_SHIPPING_ADDRESS_MUTATION = `
  mutation SetShippingAddress($cartId: String!, $shippingAddress: ShippingAddressInput!) {
    setShippingAddressesOnCart(input: { cart_id: $cartId, shipping_addresses: [$shippingAddress] }) {
      cart { id }
    }
  }
`;

const SET_BILLING_ADDRESS_MUTATION = `
  mutation SetBillingAddress($cartId: String!, $billingAddress: BillingAddressInput!) {
    setBillingAddressOnCart(input: { cart_id: $cartId, billing_address: $billingAddress }) {
      cart { id }
    }
  }
`;

const SET_SHIPPING_METHOD_MUTATION = `
  mutation SetShippingMethods($cartId: String!, $shippingMethods: [ShippingMethodInput]!) {
    setShippingMethodsOnCart(input: { cart_id: $cartId, shipping_methods: $shippingMethods }) {
      cart { id }
    }
  }
`;

const SET_PAYMENT_METHOD_MUTATION = `
  mutation SetPaymentMethod($cartId: String!, $input: PaymentMethodInput!) {
    setPaymentMethodOnCart(input: { cart_id: $cartId, payment_method: $input }) {
      cart { id }
    }
  }
`;

const SET_CUSTOM_ATTRIBUTES_ON_CART_MUTATION = `
  mutation SetCustomAttributesOnCart($input: CartCustomAttributesInput!) {
    setCustomAttributesOnCart(input: $input) {
      cart { id custom_attributes { attribute_code value } }
    }
  }
`;

const PLACE_ORDER_MUTATION = `
  mutation PlaceOrder($cartId: String!) {
    placeOrder(input: { cart_id: $cartId }) {
      errors { code message }
      orderV2 { number id order_date status }
    }
  }
`;

const VERIFY_ORDER_QUERY = `
  query VerifyOrder($orderNumber: String!) {
    customer {
      orders(filter: { number: { eq: $orderNumber } }) {
        items {
          number order_date status
          items { product_name product_sku quantity_ordered }
          total { grand_total { value currency } }
        }
      }
    }
  }
`;

function trimString(value) {
  return String(value ?? '').trim();
}

function splitContactName(fullName) {
  const trimmedName = fullName.trim();
  const [firstName = '', ...lastNameParts] = trimmedName.split(/\s+/);
  return { firstName: firstName || 'Customer', lastName: lastNameParts.join(' ') || 'Contact' };
}

function regionString(addr) {
  const r = addr.region;
  if (!r) return '';
  return trimString(r.region || r.region_code || String(r.region_id ?? ''));
}

function streetLines(addr) {
  const raw = addr.street;
  if (Array.isArray(raw)) return raw.map((s) => String(s).trim()).filter(Boolean);
  if (typeof raw === 'string' && raw.trim()) return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function toShippingAddressInputFromSaved(addr, contact) {
  const lines = streetLines(addr);
  const { firstName, lastName } = splitContactName(
    [addr.firstname, addr.lastname].filter(Boolean).join(' ') || contact.name,
  );
  return {
    address: {
      firstname: trimString(addr.firstname) || firstName,
      lastname: trimString(addr.lastname) || lastName,
      company: trimString(addr.company || ''),
      street: lines.length ? lines : ['Address'],
      city: trimString(addr.city),
      region: regionString(addr),
      postcode: trimString(addr.postcode),
      country_code: trimString(addr.country_code),
      telephone: trimString(addr.telephone) || trimString(contact.phone) || '0000000000',
      save_in_address_book: false,
    },
  };
}

function addressBookSite(addr, index) {
  const id = trimString(addr.uid) || `addr-${trimString(addr.id) || index}`;
  const company = trimString(addr.company);
  const city = trimString(addr.city);
  const name = company || [addr.firstname, addr.lastname].filter(Boolean).join(' ') || city || `Address ${index + 1}`;
  return { id, name, address1: streetLines(addr)[0] || '', city, region: regionString(addr), postcode: trimString(addr.postcode), countryCode: trimString(addr.country_code) };
}

function createDeliveryDate() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  let added = 0;
  while (added <= 2) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

function formatGraphQlErrors(response) {
  return (response?.errors ?? []).map((e) => e.message).filter(Boolean);
}

function expectNoGraphQlErrors(response, context) {
  const messages = formatGraphQlErrors(response);
  if (messages.length) throw new Error(`${context}: ${messages.join(' ')}`);
}

function expectMutationErrors(errors, context) {
  if (!Array.isArray(errors) || !errors.length) return;
  const messages = errors.map((e) => e.message || e.code).filter(Boolean);
  throw new Error(`${context}: ${messages.join(' ')}`);
}

class FetchGraphQL {
  constructor() {
    this._endpoint = undefined;
    this._fetchGraphQlHeaders = {};
  }

  setEndpoint(endpoint) {
    this._endpoint = endpoint;
  }

  setFetchGraphQlHeader(key, value) {
    this._fetchGraphQlHeaders = { ...this._fetchGraphQlHeaders, [key]: value };
  }

  setFetchGraphQlHeaders(headers) {
    this._fetchGraphQlHeaders = { ...headers };
  }

  async fetchGraphQl(query, options = {}) {
    if (!this._endpoint) throw new Error('Missing GraphQL endpoint');
    const method = options.method ?? 'POST';
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json', ...this._fetchGraphQlHeaders };
    const response = await fetch(this._endpoint, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify({ query, variables: options.variables }) : undefined,
    });
    return response.json();
  }
}

function getEnv(name) {
  return process.env[name] || process.env[`CYPRESS_${name}`];
}

function getPublicConfig() {
  try {
    const configPath = path.join(repoRoot, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config?.public?.default ?? null;
  } catch {
    return null;
  }
}

function getApiBase() {
  const ep = getEnv('API_ENDPOINT');
  if (ep) return ep.replace(/\/graphql$/, '');
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
  if (cs?.['Magento-Store-View-Code']) h['Magento-Store-View-Code'] = cs['Magento-Store-View-Code'];
  if (cs?.['Magento-Website-Code']) h['Magento-Website-Code'] = cs['Magento-Website-Code'];
  const all = pub?.headers?.all;
  if (all?.Store && !h['Magento-Store-View-Code']) h.Store = all.Store;
  return h;
}

function getMagentoRestRoot() {
  return (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
}

/** Adobe Commerce as a Cloud Service (SaaS) API hosts — no /rest/ in path; scope via Store header. @see https://developer.adobe.com/commerce/webapi/rest/ */
function isAccsCommerceApiHost(baseUrl) {
  return typeof baseUrl === 'string' && baseUrl.includes('api.commerce.adobe.com');
}

/** Full prefix ending in `/V1` — ACCS: `{base}/V1`, PaaS: `{base}/rest/default/V1` when MAGENTO_REST_ROOT set. */
function buildRestV1BaseUrl(baseUrl) {
  const b = baseUrl.replace(/\/+$/, '');
  if (isAccsCommerceApiHost(baseUrl)) {
    return `${b}/V1`;
  }
  const root = getMagentoRestRoot();
  if (root) {
    return `${b}/${root}/V1`;
  }
  return `${b}/V1`;
}

/**
 * ACCS requires `Store` header; getCommerceStoreHeaders() often omits it when cs Magento-* is set.
 */
function buildCommerceAdminRestHeaders(token, clientId) {
  const pub = getPublicConfig();
  const storeScope = pub?.headers?.all?.Store ?? 'default';
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    Store: storeScope,
  };
  if (clientId) headers['x-api-key'] = clientId;
  const orgId = getEnv('IMS_ORG_ID');
  if (orgId) headers['x-gw-ims-org-id'] = orgId;
  return headers;
}

async function getImsAccessToken() {
  const clientId = getEnv('IMS_CLIENT_ID');
  const clientSecret = getEnv('IMS_CLIENT_SECRET');
  if (!clientId || !clientSecret) return null;
  const scope = getEnv('IMS_SCOPE')
    || 'openid,AdobeID,email,profile,additional_info.roles,additional_info.projectedProductContext,commerce.accs,org.read';
  const response = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
      scope,
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return { accessToken: data.access_token, clientId };
}

/** Shared IMS / Bearer token + V1 base for Admin REST (ACCS + PaaS). */
async function getCommerceAdminRestContext() {
  const baseUrl = getApiBase();
  if (!baseUrl) {
    throw new Error('No API base. Set API_ENDPOINT or commerce-endpoint in config.json.');
  }
  const v1Base = buildRestV1BaseUrl(baseUrl);
  let token = getEnv('COMMERCE_ACCESS_TOKEN');
  let clientId = getEnv('IMS_CLIENT_ID') || '';
  if (!token) {
    const ims = await getImsAccessToken();
    if (!ims?.accessToken) {
      throw new Error('Set COMMERCE_ACCESS_TOKEN or IMS_CLIENT_ID + IMS_CLIENT_SECRET in .env');
    }
    token = ims.accessToken;
    clientId = ims.clientId;
  }
  return { v1Base, headers: buildCommerceAdminRestHeaders(token, clientId) };
}

/**
 * Create invoice + shipment so order reaches complete state (Admin REST).
 * @see https://developer.adobe.com/commerce/webapi/rest/tutorials/orders/order-processing-tutorial/
 */
async function completeOrderInvoiceAndShip(incrementId) {
  const { v1Base, headers } = await getCommerceAdminRestContext();

  const searchUrl = `${v1Base}/orders?searchCriteria[filterGroups][0][filters][0][field]=increment_id&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(incrementId)}`;
  const searchRes = await fetch(searchUrl, { headers });
  const searchData = await searchRes.json().catch(() => ({}));
  const orderSummary = searchData?.items?.[0];
  if (!searchRes.ok || !orderSummary?.entity_id) {
    throw new Error(`Order ${incrementId} not found: ${searchRes.status} ${JSON.stringify(searchData).slice(0, 400)}`);
  }

  const orderId = orderSummary.entity_id;
  console.log('Resolved order', incrementId, '→ entity_id', orderId, 'state:', orderSummary.state, 'status:', orderSummary.status);

  if (orderSummary.state === 'complete' && orderSummary.status === 'complete') {
    console.log('Order is already complete; nothing to do.');
    return { orderId, invoiceSkipped: true, shipmentSkipped: true };
  }

  const orderRes = await fetch(`${v1Base}/orders/${orderId}`, { headers });
  const orderText = await orderRes.text();
  if (!orderRes.ok) {
    throw new Error(`GET /orders/${orderId} failed: ${orderRes.status} ${orderText.slice(0, 500)}`);
  }
  const order = JSON.parse(orderText);

  const baseInvoiced = Number(order.base_total_invoiced ?? 0);
  const baseGrand = Number(order.base_grand_total ?? 0);
  const needsInvoice = baseInvoiced < baseGrand - 0.0001;

  let invoiceId = null;
  if (needsInvoice) {
    /** Prefer capture invoice (lines up order state for shipping); fallback to generic invoice create. */
    let invRes = await fetch(`${v1Base}/order/${orderId}/invoice`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ capture: true, notify: false }),
    });
    let invText = await invRes.text();
    console.log('POST /order/{id}/invoice', invRes.status, invText.slice(0, 400));

    if (!invRes.ok && invRes.status === 404) {
      invRes = await fetch(`${v1Base}/invoices/`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ entity: { order_id: orderId } }),
      });
      invText = await invRes.text();
      console.log('POST /invoices/ (fallback)', invRes.status, invText.slice(0, 400));
    }

    if (!invRes.ok) {
      if (/invoice|invoiced|already|capture/i.test(invText)) {
        console.log('Invoice step reported an issue (may already be invoiced); continuing to shipment…');
      } else {
        throw new Error(`Invoice failed: ${invRes.status} ${invText.slice(0, 800)}`);
      }
    } else {
      try {
        const inv = JSON.parse(invText);
        invoiceId = inv.entity_id ?? inv.id ?? null;
        console.log('Invoice entity_id:', invoiceId);
      } catch {
        /* noop */
      }
    }
  } else {
    console.log('Order already fully invoiced (base_total_invoiced >= grand total); skipping invoice.');
  }

  const orderAfter = await fetch(`${v1Base}/orders/${orderId}`, { headers }).then((r) => r.json());
  const lineItems = Array.isArray(orderAfter.items) ? orderAfter.items : [];
  /**
   * MSI (on-prem / PaaS): source_code on lines. ACCS rejects SourceCode on shipment items — omit there.
   * @see https://developer.adobe.com/commerce/webapi/rest/
   */
  const sourceCode = getEnv('MAGENTO_INVENTORY_SOURCE_CODE') || 'default';
  const accsHost = isAccsCommerceApiHost(getApiBase());
  const shipLines = lineItems
    .map((it) => {
      const qtyOrdered = Number(it.qty_ordered ?? 0);
      const qtyShipped = Number(it.qty_shipped ?? 0);
      const remaining = qtyOrdered - qtyShipped;
      const oid = it.item_id ?? it.order_item_id;
      if (!oid || remaining <= 0) return null;
      const line = { order_item_id: oid, qty: remaining };
      if (!accsHost) {
        line.extension_attributes = { source_code: sourceCode };
      }
      return line;
    })
    .filter(Boolean);

  if (!shipLines.length) {
    console.log('No line items left to ship (or already shipped). State:', orderAfter.state, orderAfter.status);
    return { orderId, invoiceId, shipmentSkipped: true };
  }

  const tracks = [
    {
      track_number: `DEMO-${incrementId}`,
      title: 'Delivery',
      carrier_code: 'custom',
    },
  ];
  const shipOrderBody = {
    items: shipLines.map(({ order_item_id: orderItemId, qty }) => ({ order_item_id: orderItemId, qty })),
    tracks,
  };
  const shipEntityPayload = {
    entity: {
      order_id: orderId,
      items: shipLines,
      tracks,
    },
  };

  /** ACCS: POST /order/:id/ship (flat body) works; POST /shipment often returns generic 400. PaaS: try /shipment first (MSI). */
  let shipRes;
  let shipText;
  if (accsHost) {
    shipRes = await fetch(`${v1Base}/order/${orderId}/ship`, {
      method: 'POST',
      headers,
      body: JSON.stringify(shipOrderBody),
    });
    shipText = await shipRes.text();
    console.log('POST /order/{id}/ship', shipRes.status, shipText.slice(0, 500));
  } else {
    shipRes = await fetch(`${v1Base}/shipment`, {
      method: 'POST',
      headers,
      body: JSON.stringify(shipEntityPayload),
    });
    shipText = await shipRes.text();
    console.log('POST /shipment', shipRes.status, shipText.slice(0, 500));
    if (!shipRes.ok) {
      shipRes = await fetch(`${v1Base}/order/${orderId}/ship`, {
        method: 'POST',
        headers,
        body: JSON.stringify(shipOrderBody),
      });
      shipText = await shipRes.text();
      console.log('POST /order/{id}/ship (fallback)', shipRes.status, shipText.slice(0, 500));
    }
  }

  if (!shipRes.ok) {
    if (/ship|shipped|already/i.test(shipText)) {
      console.warn('Shipment endpoint error (may already be shipped):', shipText.slice(0, 300));
    } else {
      throw new Error(`Shipment failed: ${shipRes.status} ${shipText.slice(0, 800)}`);
    }
  }

  const final = await fetch(`${v1Base}/orders/${orderId}`, { headers }).then((r) => r.json());
  console.log('Final order state:', final.state, 'status:', final.status);
  return { orderId, invoiceId, state: final.state, status: final.status };
}

/**
 * Best-effort: load order by increment_id, PUT with created_at (Admin REST).
 */
async function tryPatchOrderCreatedAt(incrementId, isoDateLocal) {
  const baseUrl = getApiBase();
  const presetToken = getEnv('COMMERCE_ACCESS_TOKEN');
  let token = presetToken;
  let clientId = getEnv('IMS_CLIENT_ID') || '';
  if (!token) {
    const ims = await getImsAccessToken();
    if (!ims?.accessToken) {
      console.warn('[tryPatchOrderCreatedAt] No COMMERCE_ACCESS_TOKEN or IMS credentials; skip date patch.');
      return false;
    }
    token = ims.accessToken;
    clientId = ims.clientId;
  }

  const v1Base = buildRestV1BaseUrl(baseUrl);
  const searchUrl = `${v1Base}/orders?searchCriteria[filterGroups][0][filters][0][field]=increment_id&searchCriteria[filterGroups][0][filters][0][value]=${encodeURIComponent(incrementId)}`;

  const headers = buildCommerceAdminRestHeaders(token, clientId);

  const getRes = await fetch(searchUrl, { headers });
  const getData = await getRes.json().catch(() => ({}));
  const items = getData?.items;
  if (!getRes.ok || !Array.isArray(items) || !items[0]?.entity_id) {
    console.warn('[tryPatchOrderCreatedAt] Could not resolve order entity:', getRes.status, JSON.stringify(getData).slice(0, 500));
    return false;
  }

  const order = items[0];
  const putUrl = `${v1Base}/orders`;
  const body = {
    entity: {
      entity_id: order.entity_id,
      increment_id: order.increment_id,
      created_at: `${isoDateLocal} 12:00:00`,
    },
  };

  /** Magento saves orders via POST /V1/orders with `{ entity }`, not PUT (ACCS same path without /rest). */
  const putRes = await fetch(putUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  const putText = await putRes.text();
  console.log('[tryPatchOrderCreatedAt] POST /V1/orders save:', putRes.status, putText.slice(0, 500));
  return putRes.ok;
}

/** GET /V1/store/websites — smoke test for ACCS REST (Store header + bare /V1 path). */
async function probeRestConnectivity() {
  const baseUrl = getApiBase();
  if (!baseUrl) {
    throw new Error('No API base. Set API_ENDPOINT or commerce-endpoint in config.json.');
  }
  const v1Base = buildRestV1BaseUrl(baseUrl);
  console.log('REST probe — API base:', baseUrl);
  console.log('V1 base:', v1Base);
  console.log('ACCS host:', isAccsCommerceApiHost(baseUrl));

  let token = getEnv('COMMERCE_ACCESS_TOKEN');
  let clientId = getEnv('IMS_CLIENT_ID') || '';
  if (!token) {
    const ims = await getImsAccessToken();
    if (!ims?.accessToken) {
      throw new Error(
        'No token: set COMMERCE_ACCESS_TOKEN or IMS_CLIENT_ID + IMS_CLIENT_SECRET in .env',
      );
    }
    token = ims.accessToken;
    clientId = ims.clientId;
  }

  const headers = buildCommerceAdminRestHeaders(token, clientId);
  const url = `${v1Base}/store/websites`;
  console.log('GET', url);
  console.log('Headers: Authorization Bearer ***, Store:', headers.Store);

  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log('Status:', res.status);
  console.log('Body (first 1200 chars):', text.slice(0, 1200));
  if (!res.ok) {
    throw new Error(`REST probe failed with HTTP ${res.status}`);
  }

  const ordersUrl = `${v1Base}/orders?searchCriteria[pageSize]=1`;
  console.log('GET', ordersUrl);
  const ores = await fetch(ordersUrl, { headers });
  const otext = await ores.text();
  console.log('Orders list sample — Status:', ores.status);
  console.log('Body (first 600 chars):', otext.slice(0, 600));
}

async function loadCoreClient() {
  const configPath = path.join(repoRoot, 'config.json');
  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const config = rawConfig.public.default;
  const client = new FetchGraphQL();
  client.setEndpoint(config['commerce-endpoint']);
  client.setFetchGraphQlHeaders({ ...(config.headers?.all ?? {}), ...(config.headers?.cs ?? {}) });
  return { client, config };
}

async function authenticateCustomer(client) {
  let token = CUSTOMER_TOKEN;
  if (!token) {
    const tokenResponse = await client.fetchGraphQl(GENERATE_CUSTOMER_TOKEN_MUTATION, {
      method: 'POST',
      variables: { email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD },
    });
    expectNoGraphQlErrors(tokenResponse, 'generateCustomerToken failed');
    token = tokenResponse?.data?.generateCustomerToken?.token;
  }
  if (!token) throw new Error(`No customer token for ${CUSTOMER_EMAIL}.`);
  client.setFetchGraphQlHeader('Authorization', `Bearer ${token}`);
  const customerResponse = await client.fetchGraphQl(GET_CUSTOMER_QUERY, { method: 'POST' });
  expectNoGraphQlErrors(customerResponse, 'customer query failed');
  const customer = customerResponse?.data?.customer;
  if (!customer?.email) throw new Error('Missing customer.');
  if (customer.email.toLowerCase() !== CUSTOMER_EMAIL.toLowerCase()) {
    throw new Error(`Authenticated as ${customer.email} instead of ${CUSTOMER_EMAIL}.`);
  }
  return { token, customer };
}

async function applyCompanyContextHeader(client) {
  if (SKIP_COMPANY_CONTEXT) {
    console.log('Skipping company context (CHEP_DEMO_SKIP_COMPANY=true)');
    return null;
  }
  const response = await client.fetchGraphQl(GET_COMPANY_CONTEXT_QUERY, { method: 'POST' });
  if (formatGraphQlErrors(response).length) return null;
  const company = response?.data?.company ?? null;
  if (company?.id) client.setFetchGraphQlHeader('X-Adobe-Company', company.id);
  return company;
}

async function fetchCustomerAddresses(client) {
  const response = await client.fetchGraphQl(GET_CUSTOMER_ADDRESSES_QUERY, { method: 'POST' });
  expectNoGraphQlErrors(response, 'addresses query failed');
  return Array.isArray(response?.data?.customer?.addresses) ? response.data.customer.addresses : [];
}

async function getCustomerCart(client) {
  const response = await client.fetchGraphQl(GET_CUSTOMER_CART_QUERY, { method: 'POST' });
  expectNoGraphQlErrors(response, 'customerCart failed');
  const cart = response?.data?.cart;
  if (!cart?.id) throw new Error('No cart id.');
  return cart;
}

async function clearCart(client, cart) {
  const items = cart?.itemsV2?.items ?? [];
  if (!items.length) return cart;
  const response = await client.fetchGraphQl(UPDATE_CART_ITEMS_MUTATION, {
    method: 'POST',
    variables: { cartId: cart.id, cartItems: items.map((item) => ({ cart_item_uid: item.uid, quantity: 0 })) },
  });
  expectNoGraphQlErrors(response, 'clear cart failed');
  return response?.data?.updateCartItems?.cart ?? cart;
}

async function addProductsToCart(client, cartId, equipment) {
  const response = await client.fetchGraphQl(ADD_PRODUCTS_TO_CART_MUTATION, {
    method: 'POST',
    variables: { cartId, cartItems: equipment.map((line) => ({ sku: line.sku, quantity: Number(line.quantity) })) },
  });
  expectNoGraphQlErrors(response, 'addProductsToCart failed');
  expectMutationErrors(response?.data?.addProductsToCart?.user_errors, 'addProductsToCart user_errors');
  const cart = response?.data?.addProductsToCart?.cart;
  if (!cart?.id) throw new Error('addProductsToCart returned no cart.');
  return cart;
}

async function setShippingAddressFromSaved(client, cartId, payload) {
  const response = await client.fetchGraphQl(SET_SHIPPING_ADDRESS_MUTATION, {
    method: 'POST',
    variables: { cartId, shippingAddress: toShippingAddressInputFromSaved(payload.savedAddress, payload.contact) },
  });
  expectNoGraphQlErrors(response, 'setShippingAddressesOnCart failed');
}

async function setBillingAddress(client, cartId) {
  const response = await client.fetchGraphQl(SET_BILLING_ADDRESS_MUTATION, {
    method: 'POST',
    variables: {
      cartId,
      billingAddress: { same_as_shipping: true },
    },
  });
  expectNoGraphQlErrors(response, 'setBillingAddressOnCart failed');
}

async function setShippingMethod(client, cartId) {
  const response = await client.fetchGraphQl(SET_SHIPPING_METHOD_MUTATION, {
    method: 'POST',
    variables: {
      cartId,
      shippingMethods: [{ carrier_code: DEFAULT_SHIPPING_METHOD.carrierCode, method_code: DEFAULT_SHIPPING_METHOD.methodCode }],
    },
  });
  expectNoGraphQlErrors(response, 'setShippingMethodsOnCart failed');
}

async function setPaymentMethod(client, cartId) {
  const response = await client.fetchGraphQl(SET_PAYMENT_METHOD_MUTATION, {
    method: 'POST',
    variables: { cartId, input: { code: DEFAULT_PAYMENT_METHOD_CODE } },
  });
  expectNoGraphQlErrors(response, 'setPaymentMethodOnCart failed');
}

function buildOrderMetadata(payload) {
  return {
    orderType: 'single',
    transport: 'chep',
    source: trimString(payload.source || ORDER_SOURCE),
    siteId: trimString(payload.site?.id),
    siteName: trimString(payload.site?.name),
    contactName: trimString(payload.contact?.name),
    contactPhone: trimString(payload.contact?.phone),
    contactEmail: trimString(payload.contact?.email),
    timeFrom: trimString(payload.deliveryWindow?.from),
    timeTo: trimString(payload.deliveryWindow?.to),
    isSevenDayOrder: 'false',
  };
}

function buildCartCustomAttributesPayload(cartId, metadata) {
  const m = metadata;
  return {
    cart_id: cartId,
    custom_attributes: [
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.orderType, value: m.orderType },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.transport, value: m.transport },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.source, value: m.source },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.siteId, value: m.siteId },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.siteName, value: m.siteName },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.contactName, value: m.contactName },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.contactPhone, value: m.contactPhone },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.contactEmail, value: m.contactEmail },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.timeFrom, value: m.timeFrom },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.timeTo, value: m.timeTo },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.isSevenDayOrder, value: m.isSevenDayOrder },
    ],
  };
}

async function persistOrderMetadata(client, cartId, metadata) {
  const input = buildCartCustomAttributesPayload(cartId, metadata);
  const response = await client.fetchGraphQl(SET_CUSTOM_ATTRIBUTES_ON_CART_MUTATION, {
    method: 'POST',
    variables: { input },
  });
  expectNoGraphQlErrors(response, 'setCustomAttributesOnCart failed');
}

async function placeOrder(client, cartId) {
  const response = await client.fetchGraphQl(PLACE_ORDER_MUTATION, {
    method: 'POST',
    variables: { cartId },
  });
  expectNoGraphQlErrors(response, 'placeOrder failed');
  expectMutationErrors(response?.data?.placeOrder?.errors, 'placeOrder errors');
  const order = response?.data?.placeOrder?.orderV2;
  if (!order?.number) throw new Error('placeOrder returned no order number.');
  return order;
}

async function verifyOrder(client, orderNumber) {
  const response = await client.fetchGraphQl(VERIFY_ORDER_QUERY, {
    method: 'POST',
    variables: { orderNumber },
  });
  expectNoGraphQlErrors(response, 'verify order failed');
  const order = response?.data?.customer?.orders?.items?.[0] ?? null;
  if (!order?.number) throw new Error(`Order ${orderNumber} not found.`);
  return order;
}

async function main() {
  if (process.argv.includes('--probe-rest')) {
    await probeRestConnectivity();
    return;
  }

  const patchIdx = process.argv.indexOf('--patch-order');
  if (patchIdx !== -1) {
    const orderNumber = process.argv[patchIdx + 1];
    if (!orderNumber) {
      throw new Error('Usage: node scripts/create-joe-march-2026-brick-order.mjs --patch-order 000000048');
    }
    console.log('Patch-only: order', orderNumber, '→ created_at', MARCH_ORDER_DATE);
    const patched = await tryPatchOrderCreatedAt(orderNumber, MARCH_ORDER_DATE);
    if (!patched) {
      console.error('REST patch did not succeed (see logs above).');
      process.exit(1);
    }
    const { client } = await loadCoreClient();
    await authenticateCustomer(client);
    await applyCompanyContextHeader(client);
    const verified = await verifyOrder(client, orderNumber);
    console.log('GraphQL customer order_date after patch:', verified.order_date);
    console.log(JSON.stringify({
      orderNumber,
      order_date: verified.order_date,
      lineCount: verified.items?.length ?? 0,
    }, null, 2));
    return;
  }

  const completeIdx = process.argv.indexOf('--complete-order');
  if (completeIdx !== -1) {
    const orderNumber = process.argv[completeIdx + 1];
    if (!orderNumber) {
      throw new Error('Usage: node scripts/create-joe-march-2026-brick-order.mjs --complete-order 000000048');
    }
    const result = await completeOrderInvoiceAndShip(orderNumber);
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log('Customer:', CUSTOMER_EMAIL);
  console.log('Target historical date (REST patch attempt):', MARCH_ORDER_DATE);
  console.log('Cart rows requested:', THIRTY_CART_ROWS.length, '(expect ≤6 order lines after SKU merge, 30 units total)');

  const { client, config } = await loadCoreClient();
  console.log('Endpoint:', config['commerce-endpoint']);

  const { customer } = await authenticateCustomer(client);
  await applyCompanyContextHeader(client);

  const addresses = await fetchCustomerAddresses(client);
  if (!addresses.length) {
    throw new Error(`No saved addresses for ${CUSTOMER_EMAIL}. Add addresses and retry.`);
  }

  const savedAddress = addresses[0];
  const site = addressBookSite(savedAddress, 0);
  const contactName = [customer.firstname, customer.lastname].filter(Boolean).join(' ') || 'Customer';
  const payload = {
    source: ORDER_SOURCE,
    savedAddress,
    site,
    contact: {
      name: contactName,
      phone: trimString(savedAddress.telephone) || '0000000000',
      email: CUSTOMER_EMAIL,
    },
    deliveryWindow: { from: '08:00', to: '12:00' },
    deliveryDate: createDeliveryDate(),
  };

  let cart = await getCustomerCart(client);
  cart = await clearCart(client, cart);
  cart = await addProductsToCart(client, cart.id, THIRTY_CART_ROWS);

  const cartLines = cart?.itemsV2?.items ?? [];
  console.log('Cart lines after add (before checkout):', cartLines.length);

  await setShippingAddressFromSaved(client, cart.id, payload);
  await setBillingAddress(client, cart.id);
  await setShippingMethod(client, cart.id);
  await setPaymentMethod(client, cart.id);

  const metadata = buildOrderMetadata(payload);
  await persistOrderMetadata(client, cart.id, metadata);

  const order = await placeOrder(client, cart.id);
  console.log('Placed order:', order.number, 'initial order_date:', order.order_date);

  let verified = await verifyOrder(client, order.number);
  console.log('Verified line count:', verified.items?.length ?? 0);
  console.log('Items:', JSON.stringify(verified.items, null, 2));

  const patched = await tryPatchOrderCreatedAt(order.number, MARCH_ORDER_DATE);
  if (patched) {
    verified = await verifyOrder(client, order.number);
    console.log('After REST patch, order_date:', verified.order_date);
  } else {
    console.log('Order date remains server placement time unless Admin REST patch succeeded.');
  }

  console.log(JSON.stringify({
    orderNumber: order.number,
    orderDateGraphQl: verified.order_date,
    lineCount: verified.items?.length ?? 0,
    totalUnits: (verified.items ?? []).reduce((s, i) => s + Number(i.quantity_ordered || 0), 0),
    marchPatchAttempted: true,
  }, null, 2));
}

await main();
