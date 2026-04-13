#!/usr/bin/env node
/* eslint-disable import/extensions, no-console, no-await-in-loop, no-restricted-syntax */
/**
 * Create 30 brick orders for joe@terrablock.com (HCS-BR-*), back-date (Jan/Feb/Mar 2026),
 * then invoice + ship each to complete.
 *
 *   node scripts/batch-joe-historic-orders.mjs
 *
 * Env (same as other Joe demo scripts):
 *   CHEP_DEMO_CUSTOMER_EMAIL / CHEP_DEMO_CUSTOMER_PASSWORD
 *   CHEP_DEMO_SKIP_COMPANY, CHEP_DEMO_FREE_SHIPPING, CHEP_DEMO_PAYMENT_METHOD
 *   IMS_* or COMMERCE_ACCESS_TOKEN — Admin REST for dates + invoice + ship
 *   JOE_BATCH_30_FORCE=true — ignore prior run state and start fresh
 *   BATCH_ORDER_DELAY_MS=750 — pause between orders (rate limits)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { completeOrderInvoiceAndShip, tryPatchOrderCreatedAt } from './lib/accs-admin-rest.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const runStateDir = path.join(repoRoot, '.demo-order-runs');
const runStatePath = path.join(runStateDir, 'joe-batch-30-historic.json');

for (const p of [path.join(repoRoot, '.env'), path.join(repoRoot, 'cypress', 'src', 'support', '.env')]) {
  try {
    const content = await fs.readFile(p, 'utf8');
    for (const line of content.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
    break;
  } catch {
    /* no .env */
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
const FORCE = process.env.JOE_BATCH_30_FORCE === 'true' || process.env.JOE_BATCH_30_FORCE === '1';
const DELAY_MS = Math.max(0, Number(process.env.BATCH_ORDER_DELAY_MS ?? 750));

/** 10 × Jan, 10 × Feb, 10 × Mar 2026 — varied calendar days. */
const BACKDATES = [
  '2026-01-04', '2026-01-07', '2026-01-10', '2026-01-14', '2026-01-17', '2026-01-20', '2026-01-23', '2026-01-26', '2026-01-29', '2026-01-31',
  '2026-02-03', '2026-02-06', '2026-02-09', '2026-02-12', '2026-02-15', '2026-02-18', '2026-02-21', '2026-02-24', '2026-02-26', '2026-02-28',
  '2026-03-02', '2026-03-05', '2026-03-08', '2026-03-11', '2026-03-14', '2026-03-17', '2026-03-20', '2026-03-23', '2026-03-26', '2026-03-29',
];

const BRICK_SKUS = [
  'HCS-BR-FAC-WIRECUT-P450',
  'HCS-BR-ENG-CLASSAB-P350',
  'HCS-BR-CMU-SOLID-P450',
  'HCS-BR-COM-UTILITY-P450',
  'HCS-BR-PRF-MULTICELL-P450',
  'HCS-BR-AIR-VENT-P030',
];

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

const GET_CUSTOMER_QUERY = `
  query GetCustomer {
    customer {
      firstname
      lastname
      email
    }
  }
`;

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
  return {
    id,
    name,
    address1: streetLines(addr)[0] || '',
    city,
    region: regionString(addr),
    postcode: trimString(addr.postcode),
    countryCode: trimString(addr.country_code),
  };
}

function createDeliveryDate(offsetDays) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  let added = 0;
  const target = offsetDays ?? 2;
  while (added <= target) {
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
  const messages = errors.map((error) => error.message || error.code).filter(Boolean);
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
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...this._fetchGraphQlHeaders,
    };
    const response = await fetch(this._endpoint, {
      method,
      headers,
      body: method === 'POST'
        ? JSON.stringify({ query, variables: options.variables })
        : undefined,
    });
    return response.json();
  }
}

/**
 * 6 brick lines, total units between 12 and 30 (max 30 items).
 * Distributes extra units across SKUs in a deterministic varied way.
 */
function buildEquipmentMix(orderIndex) {
  const totalUnits = 12 + (orderIndex % 19);
  const q = Array(BRICK_SKUS.length).fill(1);
  let rem = totalUnits - BRICK_SKUS.length;
  let p = orderIndex % BRICK_SKUS.length;
  while (rem > 0) {
    q[p % BRICK_SKUS.length] += 1;
    rem -= 1;
    p += 1 + ((orderIndex + p) % 3);
  }
  return BRICK_SKUS.map((sku, i) => ({ sku, quantity: q[i] }));
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

async function loadCoreClient() {
  const configPath = path.join(repoRoot, 'config.json');
  const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
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
    variables: {
      cartId: cart.id,
      cartItems: items.map((item) => ({ cart_item_uid: item.uid, quantity: 0 })),
    },
  });
  expectNoGraphQlErrors(response, 'clear cart failed');
  return response?.data?.updateCartItems?.cart ?? cart;
}

async function addProductsToCart(client, cartId, equipment) {
  const response = await client.fetchGraphQl(ADD_PRODUCTS_TO_CART_MUTATION, {
    method: 'POST',
    variables: {
      cartId,
      cartItems: equipment.map((line) => ({ sku: line.sku, quantity: Number(line.quantity) })),
    },
  });
  expectNoGraphQlErrors(response, 'addProductsToCart failed');
  expectMutationErrors(response?.data?.addProductsToCart?.user_errors, 'addProductsToCart user_errors');
  const nextCart = response?.data?.addProductsToCart?.cart;
  if (!nextCart?.id) throw new Error('addProductsToCart returned no cart.');
  return nextCart;
}

