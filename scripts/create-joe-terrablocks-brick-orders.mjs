#!/usr/bin/env node
/**
 * Place 10 demo orders for joe@terrablock.com using brick SKUs (HCS-BR-*) only.
 * Shipping addresses are taken exclusively from the customer's Commerce address book.
 *
 * Env:
 *   CHEP_DEMO_CUSTOMER_EMAIL / CHEP_DEMO_CUSTOMER_PASSWORD — auth (defaults below)
 *   CHEP_DEMO_SKIP_COMPANY=true — if products are not in company catalog
 *   CHEP_DEMO_FREE_SHIPPING=true — freeshipping method
 *   JOE_BRICK_ORDER_FORCE=true — allow re-run (clears prior run state file)
 *
 *   npm run create-joe-brick-orders
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'config.json');
const runStateDir = path.join(repoRoot, '.demo-order-runs');
const runStatePath = path.join(runStateDir, 'joe-terrablocks-brick-orders.json');

const CUSTOMER_EMAIL = process.env.CHEP_DEMO_CUSTOMER_EMAIL ?? 'joe@terrablock.com';
const CUSTOMER_PASSWORD = process.env.CHEP_DEMO_CUSTOMER_PASSWORD ?? 'Password1';
const SKIP_COMPANY_CONTEXT = process.env.CHEP_DEMO_SKIP_COMPANY === 'true'
  || process.env.CHEP_DEMO_SKIP_COMPANY === '1';
const FORCE_RUN = process.env.JOE_BRICK_ORDER_FORCE === 'true'
  || process.env.JOE_BRICK_ORDER_FORCE === '1'
  || process.env.CHEP_DEMO_FORCE === 'true';
const CUSTOMER_TOKEN = process.env.CHEP_DEMO_CUSTOMER_TOKEN ?? '';

const USE_FREE_SHIPPING = process.env.CHEP_DEMO_FREE_SHIPPING === 'true'
  || process.env.CHEP_DEMO_FREE_SHIPPING === '1';
const DEFAULT_SHIPPING_METHOD = Object.freeze(
  USE_FREE_SHIPPING
    ? { carrierCode: 'freeshipping', methodCode: 'freeshipping' }
    : { carrierCode: 'flatrate', methodCode: 'flatrate' },
);
const DEFAULT_PAYMENT_METHOD_CODE = process.env.CHEP_DEMO_PAYMENT_METHOD ?? 'checkmo';
const ORDER_SOURCE = 'BODEA';
const MAX_LINE_ITEMS = 60;

/** Canonical HCS-BR-* masonry SKUs (same list as blocks/chep-dashboard/dashboard-config.js). */
const FEATURED_EQUIPMENT_SKUS = [
  'HCS-BR-FAC-WIRECUT-P450',
  'HCS-BR-ENG-CLASSAB-P350',
  'HCS-BR-CMU-SOLID-P450',
  'HCS-BR-COM-UTILITY-P450',
  'HCS-BR-PRF-MULTICELL-P450',
  'HCS-BR-AIR-VENT-P030',
];

const [
  SKU_FAC,
  SKU_ENG,
  SKU_CMU,
  SKU_COM,
  SKU_PRF,
  SKU_AIR,
] = FEATURED_EQUIPMENT_SKUS;

/** Ten varied brick-only line mixes (quantities and SKU subsets). Each ≤ 60 cart lines. */
const ORDER_EQUIPMENT_BLUEPRINTS = [
  [
    { sku: SKU_FAC, quantity: 12 },
    { sku: SKU_ENG, quantity: 8 },
    { sku: SKU_CMU, quantity: 15 },
    { sku: SKU_COM, quantity: 20 },
    { sku: SKU_PRF, quantity: 10 },
    { sku: SKU_AIR, quantity: 25 },
  ],
  [{ sku: SKU_FAC, quantity: 5 }, { sku: SKU_ENG, quantity: 30 }, { sku: SKU_CMU, quantity: 40 }],
  [{ sku: SKU_COM, quantity: 50 }, { sku: SKU_PRF, quantity: 35 }, { sku: SKU_AIR, quantity: 60 }],
  [
    { sku: SKU_ENG, quantity: 18 },
    { sku: SKU_CMU, quantity: 22 },
    { sku: SKU_PRF, quantity: 28 },
    { sku: SKU_AIR, quantity: 14 },
  ],
  [{ sku: SKU_FAC, quantity: 40 }, { sku: SKU_COM, quantity: 15 }],
  [
    { sku: SKU_FAC, quantity: 7 },
    { sku: SKU_ENG, quantity: 11 },
    { sku: SKU_CMU, quantity: 13 },
    { sku: SKU_COM, quantity: 17 },
    { sku: SKU_PRF, quantity: 19 },
    { sku: SKU_AIR, quantity: 23 },
  ],
  [{ sku: SKU_CMU, quantity: 45 }, { sku: SKU_PRF, quantity: 20 }, { sku: SKU_ENG, quantity: 12 }],
  [{ sku: SKU_FAC, quantity: 25 }, { sku: SKU_AIR, quantity: 35 }, { sku: SKU_COM, quantity: 10 }],
  [{ sku: SKU_PRF, quantity: 55 }, { sku: SKU_ENG, quantity: 25 }],
  [
    { sku: SKU_FAC, quantity: 8 },
    { sku: SKU_ENG, quantity: 9 },
    { sku: SKU_CMU, quantity: 10 },
    { sku: SKU_COM, quantity: 11 },
    { sku: SKU_PRF, quantity: 12 },
    { sku: SKU_AIR, quantity: 13 },
  ],
];

