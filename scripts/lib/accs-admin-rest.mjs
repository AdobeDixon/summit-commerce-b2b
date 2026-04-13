/* eslint-disable no-console */
/**
 * Shared Admin REST helpers for Adobe Commerce as a Cloud Service (ACCS) and PaaS.
 * Used by create-joe-march-2026-brick-order.mjs and batch-joe-historic-orders.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function getEnv(name) {
  return process.env[name] || process.env[`CYPRESS_${name}`];
}

export function getPublicConfig() {
  try {
    const configPath = path.join(repoRoot, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return config?.public?.default ?? null;
  } catch {
    return null;
  }
}

export function getApiBase() {
  const ep = getEnv('API_ENDPOINT');
  if (ep) return ep.replace(/\/graphql$/, '');
  const pub = getPublicConfig();
  const graphqlUrl = pub?.['commerce-endpoint'];
  if (graphqlUrl) return graphqlUrl.replace(/\/graphql$/, '');
  return null;
}

export function getMagentoRestRoot() {
  return (getEnv('MAGENTO_REST_ROOT') || '').replace(/^\/+|\/+$/g, '');
}

export function isAccsCommerceApiHost(baseUrl) {
  return typeof baseUrl === 'string' && baseUrl.includes('api.commerce.adobe.com');
}

export function buildRestV1BaseUrl(baseUrl) {
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

export function buildCommerceAdminRestHeaders(token, clientId) {
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

export async function getImsAccessToken() {
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

export async function getCommerceAdminRestContext() {
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

export async function tryPatchOrderCreatedAt(incrementId, isoDateLocal) {
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

  const putRes = await fetch(putUrl, { method: 'POST', headers, body: JSON.stringify(body) });
  const putText = await putRes.text();
  console.log('[tryPatchOrderCreatedAt] POST /V1/orders save:', putRes.status, putText.slice(0, 500));
  return putRes.ok;
}

export async function completeOrderInvoiceAndShip(incrementId) {
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
    console.log('Order already fully invoiced; skipping invoice.');
  }

  const orderAfter = await fetch(`${v1Base}/orders/${orderId}`, { headers }).then((r) => r.json());
  const lineItems = Array.isArray(orderAfter.items) ? orderAfter.items : [];
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
    console.log('No line items left to ship. State:', orderAfter.state, orderAfter.status);
    return { orderId, invoiceId, shipmentSkipped: true };
  }

  const tracks = [
    {
      track_number: `BATCH-${incrementId}`,
      title: 'Delivery',
      carrier_code: 'custom',
    },
  ];
  const shipOrderBody = {
    items: shipLines.map(({ order_item_id: orderItemId, qty }) => (
      { order_item_id: orderItemId, qty }
    )),
    tracks,
  };
  const shipEntityPayload = {
    entity: {
      order_id: orderId,
      items: shipLines,
      tracks,
    },
  };

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
  return {
    orderId,
    invoiceId,
    state: final.state,
    status: final.status,
  };
}
