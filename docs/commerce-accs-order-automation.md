# Adobe Commerce as a Cloud Service (ACCS): Order Automation Flow

This document describes the end-to-end flow implemented in this repository to **create customer orders**, **back-date order timestamps**, **invoice**, and **ship** orders so they appear **complete** in Adobe Commerce. It is written so you can **reuse the same patterns** in other tools (e.g. Claude Code, CI jobs, or internal ETL).

**Primary references**

- [Adobe Commerce REST API overview](https://developer.adobe.com/commerce/webapi/rest/) (PaaS vs SaaS URL and auth differences)
- Instance endpoints from your Commerce project (REST base, GraphQL, Admin URL)

**Secrets policy:** This document intentionally does **not** contain real **Bearer tokens**, **client secrets**, **customer passwords**, or full **JWT** strings. Only **environment variable names** and how to use them are described. Store live values in **`.env`** (gitignored), a **secrets manager**, or **Adobe Developer Console** — never commit credentials to the repo or paste them into shared docs.

---

## 1. High-level architecture

Commerce exposes **two different API surfaces** that this flow combines:

| Layer | Role | Protocol | Typical caller |
|--------|------|----------|------------------|
| **Storefront / customer** | Build cart, set addresses, payment, **place order** | **GraphQL** (`commerce-endpoint` in `config.json`) | Scripts acting as **logged-in customer** (email + password → customer token) |
| **Admin / integration** | Search orders, **update order** (`created_at`), **create invoice**, **create shipment** | **REST** (`/V1/...` on the **REST base** from your instance) | Scripts using **IMS OAuth** or a **static integration Bearer token** |

You **cannot** set historical order dates or complete fulfillment (invoice + ship) through the **customer** GraphQL checkout alone in the way we needed. Those steps use **Admin REST** after the order exists.

**End-to-end sequence (what we implemented)**

1. **Authenticate as customer** → obtain **customer Bearer token** (GraphQL `generateCustomerToken`).
2. **Optional B2B**: set `X-Adobe-Company` header if the buyer uses company context (same as storefront).
3. **Build cart**: add line items (brick SKUs), set shipping/billing, shipping method, payment method (`checkmo`), custom cart attributes (Bodea metadata).
4. **Place order** → GraphQL `placeOrder` → returns increment id (e.g. `000000049`).
5. **Back-date** → Admin REST `POST {base}/V1/orders` with `entity.entity_id`, `entity.increment_id`, `entity.created_at` (local time string, e.g. `2026-01-15 12:00:00`).
6. **Invoice** → Admin REST `POST {base}/V1/order/{entity_id}/invoice` with body `{ "capture": true, "notify": false }`.
7. **Ship** → On **ACCS**, use `POST {base}/V1/order/{entity_id}/ship` with JSON body `{ "items": [...], "tracks": [...] }` (flat body, **not** wrapped in `entity`). The generic `POST /V1/shipment` path often returned **400** on ACCS; the **order-scoped ship** endpoint worked reliably.

---

## 2. Credentials and how they are used

### 2.1 Customer credentials (GraphQL)

Used to act as **Joe** (or any test buyer):

| Variable | Purpose |
|----------|---------|
| `CHEP_DEMO_CUSTOMER_EMAIL` | Customer login email (default `joe@terrablock.com`) |
| `CHEP_DEMO_CUSTOMER_PASSWORD` | Password |
| `CHEP_DEMO_CUSTOMER_TOKEN` | Optional: skip password grant if you already have a valid customer JWT |

**Flow:** `generateCustomerToken` mutation → `Authorization: Bearer <customer_token>` on subsequent GraphQL calls.

### 2.2 Admin / integration credentials (REST)

Used for **order save**, **invoice**, **ship**, and **order search**:

| Option | Variables | Notes |
|--------|-----------|--------|
| **A. IMS client credentials** | `IMS_CLIENT_ID`, `IMS_CLIENT_SECRET`, optional `IMS_ORG_ID`, optional `IMS_SCOPE` | Server-to-server OAuth to `https://ims-na1.adobelogin.com/ims/token/v3` with `grant_type=client_credentials`. Scopes must include **`commerce.accs`** (and commonly `openid`, `AdobeID`, `profile`, `email`, `additional_info.roles`, `additional_info.projectedProductContext`, `org.read` as configured in Adobe Developer Console). |
| **B. Pre-generated token** | `COMMERCE_ACCESS_TOKEN` | A valid **IMS access token** (JWT) used as `Authorization: Bearer ...` if you do not want the script to call IMS on every run. |

**Headers used on Admin REST (ACCS)**

- `Authorization: Bearer <IMS access_token>`
- `Content-Type: application/json`
- **`Store: default`** (or your store view code) — **required for ACCS**; store scope is **not** in the URL path (see §3).
- Often **`x-api-key: <IMS_CLIENT_ID>`** (same as Adobe Developer Console API key / client id).
- Often **`x-gw-ims-org-id: <org id>`** when using IMS org-scoped integrations.

**Where credentials live in this repo**

- Load from **`.env`** at the project root (or `cypress/src/support/.env` as fallback) — see `scripts/batch-joe-historic-orders.mjs` and similar scripts.
- **Never commit** secrets; `.env` is gitignored.

---

## 3. REST base URL: ACCS vs traditional Magento (PaaS / on-prem)

### 3.1 What your instance provides

From the Commerce **instance / project** screen you typically get:

- **REST endpoint (base):** e.g. `https://na1-sandbox.api.commerce.adobe.com/<tenant-id>`
- **GraphQL endpoint:** same host + `/<tenant-id>/graphql`
- **Admin UI:** `https://na1-sandbox.admin.commerce.adobe.com/<tenant-id>` (humans only; not the REST host)

### 3.2 ACCS URL shape (SaaS)

Per [REST API overview — Adobe Commerce as a Cloud Service](https://developer.adobe.com/commerce/webapi/rest/):

- Base: `https://<server>.api.commerce.adobe.com/<tenant-id>`
- Paths look like **`/<endpoint>`** where the OpenAPI “endpoint” is usually things like **`V1/orders`**, **`V1/order/123/invoice`**, **not** `rest/default/V1/...` in the path.
- **Store scope** is sent with the **`Store`** HTTP header (`all`, `default`, or a store view code).

**Common mistake:** Taking the GraphQL URL, stripping `/graphql`, and appending **`/rest/default/V1/...`**. On ACCS that often yields **404** (`Request does not match any route`). The correct prefix is typically **`{rest_base}/V1/...`** with the **`Store`** header set.

### 3.3 PaaS / on-prem (contrast)

Traditional deployments use:

`https://<shop-host>/rest/<store_code>/V1/...`

Scripts in this repo support that via optional `MAGENTO_REST_ROOT` (e.g. `rest/default`) when the host is **not** `api.commerce.adobe.com`. See `scripts/lib/accs-admin-rest.mjs` (`buildRestV1BaseUrl`).

---

## 4. API reference (concrete calls)

### 4.1 GraphQL (customer session)

**Endpoint:** `config.json` → `public.default.commerce-endpoint` (must end with `/graphql` for the client).

**Headers:** Store / website headers from `config.json` (`headers.all`, `headers.cs`) plus `Authorization: Bearer <customer_token>` after login.

**Mutations / queries used in our flows**

| Operation | Purpose |
|-----------|---------|
| `generateCustomerToken` | Email + password → customer token |
| `customer` | Verify identity |
| `customerCart` | Get active cart id |
| `addProductsToCart` | Add SKU + qty lines |
| `updateCartItems` | Clear cart (qty `0`) before a new order |
| `setShippingAddressesOnCart` | From saved address book |
| `setBillingAddressOnCart` | Often `same_as_shipping: true` |
| `setShippingMethodsOnCart` | e.g. flatrate or freeshipping |
| `setPaymentMethodOnCart` | e.g. `checkmo` |
| `setCustomAttributesOnCart` | Bodea CHEP metadata (`chep_*` attributes) |
| `placeOrder` | Creates the order; server sets initial `created_at` to “now” |

### 4.2 Admin REST — connectivity smoke test

**GET** `{rest_base}/V1/store/websites`  

If this returns **200** with JSON and you are using the **`Store`** header, your **base URL + auth** are aligned.

### 4.3 Admin REST — list / load order

**GET** `{rest_base}/V1/orders?searchCriteria[filterGroups][0][filters][0][field]=increment_id&searchCriteria[filterGroups][0][filters][0][value]=000000049`

Returns `items[]` with `entity_id`, `increment_id`, state, totals, etc.

### 4.4 Admin REST — back-date `created_at`

**POST** `{rest_base}/V1/orders`  

Body (Magento pattern):

```json
{
  "entity": {
    "entity_id": 49,
    "increment_id": "000000049",
    "created_at": "2026-01-15 12:00:00"
  }
}
```

**Note:** Use **POST**, not PUT, for this save pattern on the stack we used.

### 4.5 Admin REST — invoice

**POST** `{rest_base}/V1/order/{entity_id}/invoice`

```json
{
  "capture": true,
  "notify": false
}
```

Response may be a bare invoice id string on success (e.g. `"14"`).

Fallback if `404`: **POST** `{rest_base}/V1/invoices/` with `{ "entity": { "order_id": <entity_id> } }` (used in PaaS-oriented examples).

### 4.6 Admin REST — ship (ACCS)

**POST** `{rest_base}/V1/order/{entity_id}/ship`

```json
{
  "items": [
    { "order_item_id": 123, "qty": 5 }
  ],
  "tracks": [
    {
      "track_number": "DEMO-000000049",
      "title": "Delivery",
      "carrier_code": "custom"
    }
  ]
}
```

`order_item_id` values come from **GET** `/V1/orders/{id}` → `items[].item_id`. Quantities to ship: `qty_ordered - qty_shipped` per line.

**ACCS caveat:** Do **not** send MSI `source_code` on shipment line `extension_attributes` unless your tenant supports it — we saw **400** with `SourceCode` not supported on ACCS.

**PaaS / MSI:** On self-hosted Magento with Inventory Management, shipment lines often need `extension_attributes.source_code` (e.g. `default`). The shared helper in `accs-admin-rest.mjs` adds that only when **not** on an `api.commerce.adobe.com` host.

---

## 5. Scripts in this repository

| Script | Purpose |
|--------|---------|
| `scripts/lib/accs-admin-rest.mjs` | **Shared** Admin REST: IMS token, `buildRestV1BaseUrl`, `tryPatchOrderCreatedAt`, `completeOrderInvoiceAndShip`. |
| `scripts/batch-joe-historic-orders.mjs` | Creates **30** brick orders for Joe with **Jan / Feb / Mar 2026** backdates, then invoices + ships each. Writes **`.demo-order-runs/joe-batch-30-historic.json`**. |
| `scripts/create-joe-march-2026-brick-order.mjs` | Single-order demo: 30 units across 6 SKUs, optional `--probe-rest`, `--patch-order`, `--complete-order`. |
| `scripts/create-joe-terrablocks-brick-orders.mjs` | Older **10-order** brick demo (separate run state). |

**Environment toggles (batch)**

- `JOE_BATCH_30_FORCE=true` — run again even if the batch run file is already `complete` (creates **another** 30 orders).
- `BATCH_ORDER_DELAY_MS` — throttle between orders (default `750`).
- `CHEP_DEMO_SKIP_COMPANY=true` — skip `X-Adobe-Company` if catalog requires it in your tenant.

---

## 6. Run state and resumability

The batch script persists progress to:

**`.demo-order-runs/joe-batch-30-historic.json`**

- On success, `status` is `complete` and `orders` lists each increment id, backdate, and total units.
- If a run **fails** mid-way, the file records `status: failed` and `error` with the last exception; only **successful** orders are appended to `orders`. Re-running without `JOE_BATCH_30_FORCE` resumes from `state.orders.length` (implemented in the batch script).

---

## 7. Business / data semantics

- **“30 line items”** with only **six** simple-product SKUs: the storefront **merges duplicate SKUs** in the cart, so you get **at most six order lines**; total **quantity** can still reach **30 units** across those lines.
- **Back-dated `created_at`**: applied via Admin REST; customer GraphQL `order_date` may display in a **different timezone** than the raw `12:00:00` string (normalize in reporting if needed).
- **Completed orders:** After invoice + ship, REST shows `state` / `status` **`complete`** (and the customer order history reflects the lifecycle your theme exposes).

---

## 8. Security and compliance

- **Rotate** any `client_secret` or access token that was pasted into chat, tickets, or screenshots.
- Treat **IMS client credentials** like production secrets; scope them minimally (only what REST needs).
- **PCI:** These flows use **`checkmo`** (offline) style payment for demos — appropriate for test sandboxes; do not use real card data in scripts.
- **Production:** Bulk backdating and mass invoicing/shipping can affect **reporting, tax, and audits** — get stakeholder approval before running against real books.

---

## 9. Troubleshooting

| Symptom | Likely cause | What to check |
|---------|----------------|---------------|
| REST **404** on `/V1/...` | Wrong base path (e.g. `/rest/default` on ACCS) | Use `{rest_base}/V1/...` + `Store` header |
| REST **401** | Expired or wrong Bearer token | Refresh IMS token; check `x-api-key` / org header |
| REST **403** | Integration lacks ACL for orders | Adobe Developer Console + Commerce integration permissions |
| GraphQL user errors on add to cart | SKU not salable, catalog permissions, company catalog | `CHEP_DEMO_SKIP_COMPANY`, stock, shared catalog |
| Shipment **400** “couldn't be saved” on `/V1/shipment` | ACCS prefers **order ship** endpoint | Use `POST /V1/order/{id}/ship` |
| Shipment **400** `SourceCode` | MSI extension on shipment line not accepted on ACCS | Omit `source_code` on ACCS (see lib) |

**Smoke test:** `node scripts/create-joe-march-2026-brick-order.mjs --probe-rest`

---

## 10. Reusable tool checklist (for Claude Code or other automation)

Use this as a **spec** when porting to another runner:

1. **Inputs**
   - REST base URL, GraphQL URL, tenant id (from instance screen).
   - Customer credentials OR long-lived customer token for scripted checkout.
   - IMS `client_id` + `client_secret` OR static `COMMERCE_ACCESS_TOKEN`.
   - Optional: org id, store view code for `Store` header.

2. **Validate connectivity**
   - GET `/V1/store/websites` with Admin headers → **200**.

3. **Place order (GraphQL)**
   - Token → cart → items → addresses → shipping → payment → metadata → `placeOrder` → **increment_id**.

4. **Fulfillment (REST)**
   - Resolve `entity_id` by increment id.
   - POST `/V1/orders` to set `created_at` if backdating.
   - POST `/V1/order/{entity_id}/invoice` with capture.
   - POST `/V1/order/{entity_id}/ship` with items + tracks (ACCS).

5. **Idempotency / resume**
   - Persist successful increment ids to disk or DB; on failure, resume from last success.

6. **Rate limiting**
   - Sleep 500–1500 ms between orders if the tenant throttles.

7. **Logging**
   - Never log raw tokens; log increment id + HTTP status + truncated error bodies.

---

## 11. Version note

This document reflects behavior observed on an **Adobe Commerce as a Cloud Service sandbox** (`na1-sandbox.api.commerce.adobe.com`) in **April 2026**. API routes and error messages can change; always verify against the **SaaS REST reference** linked from [Commerce REST docs](https://developer.adobe.com/commerce/webapi/rest/) for your exact version.

---

## 12. File map (quick reference)

```
docs/commerce-accs-order-automation.md   ← this document
scripts/lib/accs-admin-rest.mjs          ← Admin REST helpers
scripts/batch-joe-historic-orders.mjs    ← 30-order batch
scripts/create-joe-march-2026-brick-order.mjs  ← single-order CLI + probes
.demo-order-runs/joe-batch-30-historic.json  ← last batch output (generated)
config.json                              ← GraphQL endpoint + store headers
.env                                     ← credentials (not committed)
```

When you package this as a **reusable tool**, keep the **separation**: **customer GraphQL** for cart/checkout, **Admin REST** for operational order edits and fulfillment — that mirrors how ERP-style integrations are typically structured for Adobe Commerce.
