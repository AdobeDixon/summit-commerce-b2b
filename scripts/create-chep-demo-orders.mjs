#!/usr/bin/env node
/**
 * Create Bodea demo orders via Adobe Commerce API.
 *
 * Env vars:
 *   CHEP_DEMO_CUSTOMER_EMAIL    - Customer email (default: matt@adobedemo.com)
 *   CHEP_DEMO_CUSTOMER_PASSWORD - Customer password (default: Password1)
 *   CHEP_DEMO_MAX_PALLETS=40    - Use 10 orders with max 40 pallets each
 *   CHEP_DEMO_SKIP_COMPANY=true - Skip company context (if products not in company catalog)
 *   CHEP_DEMO_SKUS=SKU1,SKU2   - Override product SKUs (use when catalog SKUs differ)
 *   CHEP_DEMO_FREE_SHIPPING=true - Use free shipping (freeshipping/freeshipping) instead of flatrate
 *   CHEP_DEMO_ORDER_COUNT=1     - Place only the first N blueprint orders (smoke test)
 *   CHEP_DEMO_FORCE=true        - Ignore prior run state file for this email (allows re-run)
 *
 * B2B: Ensure products exist in the company's shared catalog (Admin > B2B > Shared Catalogs).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'config.json');
const runStateDir = path.join(repoRoot, '.demo-order-runs');

const CUSTOMER_EMAIL = process.env.CHEP_DEMO_CUSTOMER_EMAIL ?? 'matt@adobedemo.com';
const CUSTOMER_PASSWORD = process.env.CHEP_DEMO_CUSTOMER_PASSWORD ?? 'Password1';
const SKIP_COMPANY_CONTEXT = process.env.CHEP_DEMO_SKIP_COMPANY === 'true' || process.env.CHEP_DEMO_SKIP_COMPANY === '1';
/** If set, only the first N blueprint orders are placed (e.g. 1 for a smoke test). */
const ORDER_COUNT = process.env.CHEP_DEMO_ORDER_COUNT
  ? Number.parseInt(process.env.CHEP_DEMO_ORDER_COUNT, 10)
  : null;
const FORCE_RUN = process.env.CHEP_DEMO_FORCE === 'true' || process.env.CHEP_DEMO_FORCE === '1';

function getRunStatePath() {
  const slug = CUSTOMER_EMAIL.replace(/@/g, '-').replace(/\./g, '-');
  return path.join(runStateDir, `${slug}-chep-orders.json`);
}
const runStatePath = getRunStatePath();
const CUSTOMER_TOKEN = process.env.CHEP_DEMO_CUSTOMER_TOKEN ?? '';
const START_INDEX = Number.parseInt(process.env.CHEP_DEMO_START_INDEX ?? '0', 10);

const ORDER_SOURCE = 'BODEA';
const USE_FREE_SHIPPING = process.env.CHEP_DEMO_FREE_SHIPPING === 'true' || process.env.CHEP_DEMO_FREE_SHIPPING === '1';
const DEFAULT_SHIPPING_METHOD = Object.freeze(
  USE_FREE_SHIPPING
    ? { carrierCode: 'freeshipping', methodCode: 'freeshipping' }
    : { carrierCode: 'flatrate', methodCode: 'flatrate' },
);
const DEFAULT_PAYMENT_METHOD_CODE = process.env.CHEP_DEMO_PAYMENT_METHOD ?? 'checkmo';

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

const DELIVERY_SITES = [
  {
    id: 'site-manchester-001',
    name: 'Manchester Distribution Centre',
    address1: '1 Logistics Way',
    city: 'Manchester',
    region: 'Greater Manchester',
    postcode: 'M17 1AA',
    countryCode: 'GB',
    type: 'distribution-centre',
  },
  {
    id: 'site-birmingham-002',
    name: 'Birmingham Service Hub',
    address1: '250 Trade Park Road',
    city: 'Birmingham',
    region: 'West Midlands',
    postcode: 'B24 9FD',
    countryCode: 'GB',
    type: 'service-hub',
  },
  {
    id: 'site-leeds-003',
    name: 'Leeds Customer Depot',
    address1: '44 Industrial Estate',
    city: 'Leeds',
    region: 'West Yorkshire',
    postcode: 'LS10 1AB',
    countryCode: 'GB',
    type: 'depot',
  },
  {
    id: 'site-bristol-004',
    name: 'Bristol Retail Network Site',
    address1: '12 Avon Freight Lane',
    city: 'Bristol',
    region: 'Bristol',
    postcode: 'BS11 8DG',
    countryCode: 'GB',
    type: 'retail-site',
  },
];

