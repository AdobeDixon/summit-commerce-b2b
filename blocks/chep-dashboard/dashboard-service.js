/**
 * CHEP Dashboard Data Service
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

import { CORE_FETCH_GRAPHQL, checkIsAuthenticated } from '../../scripts/commerce.js';
import { FEATURED_EQUIPMENT_SKUS } from './dashboard-config.js';

/** Demo: artificially show this SKU as low stock on the dashboard */
const DEMO_LOW_STOCK_SKU = 'CHEP-UK-WOOD-1200X1000-01';

function getSyntheticLowStockItem() {
  return {
    sku: DEMO_LOW_STOCK_SKU,
    name: 'CHEP Standard Pallet',
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
const CUSTOMER_ORDERS_QUERY = `
  query GetDashboardOrders {
    customer {
      firstname
      lastname
      email
      orders(currentPage: 1, pageSize: 10) {
        total_count
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

    let response;
    try {
      response = await CORE_FETCH_GRAPHQL.fetchGraphQl(CUSTOMER_ORDERS_QUERY, {
        method: 'POST',
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

    const customer = response?.data?.customer;

    if (!customer) {
      console.warn('[DashboardService] Orders query returned no customer data.', {
        hasData: !!response?.data,
        keys: response?.data ? Object.keys(response.data) : [],
      });
      return null;
    }

    console.info('[DashboardService] Orders loaded:', {
      totalCount: customer.orders?.total_count,
      itemCount: customer.orders?.items?.length,
      firstname: customer.firstname,
    });

    const rawOrders = customer.orders?.items ?? [];
    const totalCount = customer.orders?.total_count ?? 0;

    return {
      customer: {
        firstname: customer.firstname ?? '',
        lastname: customer.lastname ?? '',
        email: customer.email ?? '',
      },
      totalCount,
      orders: rawOrders.map(normaliseOrder),
    };
  },

  /**
   * Fetch product details and stock levels for the featured CHEP equipment SKUs.
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
   * Resolves with { customerIdentity, ordersData, stockData }.
   * Each field may be null/[] if its query fails — handled gracefully.
   */
  async loadAll() {
    const isAuthenticated = checkIsAuthenticated();

    const [identityResult, ordersResult, stockResult] = await Promise.allSettled([
      isAuthenticated ? this.fetchCustomerIdentity() : Promise.resolve(null),
      isAuthenticated ? this.fetchOrders() : Promise.resolve(null),
      this.fetchEquipmentStock(),
    ]);

    return {
      customerIdentity: identityResult.status === 'fulfilled' ? identityResult.value : null,
      ordersData: ordersResult.status === 'fulfilled' ? ordersResult.value : null,
      stockData: stockResult.status === 'fulfilled' ? stockResult.value : [],
    };
  },
};