async function setShippingAddressFromSaved(client, cartId, payload) {
  const response = await client.fetchGraphQl(SET_SHIPPING_ADDRESS_MUTATION, {
    method: 'POST',
    variables: {
      cartId,
      shippingAddress: toShippingAddressInputFromSaved(payload.savedAddress, payload.contact),
    },
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
      shippingMethods: [
        {
          carrier_code: DEFAULT_SHIPPING_METHOD.carrierCode,
          method_code: DEFAULT_SHIPPING_METHOD.methodCode,
        },
      ],
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

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function writeRunState(state) {
  await fs.mkdir(runStateDir, { recursive: true });
  await fs.writeFile(runStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function loadRunState() {
  try {
    const raw = await fs.readFile(runStatePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function main() {
  if (BACKDATES.length !== 30) {
    throw new Error('BACKDATES must contain exactly 30 ISO dates.');
  }

  let runState = await loadRunState();
  if (runState?.status === 'complete' && !FORCE) {
    console.error(
      `Run already complete: ${path.relative(repoRoot, runStatePath)}. Set JOE_BATCH_30_FORCE=true to run again.`,
    );
    process.exit(1);
  }

  if (FORCE) {
    runState = null;
  }

  const { client, config } = await loadCoreClient();
  console.log('Commerce GraphQL:', config['commerce-endpoint']);
  console.log('Customer:', CUSTOMER_EMAIL);
  console.log('Orders to create: 30 (max 30 units / order, 6 brick lines each)');

  const { customer } = await authenticateCustomer(client);
  await applyCompanyContextHeader(client);

  const addresses = await fetchCustomerAddresses(client);
  if (!addresses.length) {
    throw new Error(`No saved addresses for ${CUSTOMER_EMAIL}.`);
  }

  let state;
  if (!FORCE && runState && Array.isArray(runState.orders) && runState.orders.length > 0 && runState.status !== 'complete') {
    state = {
      ...runState,
      status: 'in_progress',
    };
    delete state.error;
    delete state.failedAt;
    console.log(`Resuming after ${runState.orders.length} successful order(s).`);
  } else {
    state = {
      status: 'in_progress',
      customerEmail: CUSTOMER_EMAIL,
      startedAt: new Date().toISOString(),
      orders: [],
    };
  }

  const startIndex = state.orders.length;

  await writeRunState(state);

  for (let i = startIndex; i < 30; i += 1) {
    const backdate = BACKDATES[i];
    const addr = addresses[i % addresses.length];
    const site = addressBookSite(addr, i % addresses.length);
    const contactName = [customer.firstname, customer.lastname].filter(Boolean).join(' ') || 'Customer';
    const equipment = buildEquipmentMix(i);
    const totalUnits = equipment.reduce((s, l) => s + l.quantity, 0);

    const payload = {
      source: ORDER_SOURCE,
      savedAddress: addr,
      site,
      contact: {
        name: contactName,
        phone: trimString(addr.telephone) || '0000000000',
        email: CUSTOMER_EMAIL,
      },
      deliveryWindow: { from: '08:00', to: '12:00' },
      deliveryDate: createDeliveryDate(2 + (i % 3)),
    };

    console.log(`\n--- Order ${i + 1}/30 — backdate ${backdate} — ${totalUnits} units ---`);

    let orderNumber;
    try {
      let cart = await getCustomerCart(client);
      cart = await clearCart(client, cart);
      cart = await addProductsToCart(client, cart.id, equipment);

      await setShippingAddressFromSaved(client, cart.id, payload);
      await setBillingAddress(client, cart.id);
      await setShippingMethod(client, cart.id);
      await setPaymentMethod(client, cart.id);

      const metadata = buildOrderMetadata(payload);
      await persistOrderMetadata(client, cart.id, metadata);

      const order = await placeOrder(client, cart.id);
      orderNumber = order.number;
      console.log('Placed:', orderNumber);

      const patched = await tryPatchOrderCreatedAt(orderNumber, backdate);
      if (!patched) {
        throw new Error(`Back-date failed for ${orderNumber}`);
      }
      console.log('Back-dated created_at to', backdate);

      await completeOrderInvoiceAndShip(orderNumber);

      state.orders.push({
        index: i + 1,
        orderNumber,
        backdate,
        totalUnits,
        status: 'complete',
      });
    } catch (err) {
      state.status = 'failed';
      state.failedAt = new Date().toISOString();
      state.error = {
        index: i + 1,
        orderNumber: orderNumber ?? null,
        backdate,
        message: err.message,
        stack: err.stack,
      };
      await writeRunState(state);
      throw err;
    }

    await writeRunState(state);
    if (DELAY_MS > 0 && i < 29) {
      await sleep(DELAY_MS);
    }
  }

  state.status = 'complete';
  state.completedAt = new Date().toISOString();
  await writeRunState(state);

  console.log('\nDone. Order numbers:', state.orders.map((o) => o.orderNumber).join(', '));
  console.log(JSON.stringify({
    runStatePath: path.relative(repoRoot, runStatePath),
    count: state.orders.length,
    orders: state.orders,
  }, null, 2));
}

await main();