function getSiteContacts() {
  return Object.freeze({
    'site-manchester-001': {
      name: 'Matt Hargreaves',
      phone: '0161 555 0142',
      email: CUSTOMER_EMAIL,
    },
    'site-birmingham-002': {
      name: 'Matt Collins',
      phone: '0121 555 0198',
      email: CUSTOMER_EMAIL,
    },
    'site-leeds-003': {
      name: 'Matt Lawson',
      phone: '0113 555 0176',
      email: CUSTOMER_EMAIL,
    },
    'site-bristol-004': {
      name: 'Matt Reed',
      phone: '0117 555 0124',
      email: CUSTOMER_EMAIL,
    },
  });
}
const SITE_CONTACTS = getSiteContacts();

const MAX_PALLETS = Number.parseInt(process.env.CHEP_DEMO_MAX_PALLETS ?? '40', 10) || 40;

const OVERRIDE_SKUS = process.env.CHEP_DEMO_SKUS
  ? process.env.CHEP_DEMO_SKUS.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)
  : null;

const ORDER_BLUEPRINTS_SMALL = [
  { siteId: 'site-manchester-001', orderType: 'single', transport: 'chep', deliveryWindow: { from: '08:00', to: '12:00' }, equipment: [{ sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 25 }, { sku: 'HCS-BR-COM-UTILITY-P450', quantity: 15 }] },
  { siteId: 'site-birmingham-002', orderType: 'single', transport: 'customer', deliveryWindow: { from: '09:00', to: '13:00' }, equipment: [{ sku: 'HCS-BR-COM-UTILITY-P450', quantity: 40 }] },
  { siteId: 'site-leeds-003', orderType: 'seven-day', transport: 'chep', deliveryWindow: { from: '07:00', to: '11:00' }, equipment: [{ sku: 'HCS-BR-CMU-SOLID-P450', quantity: 20 }, { sku: 'HCS-BR-AIR-VENT-P030', quantity: 18 }] },
  { siteId: 'site-bristol-004', orderType: 'single', transport: 'chep', deliveryWindow: { from: '10:00', to: '14:00' }, equipment: [{ sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 22 }, { sku: 'HCS-BR-PRF-MULTICELL-P450', quantity: 12 }] },
  { siteId: 'site-manchester-001', orderType: 'single', transport: 'customer', deliveryWindow: { from: '06:00', to: '10:00' }, equipment: [{ sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 35 }] },
  { siteId: 'site-birmingham-002', orderType: 'seven-day', transport: 'chep', deliveryWindow: { from: '11:00', to: '15:00' }, equipment: [{ sku: 'HCS-BR-COM-UTILITY-P450', quantity: 28 }, { sku: 'HCS-BR-AIR-VENT-P030', quantity: 10 }] },
  { siteId: 'site-leeds-003', orderType: 'single', transport: 'chep', deliveryWindow: { from: '08:30', to: '12:30' }, equipment: [{ sku: 'HCS-BR-PRF-MULTICELL-P450', quantity: 30 }, { sku: 'HCS-BR-CMU-SOLID-P450', quantity: 8 }] },
  { siteId: 'site-bristol-004', orderType: 'single', transport: 'customer', deliveryWindow: { from: '07:30', to: '11:30' }, equipment: [{ sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 15 }, { sku: 'HCS-BR-PRF-MULTICELL-P450', quantity: 20 }] },
  { siteId: 'site-manchester-001', orderType: 'seven-day', transport: 'chep', deliveryWindow: { from: '12:00', to: '16:00' }, equipment: [{ sku: 'HCS-BR-AIR-VENT-P030', quantity: 40 }] },
  { siteId: 'site-birmingham-002', orderType: 'single', transport: 'chep', deliveryWindow: { from: '08:00', to: '10:00' }, equipment: [{ sku: 'HCS-BR-PRF-MULTICELL-P450', quantity: 18 }, { sku: 'HCS-BR-COM-UTILITY-P450', quantity: 22 }] },
];