const ORDER_META_BLUEPRINTS = [
  { orderType: 'single', transport: 'chep', deliveryWindow: { from: '08:00', to: '12:00' } },
  { orderType: 'single', transport: 'customer', deliveryWindow: { from: '09:00', to: '13:00' } },
  { orderType: 'seven-day', transport: 'chep', deliveryWindow: { from: '07:00', to: '11:00' } },
  { orderType: 'single', transport: 'chep', deliveryWindow: { from: '10:00', to: '14:00' } },
  { orderType: 'single', transport: 'customer', deliveryWindow: { from: '06:00', to: '10:00' } },
  { orderType: 'seven-day', transport: 'chep', deliveryWindow: { from: '11:00', to: '15:00' } },
  { orderType: 'single', transport: 'chep', deliveryWindow: { from: '08:30', to: '12:30' } },
  { orderType: 'single', transport: 'customer', deliveryWindow: { from: '07:30', to: '11:30' } },
  { orderType: 'single', transport: 'chep', deliveryWindow: { from: '08:00', to: '10:00' } },
  { orderType: 'seven-day', transport: 'chep', deliveryWindow: { from: '12:00', to: '16:00' } },
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

const GET_CUSTOMER_ADDRESSES_QUERY = `
  query GetCustomerAddressesForOrders {
    customer {
      addresses {
        firstname
        lastname
        company
        city
        country_code
        region {
          region
          region_code
          region_id
        }
        telephone
        postcode
        street
        uid
        id
      }
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

function regionString(addr) {
  const r = addr.region;
  if (!r) return '';
  return trimString(r.region || r.region_code || String(r.region_id ?? ''));
}

function streetLines(addr) {
  const raw = addr.street;
  if (Array.isArray(raw)) {
    return raw.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/**
 * Build shipping input from a saved Commerce customer address (address book only).
 */
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

function formatGraphQlErrors(response) {
  const topLevelErrors = response?.errors ?? [];
  return topLevelErrors.map((error) => error.message).filter(Boolean);
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
      `Run state already exists at ${path.relative(repoRoot, runStatePath)}. Set JOE_BRICK_ORDER_FORCE=true to place orders again.`,
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

async function fetchCustomerAddresses(client) {
  const response = await client.fetchGraphQl(GET_CUSTOMER_ADDRESSES_QUERY, { method: 'POST' });
  expectNoGraphQlErrors(response, 'customer addresses query failed');
  const list = response?.data?.customer?.addresses;
  return Array.isArray(list) ? list : [];
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

function buildPayload(savedAddress, addrIndex, equipment, meta, orderIndex, customer) {
  const site = addressBookSite(savedAddress, addrIndex);
  const contactName = [customer.firstname, customer.lastname].filter(Boolean).join(' ') || 'Customer';
  const phone = trimString(savedAddress.telephone) || '0000000000';

  return {
    orderType: meta.orderType,
    deliveryDate: createDeliveryDate(orderIndex),
    source: ORDER_SOURCE,
    transport: meta.transport,
    equipment,
    site,
    savedAddress,
    contact: {
      name: contactName,
      phone,
      email: CUSTOMER_EMAIL,
    },
    deliveryWindow: { ...meta.deliveryWindow },
  };
}

async function main() {
  await ensureNotPreviouslyRun();

  if (ORDER_EQUIPMENT_BLUEPRINTS.length !== 10 || ORDER_META_BLUEPRINTS.length !== 10) {
    throw new Error('Expected exactly 10 order blueprints.');
  }

  for (const lines of ORDER_EQUIPMENT_BLUEPRINTS) {
    if (lines.length > MAX_LINE_ITEMS) {
      throw new Error(`Blueprint has ${lines.length} line items; max is ${MAX_LINE_ITEMS}.`);
    }
  }

  console.log('Brick SKUs:', FEATURED_EQUIPMENT_SKUS.join(', '));

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

    const addresses = await fetchCustomerAddresses(client);
    if (!addresses.length) {
      throw new Error(
        `No saved addresses for ${CUSTOMER_EMAIL}. Add addresses (e.g. scripts/add-customer-addresses.mjs) and retry.`,
      );
    }

    console.log(`Using ${addresses.length} address book entr${addresses.length === 1 ? 'y' : 'ies'} (rotated across 10 orders).`);

    for (let index = 0; index < 10; index += 1) {
      const addr = addresses[index % addresses.length];
      const equipment = ORDER_EQUIPMENT_BLUEPRINTS[index];
      const meta = ORDER_META_BLUEPRINTS[index];
      const payload = buildPayload(addr, index % addresses.length, equipment, meta, index, customer);

      let cart = await getCustomerCart(client);
      cart = await clearCart(client, cart);
      cart = await addProductsToCart(client, cart.id, payload.equipment);

      await setShippingAddressFromSaved(client, cart.id, payload);
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
        shippingAddressUid: payload.site.id,
        shippingLabel: payload.site.name,
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

      console.log(`Placed order ${order.number} (${index + 1}/10) — ${payload.site.name}`);
    }

    runState.status = 'complete';
    runState.completedAt = new Date().toISOString();
    await writeRunState(runState);

    console.log(JSON.stringify({
      customerEmail: runState.customerEmail,
      createdOrderNumbers: runState.orders.map((o) => o.orderNumber),
      addressUidsUsed: runState.orders.map((o) => o.shippingAddressUid),
    }, null, 2));
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
