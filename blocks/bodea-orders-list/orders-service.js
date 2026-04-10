import { CORE_FETCH_GRAPHQL } from '../../scripts/commerce.js';

const CUSTOMER_ORDERS_QUERY = `
  query GetCustomerOrders($currentPage: Int!, $pageSize: Int!) {
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
    items: (rawOrder.items ?? []).map((item) => ({
      name: item.product_name,
      sku: item.product_sku,
      qty: item.quantity_ordered,
    })),
    total: rawOrder.total?.grand_total ?? null,
    primaryEquipment: rawOrder.items?.[0]?.product_name ?? null,
  };
}

export async function fetchOrdersPage(currentPage = 1, pageSize = 10) {
  let response;

  try {
    response = await CORE_FETCH_GRAPHQL.fetchGraphQl(CUSTOMER_ORDERS_QUERY, {
      method: 'POST',
      variables: {
        currentPage,
        pageSize,
      },
    });
  } catch (err) {
    console.warn('[OrdersService] Orders network request failed:', err.message);
    return {
      customer: null,
      orders: [],
      pagination: {
        currentPage,
        pageSize,
        totalPages: 0,
        totalOrders: 0,
      },
      error: true,
    };
  }

  if (response?.errors?.length) {
    const messages = response.errors.map((error) => error.message).join('; ');
    console.warn('[OrdersService] Orders GraphQL errors:', messages);
    return {
      customer: null,
      orders: [],
      pagination: {
        currentPage,
        pageSize,
        totalPages: 0,
        totalOrders: 0,
      },
      error: true,
    };
  }

  const customer = response?.data?.customer;
  const rawOrders = customer?.orders?.items ?? [];

  return {
    customer: customer ? {
      firstname: customer.firstname ?? '',
      lastname: customer.lastname ?? '',
      email: customer.email ?? '',
    } : null,
    orders: rawOrders.map(normaliseOrder),
    pagination: {
      currentPage: customer?.orders?.page_info?.current_page ?? currentPage,
      pageSize: customer?.orders?.page_info?.page_size ?? pageSize,
      totalPages: customer?.orders?.page_info?.total_pages ?? 0,
      totalOrders: customer?.orders?.total_count ?? 0,
    },
    error: false,
  };
}