const ORDER_BLUEPRINTS = [
  {
    siteId: 'site-manchester-001',
    orderType: 'single',
    transport: 'chep',
    deliveryWindow: { from: '08:00', to: '12:00' },
    equipment: [
      { sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 320 },
      { sku: 'HCS-BR-COM-UTILITY-P450', quantity: 180 },
    ],
  },
  {
    siteId: 'site-birmingham-002',
    orderType: 'single',
    transport: 'customer',
    deliveryWindow: { from: '09:00', to: '13:00' },
    equipment: [
      { sku: 'HCS-BR-COM-UTILITY-P450', quantity: 140 },
    ],
  },
  {
    siteId: 'site-leeds-003',
    orderType: 'seven-day',
    transport: 'chep',
    deliveryWindow: { from: '07:00', to: '11:00' },
    equipment: [
      { sku: 'HCS-BR-CMU-SOLID-P450', quantity: 90 },
      { sku: 'HCS-BR-AIR-VENT-P030', quantity: 240 },
    ],
  },
  {
    siteId: 'site-bristol-004',
    orderType: 'single',
    transport: 'chep',
    deliveryWindow: { from: '10:00', to: '14:00' },
    equipment: [
      { sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 500 },
      { sku: 'HCS-BR-PRF-MULTICELL-P450', quantity: 110 },
    ],
  },
  {
    siteId: 'site-manchester-001',
    orderType: 'single',
    transport: 'customer',
    deliveryWindow: { from: '06:00', to: '10:00' },
    equipment: [
      { sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 760 },
    ],
  },
  {
    siteId: 'site-birmingham-002',
    orderType: 'seven-day',
    transport: 'chep',
    deliveryWindow: { from: '11:00', to: '15:00' },
    equipment: [
      { sku: 'HCS-BR-COM-UTILITY-P450', quantity: 220 },
      { sku: 'HCS-BR-AIR-VENT-P030', quantity: 160 },
      { sku: 'HCS-BR-CMU-SOLID-P450', quantity: 95 },
    ],
  },
  {
    siteId: 'site-leeds-003',
    orderType: 'single',
    transport: 'chep',
    deliveryWindow: { from: '08:30', to: '12:30' },
    equipment: [
      { sku: 'HCS-BR-PRF-MULTICELL-P450', quantity: 300 },
      { sku: 'HCS-BR-CMU-SOLID-P450', quantity: 120 },
    ],
  },
  {
    siteId: 'site-bristol-004',
    orderType: 'single',
    transport: 'customer',
    deliveryWindow: { from: '07:30', to: '11:30' },
    equipment: [
      { sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 210 },
      { sku: 'HCS-BR-PRF-MULTICELL-P450', quantity: 210 },
      { sku: 'HCS-BR-COM-UTILITY-P450', quantity: 120 },
    ],
  },
  {
    siteId: 'site-manchester-001',
    orderType: 'seven-day',
    transport: 'chep',
    deliveryWindow: { from: '12:00', to: '16:00' },
    equipment: [
      { sku: 'HCS-BR-AIR-VENT-P030', quantity: 480 },
    ],
  },
  {
    siteId: 'site-birmingham-002',
    orderType: 'single',
    transport: 'chep',
    deliveryWindow: { from: '08:00', to: '10:00' },
    equipment: [
      { sku: 'HCS-BR-PRF-MULTICELL-P450', quantity: 180 },
      { sku: 'HCS-BR-COM-UTILITY-P450', quantity: 260 },
    ],
  },
  {
    siteId: 'site-leeds-003',
    orderType: 'single',
    transport: 'customer',
    deliveryWindow: { from: '09:30', to: '13:30' },
    equipment: [
      { sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 150 },
      { sku: 'HCS-BR-CMU-SOLID-P450', quantity: 70 },
    ],
  },
  {
    siteId: 'site-bristol-004',
    orderType: 'seven-day',
    transport: 'chep',
    deliveryWindow: { from: '13:00', to: '16:00' },
    equipment: [
      { sku: 'HCS-BR-ENG-CLASSAB-P350', quantity: 620 },
      { sku: 'HCS-BR-AIR-VENT-P030', quantity: 75 },
      { sku: 'HCS-BR-PRF-MULTICELL-P450', quantity: 60 },
    ],
  },
];

const GENERATE_CUSTOMER_TOKEN_MUTATION = `
  mutation GenerateCustomerToken($email: String!, $password: String!) {
    generateCustomerToken(email: $email, password: $password) {
      token
    }
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
    customer {
      companies {
        items {
          id
          name
          status
        }
      }
    }
    company {
      id
      name
      status
    }
    customerGroup {
      uid
    }
  }
`;

const GET_CUSTOMER_CART_QUERY = `
  query GetCustomerCart {
    cart: customerCart {
      id
      itemsV2(pageSize: 100, currentPage: 1) {
        items {
          uid
          product {
            sku
          }
          quantity
        }
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
          items {
            uid
            quantity
            product {
              sku
            }
          }
        }
      }
      user_errors {
        code
        message
      }
    }
  }
`;

const UPDATE_CART_ITEMS_MUTATION = `
  mutation UpdateCartItems($cartId: String!, $cartItems: [CartItemUpdateInput!]!) {
    updateCartItems(
      input: {
        cart_id: $cartId
        cart_items: $cartItems
      }
    ) {
      cart {
        id
        itemsV2(pageSize: 100, currentPage: 1) {
          items {
            uid
            product {
              sku
            }
            quantity
          }
        }
      }
    }
  }
`;

const SET_SHIPPING_ADDRESS_MUTATION = `
  mutation SetShippingAddress($cartId: String!, $shippingAddress: ShippingAddressInput!) {
    setShippingAddressesOnCart(
      input: { cart_id: $cartId, shipping_addresses: [$shippingAddress] }
    ) {
      cart {
        id
      }
    }
  }
`;

const SET_BILLING_ADDRESS_MUTATION = `
  mutation SetBillingAddress($cartId: String!, $billingAddress: BillingAddressInput!) {
    setBillingAddressOnCart(
      input: { cart_id: $cartId, billing_address: $billingAddress }
    ) {
      cart {
        id
      }
    }
  }
`;

const SET_SHIPPING_METHOD_MUTATION = `
  mutation SetShippingMethods($cartId: String!, $shippingMethods: [ShippingMethodInput]!) {
    setShippingMethodsOnCart(
      input: { cart_id: $cartId, shipping_methods: $shippingMethods }
    ) {
      cart {
        id
      }
    }
  }
`;

const SET_PAYMENT_METHOD_MUTATION = `
  mutation SetPaymentMethod($cartId: String!, $input: PaymentMethodInput!) {
    setPaymentMethodOnCart(
      input: { cart_id: $cartId, payment_method: $input }
    ) {
      cart {
        id
      }
    }
  }
`;

const SET_CUSTOM_ATTRIBUTES_ON_CART_MUTATION = `
  mutation SetCustomAttributesOnCart($input: CartCustomAttributesInput!) {
    setCustomAttributesOnCart(input: $input) {
      cart {
        id
        custom_attributes {
          attribute_code
          value
        }
      }
    }
  }
`;

const PLACE_ORDER_MUTATION = `
  mutation PlaceOrder($cartId: String!) {
    placeOrder(input: { cart_id: $cartId }) {
      errors {
        code
        message
      }
      orderV2 {
        number
        id
        order_date
        status
      }
    }
  }
`;

const VERIFY_ORDER_QUERY = `
  query VerifyOrder($orderNumber: String!) {
    customer {
      orders(filter: { number: { eq: $orderNumber } }) {
        items {
          number
          order_date
          status
          items {
            product_name
            product_sku
            quantity_ordered
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

function trimString(value) {
  return String(value ?? '').trim();
}

function normalizeOrderType(orderType) {
  return orderType === 'seven-day' ? '7day' : 'single';
}

function normalizeTransport(transport) {
  return transport === 'customer' ? 'customer' : 'chep';
}

function buildOrderMetadata(payload) {
  return {
    orderType: normalizeOrderType(payload.orderType),
    transport: normalizeTransport(payload.transport),
    source: trimString(payload.source || ORDER_SOURCE),
    siteId: trimString(payload.site?.id),
    siteName: trimString(payload.site?.name),
    contactName: trimString(payload.contact?.name),
    contactPhone: trimString(payload.contact?.phone),
    contactEmail: trimString(payload.contact?.email),
    timeFrom: trimString(payload.deliveryWindow?.from),
    timeTo: trimString(payload.deliveryWindow?.to),
    isSevenDayOrder: normalizeOrderType(payload.orderType) === '7day' ? 'true' : 'false',
  };
}

function buildCartCustomAttributesPayload(cartId, metadata) {
  return {
    cart_id: cartId,
    custom_attributes: [
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.orderType, value: metadata.orderType },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.transport, value: metadata.transport },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.source, value: metadata.source },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.siteId, value: metadata.siteId },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.siteName, value: metadata.siteName },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.contactName, value: metadata.contactName },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.contactPhone, value: metadata.contactPhone },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.contactEmail, value: metadata.contactEmail },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.timeFrom, value: metadata.timeFrom },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.timeTo, value: metadata.timeTo },
      { attribute_code: CART_CUSTOM_ATTRIBUTE_CODES.isSevenDayOrder, value: metadata.isSevenDayOrder },
    ],
  };
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
    this._fetchGraphQlHeaders = {
      ...this._fetchGraphQlHeaders,
      [key]: value,
    };
  }

  setFetchGraphQlHeaders(headers) {
    this._fetchGraphQlHeaders = {
      ...headers,
    };
  }

  async fetchGraphQl(query, options = {}) {
    if (!this._endpoint) {
      throw new Error('Missing GraphQL endpoint');
    }

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

function splitContactName(fullName) {
  const trimmedName = fullName.trim();
  const [firstName = '', ...lastNameParts] = trimmedName.split(/\s+/);
  const lastName = lastNameParts.join(' ') || 'Contact';

  return {
    firstName: firstName || 'Customer',
    lastName,
  };
}

function toShippingAddressInput(site, payload) {
  const { firstName, lastName } = splitContactName(payload.contact.name);

  return {
    address: {
      firstname: firstName,
      lastname: lastName,
      company: site.name,
      street: [site.address1],
      city: site.city,
      region: site.region,
      postcode: site.postcode,
      country_code: site.countryCode,
      telephone: payload.contact.phone,
      save_in_address_book: false,
    },
  };
}

function createDeliveryDate(offset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  let added = 0;

  while (added <= offset) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) {
      added += 1;
    }
  }

  return date.toISOString().slice(0, 10);
}

function applySkuOverride(equipment) {
  if (!OVERRIDE_SKUS?.length) return equipment;
  const skus = OVERRIDE_SKUS;
  const overridden = equipment.map((line, i) => ({
    sku: skus[i % skus.length],
    quantity: Number(line.quantity),
  }));
  const merged = new Map();
  for (const { sku, quantity } of overridden) {
    merged.set(sku, (merged.get(sku) ?? 0) + quantity);
  }
  return [...merged.entries()].map(([sku, quantity]) => ({ sku, quantity }));
}

function buildPayload(blueprint, index) {
  const site = DELIVERY_SITES.find((entry) => entry.id === blueprint.siteId);
  if (!site) {
    throw new Error(`Unknown site ${blueprint.siteId}`);
  }

  const equipment = applySkuOverride(blueprint.equipment);

  return {
    orderType: blueprint.orderType,
    deliveryDate: createDeliveryDate(index),
    source: ORDER_SOURCE,
    transport: blueprint.transport,
    equipment,
    site,
    contact: {
      ...SITE_CONTACTS[site.id],
    },
    deliveryWindow: {
      ...blueprint.deliveryWindow,
    },
  };
}

function formatGraphQlErrors(response) {
  const topLevelErrors = response?.errors ?? [];
  const messages = topLevelErrors.map((error) => error.message).filter(Boolean);
  return messages;
}

function expectNoGraphQlErrors(response, context) {
  const messages = formatGraphQlErrors(response);
  if (messages.length) {
    throw new Error(`${context}: ${messages.join(' ')}`);
  }
}

function expectMutationErrors(errors, context) {
  if (!Array.isArray(errors) || !errors.length) {
    return;
  }

  const messages = errors.map((error) => error.message || error.code).filter(Boolean);
  throw new Error(`${context}: ${messages.join(' ')}`);
}

async function writeRunState(state) {
  await fs.mkdir(runStateDir, { recursive: true });
  await fs.writeFile(runStatePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

async function ensureNotPreviouslyRun() {
  if (FORCE_RUN) {
    try {
      await fs.unlink(runStatePath);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    return;
  }
  try {
    const existing = JSON.parse(await fs.readFile(runStatePath, 'utf8'));
    const existingOrders = existing.orders ?? [];

    if (existing.status === 'failed' && existingOrders.length === 0) {
      await fs.unlink(runStatePath);
      return;
    }

    throw new Error(
      `Demo order run state already exists at ${path.relative(repoRoot, runStatePath)} with status "${existing.status}". Aborting to avoid duplicate live orders.`,
    );
  } catch (error) {
    if (error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

async function loadCoreClient() {
  const rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const config = rawConfig.public.default;
  const client = new FetchGraphQL();
  client.setEndpoint(config['commerce-endpoint']);
  const headers = { ...(config.headers?.all ?? {}), ...(config.headers?.cs ?? {}) };
  client.setFetchGraphQlHeaders(headers);
  return { client, config };
}

async function authenticateCustomer(client) {
  let token = CUSTOMER_TOKEN;

  if (!token) {
    const tokenResponse = await client.fetchGraphQl(GENERATE_CUSTOMER_TOKEN_MUTATION, {
      method: 'POST',
      variables: {
        email: CUSTOMER_EMAIL,
        password: CUSTOMER_PASSWORD,
      },
    });

    expectNoGraphQlErrors(tokenResponse, 'generateCustomerToken failed');
    token = tokenResponse?.data?.generateCustomerToken?.token;
  }

  if (!token) {
    throw new Error(`No usable customer token was available for ${CUSTOMER_EMAIL}.`);
  }

  client.setFetchGraphQlHeader('Authorization', `Bearer ${token}`);

  const customerResponse = await client.fetchGraphQl(GET_CUSTOMER_QUERY, {
    method: 'POST',
  });
  expectNoGraphQlErrors(customerResponse, 'customer query failed after authentication');

  const customer = customerResponse?.data?.customer;
  if (!customer?.email) {
    throw new Error('Authenticated customer payload was missing.');
  }

  if (customer.email.toLowerCase() !== CUSTOMER_EMAIL) {
    throw new Error(`Authenticated as ${customer.email} instead of ${CUSTOMER_EMAIL}.`);
  }

  return { token, customer };
}

async function applyCompanyContextHeader(client) {
  if (SKIP_COMPANY_CONTEXT) {
    console.log('Skipping company context (CHEP_DEMO_SKIP_COMPANY=true)');
    return null;
  }

  const response = await client.fetchGraphQl(GET_COMPANY_CONTEXT_QUERY, {
    method: 'POST',
  });

  const messages = formatGraphQlErrors(response);
  if (messages.length) {
    return null;
  }

  const company = response?.data?.company ?? null;
  if (company?.id) {
    client.setFetchGraphQlHeader('X-Adobe-Company', company.id);
  }

  return company;
}

async function getCustomerCart(client) {
  const response = await client.fetchGraphQl(GET_CUSTOMER_CART_QUERY, {
    method: 'POST',
  });
  expectNoGraphQlErrors(response, 'customerCart query failed');
  const cart = response?.data?.cart;
  if (!cart?.id) {
    throw new Error('customerCart did not return a cart ID.');
  }
  return cart;
}

async function clearCart(client, cart) {
  const items = cart?.itemsV2?.items ?? [];
  if (!items.length) {
    return cart;
  }

  const response = await client.fetchGraphQl(UPDATE_CART_ITEMS_MUTATION, {
    method: 'POST',
    variables: {
      cartId: cart.id,
      cartItems: items.map((item) => ({
        cart_item_uid: item.uid,
        quantity: 0,
      })),
    },
  });

  expectNoGraphQlErrors(response, 'updateCartItems failed while clearing cart');
  return response?.data?.updateCartItems?.cart ?? cart;
}

async function addProductsToCart(client, cartId, equipment) {
  const response = await client.fetchGraphQl(ADD_PRODUCTS_TO_CART_MUTATION, {
    method: 'POST',
    variables: {
      cartId,
      cartItems: equipment.map((line) => ({
        sku: line.sku,
        quantity: Number(line.quantity),
      })),
    },
  });

  expectNoGraphQlErrors(response, 'addProductsToCart failed');
  expectMutationErrors(response?.data?.addProductsToCart?.user_errors, 'addProductsToCart returned user errors');

  const cart = response?.data?.addProductsToCart?.cart;
  if (!cart?.id) {
    throw new Error('addProductsToCart returned no cart.');
  }

  return cart;
}

async function setShippingAddress(client, cartId, payload) {
  const response = await client.fetchGraphQl(SET_SHIPPING_ADDRESS_MUTATION, {
    method: 'POST',
    variables: {
      cartId,
      shippingAddress: toShippingAddressInput(payload.site, payload),
    },
  });
  expectNoGraphQlErrors(response, 'setShippingAddressesOnCart failed');
}

async function setBillingAddress(client, cartId) {
  const response = await client.fetchGraphQl(SET_BILLING_ADDRESS_MUTATION, {
    method: 'POST',
    variables: {
      cartId,
      billingAddress: {
        same_as_shipping: true,
      },
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
    variables: {
      cartId,
      input: {
        code: DEFAULT_PAYMENT_METHOD_CODE,
      },
    },
  });
  expectNoGraphQlErrors(response, 'setPaymentMethodOnCart failed');
}

async function persistOrderMetadata(client, cartId, metadata) {
  const input = buildCartCustomAttributesPayload(cartId, metadata);
  const expectedCodes = input.custom_attributes.map((entry) => entry.attribute_code);
  const response = await client.fetchGraphQl(SET_CUSTOM_ATTRIBUTES_ON_CART_MUTATION, {
    method: 'POST',
    variables: {
      input,
    },
  });

  expectNoGraphQlErrors(response, 'setCustomAttributesOnCart failed');

  const persisted = response?.data?.setCustomAttributesOnCart?.cart?.custom_attributes ?? [];
  const persistedCodes = persisted.map((entry) => entry.attribute_code);
  const missingCodes = expectedCodes.filter((code) => !persistedCodes.includes(code));

  if (missingCodes.length) {
    throw new Error(`setCustomAttributesOnCart returned without expected attributes: ${missingCodes.join(', ')}`);
  }

  return persisted;
}

async function placeOrder(client, cartId) {
  const response = await client.fetchGraphQl(PLACE_ORDER_MUTATION, {
    method: 'POST',
    variables: {
      cartId,
    },
  });

  expectNoGraphQlErrors(response, 'placeOrder failed');
  expectMutationErrors(response?.data?.placeOrder?.errors, 'placeOrder returned order errors');

  const order = response?.data?.placeOrder?.orderV2;
  if (!order?.number) {
    throw new Error('placeOrder returned no order number.');
  }

  return order;
}

async function verifyOrder(client, orderNumber) {
  const response = await client.fetchGraphQl(VERIFY_ORDER_QUERY, {
    method: 'POST',
    variables: {
      orderNumber,
    },
  });

  expectNoGraphQlErrors(response, `customer.orders verification failed for ${orderNumber}`);
  const order = response?.data?.customer?.orders?.items?.[0] ?? null;
  if (!order?.number) {
    throw new Error(`Order ${orderNumber} was not found in customer order history.`);
  }
  return order;
}

function collectUsedSkus(orders) {
  return [...new Set(orders.flatMap((order) => order.equipment.map((line) => line.sku)))];
}

function summarisePersistedAttributes(attributes) {
  return Object.fromEntries(
    attributes.map((entry) => [entry.attribute_code, entry.value]),
  );
}

async function main() {
  await ensureNotPreviouslyRun();

  if (OVERRIDE_SKUS?.length) {
    console.log(`Using override SKUs: ${OVERRIDE_SKUS.join(', ')}`);
  }
  if (USE_FREE_SHIPPING) {
    console.log('Using free shipping (freeshipping/freeshipping)');
  }

  const { client, config } = await loadCoreClient();

  const runState = {
    status: 'in_progress',
    customerEmail: CUSTOMER_EMAIL,
    commerceEndpoint: config['commerce-endpoint'],
    startedAt: new Date().toISOString(),
    companyContext: null,
    orders: [],
  };
  await writeRunState(runState);

  try {
    const { customer } = await authenticateCustomer(client);
    const company = await applyCompanyContextHeader(client);
    runState.companyContext = company;
    runState.customer = customer;
    await writeRunState(runState);

    const blueprints = MAX_PALLETS === 40 ? ORDER_BLUEPRINTS_SMALL : ORDER_BLUEPRINTS;
    const limitedBlueprints =
      ORDER_COUNT != null && !Number.isNaN(ORDER_COUNT) && ORDER_COUNT >= 0
        ? blueprints.slice(0, ORDER_COUNT)
        : blueprints;
    const payloads = limitedBlueprints.map(buildPayload);

    if (ORDER_COUNT != null) {
      console.log(`CHEP_DEMO_ORDER_COUNT=${ORDER_COUNT}: placing ${payloads.length} order(s).`);
    }

    for (const [index, payload] of payloads.entries()) {
      if (index < START_INDEX) {
        continue;
      }

      let cart = await getCustomerCart(client);
      cart = await clearCart(client, cart);
      cart = await addProductsToCart(client, cart.id, payload.equipment);

      await setShippingAddress(client, cart.id, payload);
      await setBillingAddress(client, cart.id);
      await setShippingMethod(client, cart.id);
      await setPaymentMethod(client, cart.id);

      const metadata = buildOrderMetadata(payload);
      const persistedAttributes = await persistOrderMetadata(client, cart.id, metadata);
      const order = await placeOrder(client, cart.id);
      const verifiedOrder = await verifyOrder(client, order.number);

      const orderSummary = {
        index: index + 1,
        orderNumber: order.number,
        orderDate: verifiedOrder.order_date,
        status: verifiedOrder.status,
        payload,
        metadata,
        persistedAttributes,
        verification: {
          orderNumber: verifiedOrder.number,
          skus: verifiedOrder.items.map((item) => ({
            sku: item.product_sku,
            quantity: item.quantity_ordered,
            name: item.product_name,
          })),
          total: verifiedOrder.total?.grand_total ?? null,
        },
      };

      runState.orders.push(orderSummary);
      await writeRunState(runState);

      console.log(`Placed order ${order.number} (${index + 1}/${payloads.length})`);
    }

    runState.status = 'complete';
    runState.completedAt = new Date().toISOString();
    runState.usedSkus = collectUsedSkus(runState.orders.map((order) => order.payload));
    await writeRunState(runState);

    const printableSummary = {
      customerEmail: runState.customerEmail,
      companyContext: runState.companyContext,
      createdOrderNumbers: runState.orders.map((order) => order.orderNumber),
      usedSkus: runState.usedSkus,
      orders: runState.orders.map((order) => ({
        orderNumber: order.orderNumber,
        payload: {
          orderType: order.payload.orderType,
          transport: order.payload.transport,
          deliveryDate: order.payload.deliveryDate,
          site: {
            id: order.payload.site.id,
            name: order.payload.site.name,
            city: order.payload.site.city,
          },
          equipment: order.payload.equipment,
          contact: order.payload.contact,
          deliveryWindow: order.payload.deliveryWindow,
        },
        metadata: order.metadata,
        persistedAttributes: summarisePersistedAttributes(order.persistedAttributes),
        verification: order.verification,
      })),
    };

    console.log(JSON.stringify(printableSummary, null, 2));
  } catch (error) {
    runState.status = 'failed';
    runState.failedAt = new Date().toISOString();
    runState.error = {
      message: error.message,
      stack: error.stack,
    };
    await writeRunState(runState);
    throw error;
  }
}

await main();
